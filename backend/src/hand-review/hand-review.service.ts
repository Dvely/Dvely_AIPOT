import { Injectable } from '@nestjs/common';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { JwtUserPayload, UserRecord } from '../common/domain.types';
import { UserRole } from '../common/enums/role.enum';
import { LlmProvider } from '../common/enums/room.enum';
import { StoreService } from '../store/store.service';
import { UsersService } from '../users/users.service';
import { AnalyzeHandDto } from './dto/analyze-hand.dto';

@Injectable()
export class HandReviewService {
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

	async analyze(user: JwtUserPayload, handId: string, dto: AnalyzeHandDto) {
		const account = this.assertCanRead(user);

		const hand = this.store.getHandReview(handId, user.sub);
		const result = await this.aiService.analyzeAllHandActions({
			handId,
			handContext: hand,
			provider: dto.provider,
			model: dto.model,
			includePremiumAnalysis: dto.includePremiumAnalysis ?? true,
			language: dto.language ?? account.preferredLanguage,
		});

		const saved = result.reviews.map((review) =>
			this.store.addHandActionAnalysis({
				handId,
				userId: user.sub,
				actionOrder: review.order,
				provider: result.provider ?? dto.provider ?? LlmProvider.LOCAL,
				model: result.model ?? dto.model ?? 'local-default',
				analysis: review.analysis,
			}),
		);

		return {
			handId,
			provider: result.provider,
			model: result.model,
			summary: result.summary,
			actions: saved.map((item) => ({
				order: item.actionOrder,
				analysis: item.analysis,
				createdAt: item.createdAt,
			})),
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

		const result = await this.aiService.analyzeHandReview({
			handId,
			handContext: {
				...hand,
				focusAction: targetAction,
			},
			provider: dto.provider,
			model: dto.model,
			includePremiumAnalysis: dto.includePremiumAnalysis ?? true,
			language: dto.language ?? account.preferredLanguage,
		});

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
