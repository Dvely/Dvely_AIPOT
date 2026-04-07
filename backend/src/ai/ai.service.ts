import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AiBotDecision } from '../common/domain.types';
import { UserRole } from '../common/enums/role.enum';
import { ActionType, BotModelTier, LlmProvider } from '../common/enums/room.enum';
import { BotActionRequestDto } from './dto/bot-action-request.dto';
import { HandReviewRequestDto } from './dto/hand-review-request.dto';

const BOT_PROVIDER_TIMEOUT_MS = 4000;
const REVIEW_PROVIDER_TIMEOUT_MS = 20000;

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

	async generateBotAction(dto: BotActionRequestDto, role: UserRole) {
		const modelTier = dto.modelTier ?? BotModelTier.FREE;
		if (modelTier === BotModelTier.PAID && role !== UserRole.PRO) {
			throw new ForbiddenException('PRO 권한만 유료 AI 모델을 사용할 수 있습니다.');
		}

		const provider = dto.provider ?? LlmProvider.LOCAL;
		const model = this.providerModel(provider, dto.model);
		const style = dto.playStyle ?? 'balanced';

		const systemPrompt = [
			'You are AIPOT poker bot engine.',
			'You must decide the next action using ONLY provided cumulative state.',
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

		const systemPrompt = [
			'You are AIPOT hand review analyzer.',
			'Use timeline, board, actions to produce strategic feedback.',
			'Output concise markdown with sections:',
			'1) Key Mistakes',
			'2) Better Lines',
			'3) Exploit Notes',
			premium ? '4) GTO-Style Deep Notes' : '4) Basic Improvement Plan',
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
			analysis = [
				'1) Key Mistakes',
				'- LLM 응답 지연으로 상세 분석을 생성하지 못했습니다.',
				'2) Better Lines',
				'- 현재 액션 로그 기준으로 포지션/팟오즈 중심 재검토를 권장합니다.',
				'3) Exploit Notes',
				'- 다음 시도에서 모델/프롬프트를 유지하고 재분석해 비교하세요.',
				premium ? '4) GTO-Style Deep Notes' : '4) Basic Improvement Plan',
				'- 타임아웃으로 심화 분석이 생략되었습니다.',
			].join('\n');
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
				summary: '분석할 액션 로그가 없습니다.',
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
					: '핸드 전체 액션 평가가 생성되었습니다.';

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

				const chunks: string[] = [];
				if (analysis) chunks.push(analysis);
				if (betterLine) chunks.push(`Better line: ${betterLine}`);
				if (verdict || Number.isFinite(score)) {
					const scoreLabel = Number.isFinite(score) ? ` (${score})` : '';
					chunks.push(`Verdict: ${verdict || 'neutral'}${scoreLabel}`);
				}

				byOrder.set(
					order,
					chunks.join('\n').trim() || '해당 액션에 대한 상세 텍스트가 제공되지 않았습니다.',
				);
			}

			const reviews = actions.map((action) => ({
				order: action.order,
				analysis:
					byOrder.get(action.order) ??
					`Action #${action.order}: ${action.action.toUpperCase()} / ${action.street} - 기본 리뷰를 생성했습니다.`,
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
				summary: 'LLM 응답 지연으로 폴백 리뷰를 생성했습니다.',
				reviews: actions.map((action) => ({
					order: action.order,
					analysis: `Action #${action.order}: ${action.action.toUpperCase()} / ${action.street} - 타임아웃으로 상세 분석을 생성하지 못했습니다.`,
				})),
			};
		}
	}
}
