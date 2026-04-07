import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AiBotDecision } from '../common/domain.types';
import { PreferredLanguage } from '../common/enums/language.enum';
import { UserRole } from '../common/enums/role.enum';
import { ActionType, BotModelTier, LlmProvider } from '../common/enums/room.enum';
import { BotActionRequestDto } from './dto/bot-action-request.dto';
import { HandReviewRequestDto } from './dto/hand-review-request.dto';

const BOT_PROVIDER_TIMEOUT_MS = 5000;
const REVIEW_PROVIDER_TIMEOUT_MS = 10000;

@Injectable()
export class AiService {
	constructor(
		private readonly configService: ConfigService,
		private readonly httpService: HttpService,
	) {}

	private extractJson(raw: string): Record<string, unknown> | null {
		const trimmed = raw.trim();
		try {
			return JSON.parse(trimmed) as Record<string, unknown>;
		} catch {
			// no-op
		}

		const start = trimmed.indexOf('{');
		const end = trimmed.lastIndexOf('}');
		if (start === -1 || end === -1 || end <= start) return null;

		const candidate = trimmed.slice(start, end + 1);
		try {
			return JSON.parse(candidate) as Record<string, unknown>;
		} catch {
			return null;
		}
	}

	private defaultBotDecision(): AiBotDecision {
		return {
			action: ActionType.CHECK,
			amount: 0,
			reason: '기본 정책: 체크 가능 시 체크',
			confidence: 0.4,
		};
	}

	private normalizeDecision(parsed: Record<string, unknown> | null): AiBotDecision {
		if (!parsed) return this.defaultBotDecision();

		const actionRaw = String(parsed.action ?? '').toLowerCase();
		const allowed: ActionType[] = [
			ActionType.FOLD,
			ActionType.CHECK,
			ActionType.CALL,
			ActionType.BET,
			ActionType.RAISE,
			ActionType.ALL_IN,
		];
		const action = allowed.includes(actionRaw as ActionType)
			? (actionRaw as ActionType)
			: ActionType.CHECK;

		const amount = Number(parsed.amount ?? 0);
		const confidence = Number(parsed.confidence ?? 0.5);

		return {
			action,
			amount: Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0,
			reason: String(parsed.reason ?? 'LLM 응답'),
			confidence:
				Number.isFinite(confidence) && confidence >= 0 && confidence <= 1
					? confidence
					: 0.5,
		};
	}

	private providerModel(provider: LlmProvider, model?: string): string {
		if (model) return model;

		if (provider === LlmProvider.OPENAI) {
			return this.configService.get('OPENAI_MODEL', 'gpt-4.1-mini');
		}
		if (provider === LlmProvider.CLAUDE) {
			return this.configService.get('ANTHROPIC_MODEL', 'claude-3-5-sonnet-latest');
		}
		if (provider === LlmProvider.GEMINI) {
			return this.configService.get('GEMINI_MODEL', 'gemini-1.5-pro');
		}
		return this.configService.get('LOCAL_LLM_MODEL', 'qwen2.5-coder:3b');
	}

	private normalizeLanguage(language?: PreferredLanguage): PreferredLanguage {
		if (language === PreferredLanguage.KO || language === PreferredLanguage.JA) {
			return language;
		}
		return PreferredLanguage.EN;
	}

	private localizedText(
		language: PreferredLanguage,
		text: { en: string; ko: string; ja: string },
	): string {
		if (language === PreferredLanguage.KO) return text.ko;
		if (language === PreferredLanguage.JA) return text.ja;
		return text.en;
	}

	private languageInstruction(language: PreferredLanguage): string {
		const label = this.localizedText(language, {
			en: 'English',
			ko: 'Korean',
			ja: 'Japanese',
		});
		return `All user-facing text must be written in ${label} (${language}).`;
	}

	private handReviewFallback(language: PreferredLanguage, premium: boolean): string {
		if (language === PreferredLanguage.KO) {
			return [
				'1) 핵심 실수',
				'- LLM 응답 지연으로 상세 분석을 생성하지 못했습니다.',
				'2) 더 나은 라인',
				'- 현재 액션 로그 기준으로 포지션/팟오즈 중심 재검토를 권장합니다.',
				'3) 익스플로잇 노트',
				'- 다음 시도에서 동일 모델/프롬프트로 재분석해 비교하세요.',
				premium ? '4) GTO 스타일 심화 노트' : '4) 기본 개선 계획',
				'- 타임아웃으로 심화 분석이 생략되었습니다.',
			].join('\n');
		}

		if (language === PreferredLanguage.JA) {
			return [
				'1) 主要なミス',
				'- LLMの応答遅延により詳細分析を生成できませんでした。',
				'2) より良いライン',
				'- 現在のアクションログを基に、ポジションとポットオッズ中心で再検討してください。',
				'3) エクスプロイトノート',
				'- 次回は同じモデル/プロンプトで再分析し、結果を比較してください。',
				premium ? '4) GTOスタイル詳細ノート' : '4) 基本改善プラン',
				'- タイムアウトにより詳細分析は省略されました。',
			].join('\n');
		}

		return [
			'1) Key Mistakes',
			'- Detailed analysis could not be generated due to LLM timeout.',
			'2) Better Lines',
			'- Re-evaluate this hand with stronger focus on position and pot odds.',
			'3) Exploit Notes',
			'- Retry with the same model/prompt and compare differences.',
			premium ? '4) GTO-Style Deep Notes' : '4) Basic Improvement Plan',
			'- Deep analysis was skipped due to timeout.',
		].join('\n');
	}

	private async callOpenAICompatible(options: {
		baseUrl: string;
		apiKey?: string;
		model: string;
		systemPrompt: string;
		userPrompt: string;
		timeoutMs?: number;
	}): Promise<string> {
		const endpoint = `${options.baseUrl.replace(/\/$/, '')}/chat/completions`;
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
		};
		if (options.apiKey) {
			headers.Authorization = `Bearer ${options.apiKey}`;
		}

		const response = await firstValueFrom(
			this.httpService.post(
				endpoint,
				{
					model: options.model,
					temperature: 0.2,
					response_format: { type: 'json_object' },
					messages: [
						{ role: 'system', content: options.systemPrompt },
						{ role: 'user', content: options.userPrompt },
					],
				},
				{ headers, timeout: options.timeoutMs ?? BOT_PROVIDER_TIMEOUT_MS },
			),
		);

		return (
			response.data?.choices?.[0]?.message?.content ??
			JSON.stringify(this.defaultBotDecision())
		);
	}

	private async callClaude(options: {
		model: string;
		systemPrompt: string;
		userPrompt: string;
		timeoutMs?: number;
	}): Promise<string> {
		const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
		if (!apiKey) {
			return JSON.stringify(this.defaultBotDecision());
		}

		const response = await firstValueFrom(
			this.httpService.post(
				'https://api.anthropic.com/v1/messages',
				{
					model: options.model,
					max_tokens: 512,
					temperature: 0.2,
					system: options.systemPrompt,
					messages: [{ role: 'user', content: options.userPrompt }],
				},
				{
					timeout: options.timeoutMs ?? BOT_PROVIDER_TIMEOUT_MS,
					headers: {
						'Content-Type': 'application/json',
						'x-api-key': apiKey,
						'anthropic-version': '2023-06-01',
					},
				},
			),
		);

		return (
			response.data?.content?.[0]?.text ?? JSON.stringify(this.defaultBotDecision())
		);
	}

	private async callGemini(options: {
		model: string;
		systemPrompt: string;
		userPrompt: string;
		timeoutMs?: number;
	}): Promise<string> {
		const apiKey = this.configService.get<string>('GEMINI_API_KEY');
		if (!apiKey) {
			return JSON.stringify(this.defaultBotDecision());
		}

		const url = `https://generativelanguage.googleapis.com/v1beta/models/${options.model}:generateContent?key=${apiKey}`;
		const response = await firstValueFrom(
			this.httpService.post(
				url,
				{
					contents: [
						{
							role: 'user',
							parts: [
								{
									text: `${options.systemPrompt}\n\n${options.userPrompt}`,
								},
							],
						},
					],
					generationConfig: {
						temperature: 0.2,
						responseMimeType: 'application/json',
					},
				},
				{ timeout: options.timeoutMs ?? BOT_PROVIDER_TIMEOUT_MS },
			),
		);

		return (
			response.data?.candidates?.[0]?.content?.parts?.[0]?.text ??
			JSON.stringify(this.defaultBotDecision())
		);
	}

	private async runProvider(options: {
		provider: LlmProvider;
		model: string;
		systemPrompt: string;
		userPrompt: string;
		timeoutMs?: number;
	}): Promise<string> {
		if (options.provider === LlmProvider.OPENAI) {
			const base = this.configService.get('OPENAI_BASE_URL', 'https://api.openai.com/v1');
			const apiKey = this.configService.get<string>('OPENAI_API_KEY');
			if (!apiKey) {
				return JSON.stringify(this.defaultBotDecision());
			}
			return this.callOpenAICompatible({
				baseUrl: base,
				apiKey,
				model: options.model,
				systemPrompt: options.systemPrompt,
				userPrompt: options.userPrompt,
				timeoutMs: options.timeoutMs,
			});
		}

		if (options.provider === LlmProvider.CLAUDE) {
			return this.callClaude({
				model: options.model,
				systemPrompt: options.systemPrompt,
				userPrompt: options.userPrompt,
				timeoutMs: options.timeoutMs,
			});
		}

		if (options.provider === LlmProvider.GEMINI) {
			return this.callGemini({
				model: options.model,
				systemPrompt: options.systemPrompt,
				userPrompt: options.userPrompt,
				timeoutMs: options.timeoutMs,
			});
		}

		const localBase = this.configService.get(
			'LOCAL_LLM_BASE_URL',
			'http://127.0.0.1:8000/v1',
		);
		const localKey = this.configService.get<string>('LOCAL_LLM_API_KEY');
		return this.callOpenAICompatible({
			baseUrl: localBase,
			apiKey: localKey,
			model: options.model,
			systemPrompt: options.systemPrompt,
			userPrompt: options.userPrompt,
			timeoutMs: options.timeoutMs,
		});
	}

	private customRandomDecision(dto: BotActionRequestDto): AiBotDecision {
		const asRecord = (value: unknown): Record<string, unknown> => {
			if (!value || typeof value !== 'object') return {};
			return value as Record<string, unknown>;
		};

		const decisionContext = asRecord(dto.context.decisionContext);
		const actor = asRecord(decisionContext.actorSnapshot);
		const table = asRecord(decisionContext.tableSummary);

		const style = dto.playStyle ?? 'balanced';
		const stackAmount = Math.max(0, Number(actor.stackAmount ?? 0));
		const toCall = Math.max(0, Number(actor.toCallAmount ?? 0));
		const currentBetAmount = Math.max(0, Number(actor.currentBetAmount ?? 0));
		const minRaiseTo = Math.max(0, Number(actor.minRaiseTo ?? 0));
		const maxBetAmount = Math.max(0, Number(actor.maxBetAmount ?? 0));
		const potAmount = Math.max(0, Number(table.potAmount ?? 0));
		const bigBlind = Math.max(1, Number(table.blindBig ?? 1));

		const maxTotalBet = currentBetAmount + stackAmount;
		const canBet = toCall <= 0 && stackAmount > 0;
		const canRaise = toCall > 0 && maxTotalBet > minRaiseTo;
		const roll = Math.random();

		const betChance =
			style === 'aggressive' ? 0.52 : style === 'tight' ? 0.16 : 0.31;
		const raiseChance =
			style === 'aggressive' ? 0.44 : style === 'tight' ? 0.12 : 0.24;
		const callChance =
			style === 'aggressive' ? 0.78 : style === 'tight' ? 0.42 : 0.62;

		if (canBet && roll < betChance) {
			const sizingCandidates = [0.33, 0.5, 0.66, 0.8, 1.0, 1.25];
			const ratio = sizingCandidates[Math.floor(Math.random() * sizingCandidates.length)];
			const rawBet = Math.max(bigBlind, Math.floor(Math.max(potAmount, bigBlind) * ratio));
			const betAmount = Math.min(rawBet, stackAmount);

			if (betAmount >= stackAmount) {
				return {
					action: ActionType.ALL_IN,
					amount: stackAmount,
					reason: 'custom-rng model: random value-bet/jam decision',
					confidence: 0.55,
				};
			}

			return {
				action: ActionType.BET,
				amount: betAmount,
				reason: 'custom-rng model: pot-ratio random c-bet',
				confidence: 0.58,
			};
		}

		if (canRaise && roll < raiseChance) {
			const raiseRatios = [0.5, 0.75, 1.0, 1.25, 1.5];
			const ratio = raiseRatios[Math.floor(Math.random() * raiseRatios.length)];
			const baseTarget = maxBetAmount + Math.floor(Math.max(potAmount, bigBlind) * ratio);
			const raiseTo = Math.max(minRaiseTo, Math.min(baseTarget, maxTotalBet));

			if (raiseTo >= maxTotalBet) {
				return {
					action: ActionType.ALL_IN,
					amount: stackAmount,
					reason: 'custom-rng model: random pressure jam',
					confidence: 0.53,
				};
			}

			return {
				action: ActionType.RAISE,
				amount: raiseTo,
				reason: 'custom-rng model: pot-based random raise',
				confidence: 0.57,
			};
		}

		if (toCall <= 0) {
			return {
				action: ActionType.CHECK,
				amount: 0,
				reason: 'custom-rng model: check branch selected',
				confidence: 0.5,
			};
		}

		const stackPressure = stackAmount > 0 ? toCall / stackAmount : 1;
		const effectiveCallChance =
			stackPressure > 0.5
				? callChance * 0.45
				: stackPressure > 0.25
					? callChance * 0.7
					: callChance;

		if (roll < effectiveCallChance) {
			if (toCall >= stackAmount) {
				return {
					action: ActionType.ALL_IN,
					amount: stackAmount,
					reason: 'custom-rng model: forced all-in call',
					confidence: 0.51,
				};
			}

			return {
				action: ActionType.CALL,
				amount: toCall,
				reason: 'custom-rng model: random call branch',
				confidence: 0.54,
			};
		}

		return {
			action: ActionType.FOLD,
			amount: 0,
			reason: 'custom-rng model: random fold branch',
			confidence: 0.56,
		};
	}

	async generateBotAction(dto: BotActionRequestDto, role: UserRole) {
		const modelTier = dto.modelTier ?? BotModelTier.FREE;
		if (modelTier === BotModelTier.PAID && role !== UserRole.PRO) {
			throw new ForbiddenException('PRO 권한만 유료 AI 모델을 사용할 수 있습니다.');
		}

		if (modelTier === BotModelTier.RANDOM) {
			const decision = this.customRandomDecision(dto);
			const provider = dto.provider ?? LlmProvider.LOCAL;
			const model = dto.model ?? 'custom-rng-v1';
			return {
				provider,
				model,
				decision,
				raw: JSON.stringify(decision),
			};
		}

		const provider = dto.provider ?? LlmProvider.LOCAL;
		const model = this.providerModel(provider, dto.model);
		const style = dto.playStyle ?? 'balanced';

		const systemPrompt = [
			'You are AIPOT poker bot engine for No-Limit Texas Hold\'em.',
			'You must decide the next action using ONLY provided cumulative state.',
			'Use context.decisionContext.actorSnapshot first: stack, toCall, minRaiseTo, position, and own holeCards.',
			'Use context.decisionContext.previousActionsThisStreet to understand only prior actions in this turn sequence.',
			'Use pot-based sizing and pot ratios when selecting bet/raise amounts.',
			'Avoid always-passive play; include balanced aggression and occasional bluff/semi-bluff when strategically justified.',
			'Available actions are fold, check, call, bet, raise, all-in. Choose bet/raise when pressure is strategically valid.',
			'Never invent hidden cards.',
			'Return strict JSON only.',
			'Schema: {"action":"fold|check|call|bet|raise|all-in","amount":number,"reason":string,"confidence":0-1}',
			`Bot style: ${style}`,
		].join(' ');

		const userPrompt = JSON.stringify(
			{
				roomId: dto.roomId,
				handId: dto.handId,
				seatId: dto.seatId,
				modelTier,
				context: dto.context,
			},
			null,
			2,
		);

		const raw = await this.runProvider({
			provider,
			model,
			systemPrompt,
			userPrompt,
		});
		const parsed = this.extractJson(raw);

		return {
			provider,
			model,
			decision: this.normalizeDecision(parsed),
			raw,
		};
	}

	async analyzeHandReview(dto: HandReviewRequestDto) {
		const provider = dto.provider ?? LlmProvider.LOCAL;
		const model = this.providerModel(provider, dto.model);
		const premium = dto.includePremiumAnalysis ?? true;
		const language = this.normalizeLanguage(dto.language);

		const systemPrompt = [
			'You are AIPOT hand review analyzer.',
			'Use timeline, board, actions to produce strategic feedback.',
			'Output concise markdown with sections:',
			'1) Key Mistakes',
			'2) Better Lines',
			'3) Exploit Notes',
			premium ? '4) GTO-Style Deep Notes' : '4) Basic Improvement Plan',
			this.languageInstruction(language),
		].join(' ');

		const userPrompt = JSON.stringify(
			{
				handId: dto.handId,
				handContext: dto.handContext,
				includePremiumAnalysis: premium,
			},
			null,
			2,
		);

		let analysis = '';
		try {
			analysis = await this.runProvider({
				provider,
				model,
				systemPrompt,
				userPrompt,
				timeoutMs: REVIEW_PROVIDER_TIMEOUT_MS,
			});
		} catch {
			analysis = this.handReviewFallback(language, premium);
		}

		return {
			provider,
			model,
			analysis,
		};
	}

	async analyzeAllHandActions(dto: HandReviewRequestDto) {
		const provider = dto.provider ?? LlmProvider.LOCAL;
		const model = this.providerModel(provider, dto.model);
		const premium = dto.includePremiumAnalysis ?? true;
		const language = this.normalizeLanguage(dto.language);

		const context = dto.handContext as {
			participants?: Array<{ seatId?: number; displayName?: string; roleType?: string }>;
			boardCards?: string[];
			actions?: Array<{
				order?: number;
				seatId?: number;
				playerId?: string;
				action?: string;
				amount?: number;
				potAfter?: number;
				street?: string;
			}>;
		};

		const participants = (context.participants ?? []).map((participant) => ({
			seatId: participant.seatId ?? 0,
			displayName: participant.displayName ?? 'Unknown',
			roleType: participant.roleType ?? 'unknown',
		}));

		const actions = (context.actions ?? [])
			.filter((action) => Number.isInteger(action.order) && (action.order ?? 0) > 0)
			.map((action) => ({
				order: action.order as number,
				seatId: action.seatId ?? 0,
				playerId: action.playerId ?? '',
				action: action.action ?? 'unknown',
				amount: action.amount ?? 0,
				potAfter: action.potAfter ?? 0,
				street: action.street ?? 'UNKNOWN',
			}));

		if (actions.length === 0) {
			return {
				provider,
				model,
				summary: this.localizedText(language, {
					en: 'No action logs available to analyze.',
					ko: '분석할 액션 로그가 없습니다.',
					ja: '分析するアクションログがありません。',
				}),
				reviews: [] as Array<{ order: number; analysis: string }>,
			};
		}

		const systemPrompt = [
			'You are AIPOT action-by-action poker reviewer.',
			'Evaluate each action order in the provided hand.',
			'Return strict JSON only.',
			'Schema: {"summary":string,"actions":[{"order":number,"analysis":string,"verdict":"good|neutral|bad","score":-5..5,"betterLine":string}]}',
			'If uncertain, still provide concise feedback per action order.',
			premium ? 'Include deeper tactical notes in analysis text.' : 'Keep analysis practical and concise.',
			this.languageInstruction(language),
		].join(' ');

		const userPrompt = JSON.stringify(
			{
				handId: dto.handId,
				boardCards: context.boardCards ?? [],
				participants,
				actions,
			},
			null,
			2,
		);

		try {
			const raw = await this.runProvider({
				provider,
				model,
				systemPrompt,
				userPrompt,
				timeoutMs: REVIEW_PROVIDER_TIMEOUT_MS,
			});

			const parsed = this.extractJson(raw);
			const summary =
				typeof parsed?.summary === 'string' && parsed.summary.trim().length > 0
					? parsed.summary.trim()
					: this.localizedText(language, {
						en: 'Hand-wide action review has been generated.',
						ko: '핸드 전체 액션 평가가 생성되었습니다.',
						ja: 'ハンド全体のアクション評価を生成しました。',
					});

			const parsedActions = Array.isArray(parsed?.actions)
				? (parsed.actions as Array<Record<string, unknown>>)
				: [];
			const byOrder = new Map<number, string>();

			for (const item of parsedActions) {
				const order = Number(item.order ?? NaN);
				if (!Number.isInteger(order) || order < 1) continue;

				const analysis = String(item.analysis ?? '').trim();
				const verdict = String(item.verdict ?? '').trim();
				const score = Number(item.score ?? NaN);
				const betterLine = String(item.betterLine ?? '').trim();
				const betterLineLabel = this.localizedText(language, {
					en: 'Better line',
					ko: '더 나은 라인',
					ja: 'より良いライン',
				});
				const verdictLabel = this.localizedText(language, {
					en: 'Verdict',
					ko: '평가',
					ja: '評価',
				});
				const neutralText = this.localizedText(language, {
					en: 'neutral',
					ko: '중립',
					ja: '中立',
				});

				const chunks: string[] = [];
				if (analysis) chunks.push(analysis);
				if (betterLine) chunks.push(`${betterLineLabel}: ${betterLine}`);
				if (verdict || Number.isFinite(score)) {
					const scoreLabel = Number.isFinite(score) ? ` (${score})` : '';
					chunks.push(`${verdictLabel}: ${verdict || neutralText}${scoreLabel}`);
				}

				byOrder.set(
					order,
					chunks.join('\n').trim() ||
						this.localizedText(language, {
							en: 'No detailed text was provided for this action.',
							ko: '해당 액션에 대한 상세 텍스트가 제공되지 않았습니다.',
							ja: 'このアクションに対する詳細テキストは提供されませんでした。',
						}),
				);
			}

			const reviews = actions.map((action) => ({
				order: action.order,
				analysis:
					byOrder.get(action.order) ??
					this.localizedText(language, {
						en: `Action #${action.order}: ${action.action.toUpperCase()} / ${action.street} - Generated a default review.`,
						ko: `액션 #${action.order}: ${action.action.toUpperCase()} / ${action.street} - 기본 리뷰를 생성했습니다.`,
						ja: `アクション #${action.order}: ${action.action.toUpperCase()} / ${action.street} - デフォルトレビューを生成しました。`,
					}),
			}));

			return {
				provider,
				model,
				summary,
				reviews,
			};
		} catch {
			return {
				provider,
				model,
				summary: this.localizedText(language, {
					en: 'Generated fallback reviews due to LLM timeout.',
					ko: 'LLM 응답 지연으로 폴백 리뷰를 생성했습니다.',
					ja: 'LLMの応答遅延によりフォールバックレビューを生成しました。',
				}),
				reviews: actions.map((action) => ({
					order: action.order,
					analysis: this.localizedText(language, {
						en: `Action #${action.order}: ${action.action.toUpperCase()} / ${action.street} - Detailed analysis could not be generated due to timeout.`,
						ko: `액션 #${action.order}: ${action.action.toUpperCase()} / ${action.street} - 타임아웃으로 상세 분석을 생성하지 못했습니다.`,
						ja: `アクション #${action.order}: ${action.action.toUpperCase()} / ${action.street} - タイムアウトにより詳細分析を生成できませんでした。`,
					}),
				})),
			};
		}
	}
}
