import { randomUUID } from 'node:crypto';
import {
	BadRequestException,
	ForbiddenException,
	Injectable,
	Logger,
} from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import {
	HandReviewAnalyzeJob,
	JwtUserPayload,
	UserRecord,
} from '../common/domain.types';
import { PreferredLanguage } from '../common/enums/language.enum';
import { UserRole } from '../common/enums/role.enum';
import { LlmProvider } from '../common/enums/room.enum';
import { StoreService } from '../store/store.service';
import { UsersService } from '../users/users.service';
import { AnalyzeHandDto } from './dto/analyze-hand.dto';

@Injectable()
export class HandReviewService {
	private readonly logger = new Logger(HandReviewService.name);

	constructor(
		private readonly store: StoreService,
		private readonly aiService: AiService,
		private readonly usersService: UsersService,
	) {}

	private assertCanRead(user: JwtUserPayload): UserRecord {
		if (user.guest || user.role === UserRole.GUEST) {
			throw new ForbiddenException('Guest는 Hand Review를 사용할 수 없습니다.');
		}

		const account = this.usersService.findById(user.sub);
		if (!account || account.role !== UserRole.PRO) {
			throw new ForbiddenException('Hand Review는 PRO 권한이 필요합니다.');
		}

		return account;
	}

	private localizedText(
		language: PreferredLanguage,
		text: { en: string; ko: string; ja: string },
	): string {
		if (language === PreferredLanguage.KO) return text.ko;
		if (language === PreferredLanguage.JA) return text.ja;
		return text.en;
	}

	listHands(user: JwtUserPayload) {
		this.assertCanRead(user);
		return this.store.listHandReviews(user.sub);
	}

	listFavorites(user: JwtUserPayload) {
		this.assertCanRead(user);
		return this.store.listFavoriteHandReviews(user.sub);
	}

	getHand(user: JwtUserPayload, handId: string) {
		this.assertCanRead(user);
		return this.store.getHandReview(handId, user.sub);
	}

	setFavorite(user: JwtUserPayload, handId: string, favorite: boolean) {
		this.assertCanRead(user);
		const review = this.store.setHandReviewFavorite(handId, user.sub, favorite);
		return {
			handId,
			favorite: (review.favoriteUserIds ?? []).includes(user.sub),
		};
	}

	getAnalyzeStatus(user: JwtUserPayload, handId: string) {
		const account = this.assertCanRead(user);
		this.store.getHandReview(handId, user.sub);

		const job = this.store.getHandReviewAnalyzeJob(handId, user.sub);
		if (!job) {
			return {
				handId,
				status: 'idle' as const,
				message: this.localizedText(account.preferredLanguage, {
					en: 'No hand analysis job is running.',
					ko: '현재 실행 중인 핸드 분석 작업이 없습니다.',
					ja: '現在実行中のハンド分析ジョブはありません。',
				}),
			};
		}

		return {
			handId,
			...job,
		};
	}

	private async runQueuedAnalyzeJob(params: {
		handId: string;
		userId: string;
		provider: LlmProvider;
		model: string;
		includePremiumAnalysis: boolean;
		language: PreferredLanguage;
		requestId: string;
		requestedAt: string;
	}) {
		const runningAt = new Date().toISOString();
		const runningJob: HandReviewAnalyzeJob = {
			requestId: params.requestId,
			status: 'running',
			requestedByUserId: params.userId,
			provider: params.provider,
			model: params.model,
			includePremiumAnalysis: params.includePremiumAnalysis,
			language: params.language,
			requestedAt: params.requestedAt,
			startedAt: runningAt,
			message: this.localizedText(params.language, {
				en: 'Analysis is running in the background.',
				ko: '분석이 백그라운드에서 진행 중입니다.',
				ja: '分析はバックグラウンドで進行中です。',
			}),
		};
		this.store.setHandReviewAnalyzeJob({
			handId: params.handId,
			userId: params.userId,
			job: runningJob,
		});

		try {
			const hand = this.store.getHandReview(params.handId, params.userId);
			const result = await this.aiService.analyzeAllHandActions({
				handId: params.handId,
				handContext: hand,
				provider: params.provider,
				model: params.model,
				includePremiumAnalysis: params.includePremiumAnalysis,
				language: params.language,
				heroUserId: params.userId,
			});

			for (const review of result.reviews) {
				this.store.addHandActionAnalysis({
					handId: params.handId,
					userId: params.userId,
					actionOrder: review.order,
					provider: result.provider ?? params.provider,
					model: result.model ?? params.model,
					analysis: review.analysis,
					evBb: review.evBb,
					heroEquity: review.heroEquity,
					gtoMix: review.gtoMix,
				});
			}

			const finishedAt = new Date().toISOString();
			const completedJob: HandReviewAnalyzeJob = {
				...runningJob,
				provider: result.provider ?? params.provider,
				model: result.model ?? params.model,
				status: 'completed',
				finishedAt,
				summary: result.summary,
				message: this.localizedText(params.language, {
					en: 'Hand analysis is complete. You can view the saved result anytime.',
					ko: '핸드 분석이 완료되었습니다. 저장된 결과를 언제든 확인할 수 있습니다.',
					ja: 'ハンド分析が完了しました。保存された結果はいつでも確認できます。',
				}),
			};
			this.store.setHandReviewAnalyzeJob({
				handId: params.handId,
				userId: params.userId,
				job: completedJob,
			});
		} catch (error) {
			this.logger.warn(
				`Hand analyze job failed. handId=${params.handId} requestId=${params.requestId}`,
				error instanceof Error ? error.stack : undefined,
			);
			const reason = error instanceof Error ? error.message : 'Unknown error';
			const reasonSuffix = reason ? ` (${reason.slice(0, 120)})` : '';
			const finishedAt = new Date().toISOString();
			const failedJob: HandReviewAnalyzeJob = {
				...runningJob,
				status: 'failed',
				finishedAt,
				message: this.localizedText(params.language, {
					en: `Background hand analysis failed. Please try again.${reasonSuffix}`,
					ko: `백그라운드 핸드 분석에 실패했습니다. 다시 시도해 주세요.${reasonSuffix}`,
					ja: `バックグラウンドのハンド分析に失敗しました。再試行してください。${reasonSuffix}`,
				}),
			};
			this.store.setHandReviewAnalyzeJob({
				handId: params.handId,
				userId: params.userId,
				job: failedJob,
			});
		}
	}

	async analyze(user: JwtUserPayload, handId: string, dto: AnalyzeHandDto) {
		const account = this.assertCanRead(user);
		this.store.getHandReview(handId, user.sub);

		const existingJob = this.store.getHandReviewAnalyzeJob(handId, user.sub);
		if (existingJob && (existingJob.status === 'pending' || existingJob.status === 'running')) {
			return {
				handId,
				requestId: existingJob.requestId,
				status: 'already-running' as const,
				message:
					existingJob.message ??
					this.localizedText(account.preferredLanguage, {
						en: 'Analysis is already running in the background.',
						ko: '이미 분석이 백그라운드에서 진행 중입니다.',
						ja: '分析はすでにバックグラウンドで実行中です。',
					}),
			};
		}

		const provider = dto.provider ?? LlmProvider.LOCAL;
		const model = dto.model ?? 'local-default';
		const includePremiumAnalysis = dto.includePremiumAnalysis ?? true;
		const language = dto.language ?? account.preferredLanguage;
		const requestId = randomUUID();
		const requestedAt = new Date().toISOString();

		const queuedJob: HandReviewAnalyzeJob = {
			requestId,
			status: 'pending',
			requestedByUserId: user.sub,
			provider,
			model,
			includePremiumAnalysis,
			language,
			requestedAt,
			message: this.localizedText(language, {
				en: 'Analysis request accepted. It will continue in the background.',
				ko: '분석 요청이 접수되었습니다. 백그라운드에서 계속 진행됩니다.',
				ja: '分析リクエストを受け付けました。バックグラウンドで継続します。',
			}),
		};
		this.store.setHandReviewAnalyzeJob({
			handId,
			userId: user.sub,
			job: queuedJob,
		});

		void this.runQueuedAnalyzeJob({
			handId,
			userId: user.sub,
			provider,
			model,
			includePremiumAnalysis,
			language,
			requestId,
			requestedAt,
		});

		return {
			handId,
			requestId,
			status: 'queued' as const,
			message: queuedJob.message,
		};
	}

	async analyzeAction(
		user: JwtUserPayload,
		handId: string,
		actionOrder: number,
		dto: AnalyzeHandDto,
	) {
		const account = this.assertCanRead(user);
		if (!Number.isInteger(actionOrder) || actionOrder < 1) {
			throw new BadRequestException('actionOrder는 1 이상의 정수여야 합니다.');
		}

		const hand = this.store.getHandReview(handId, user.sub);
		const targetAction = hand.actions.find((action) => action.order === actionOrder);
		if (!targetAction) {
			throw new BadRequestException('해당 액션 로그를 찾을 수 없습니다.');
		}

		const language = dto.language ?? account.preferredLanguage;
		const fallback = {
			provider: dto.provider ?? LlmProvider.LOCAL,
			model: dto.model ?? 'fallback-local',
			analysis: this.localizedText(language, {
				en: `Action #${actionOrder}: fallback analysis generated due to timeout.`,
				ko: `액션 #${actionOrder}: 타임아웃으로 폴백 분석을 생성했습니다.`,
				ja: `アクション #${actionOrder}: タイムアウトによりフォールバック分析を生成しました。`,
			}),
		};

		let result = fallback;
		try {
			result = await this.aiService.analyzeHandReview({
				handId,
				handContext: {
					...hand,
					focusAction: targetAction,
				},
				provider: dto.provider,
				model: dto.model,
				includePremiumAnalysis: dto.includePremiumAnalysis ?? true,
				language,
			});
		} catch {
			result = fallback;
		}

		const saved = this.store.addHandActionAnalysis({
			handId,
			userId: user.sub,
			actionOrder,
			provider: result.provider ?? dto.provider ?? LlmProvider.LOCAL,
			model: result.model ?? dto.model ?? 'local-default',
			analysis: result.analysis,
		});

		return {
			handId,
			actionOrder,
			provider: saved.provider,
			model: saved.model,
			analysis: saved.analysis,
			createdAt: saved.createdAt,
		};
	}
}
