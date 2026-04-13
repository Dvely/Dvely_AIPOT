import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AiBotDecision, GtoActionMix } from '../common/domain.types';
import { PreferredLanguage } from '../common/enums/language.enum';
import { UserRole } from '../common/enums/role.enum';
import { ActionType, BotModelTier, LlmProvider } from '../common/enums/room.enum';
import { BotActionRequestDto } from './dto/bot-action-request.dto';
import { HandReviewRequestDto } from './dto/hand-review-request.dto';

const BOT_PROVIDER_TIMEOUT_MS = 5000;

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

	private strictLanguageInstruction(language: PreferredLanguage): string {
		if (language === PreferredLanguage.KO) {
			return [
				'Output language must be Korean only.',
				'Do not mix English or Japanese sentences.',
				'Use Korean for poker actions (check/call/fold/raise/all-in -> 체크/콜/폴드/레이즈/올인).',
				'Only keep technical acronyms like EV, GTO, BB in English form.',
			].join(' ');
		}

		if (language === PreferredLanguage.JA) {
			return [
				'Output language must be Japanese only.',
				'Do not mix English or Korean sentences.',
				'Only keep technical acronyms like EV, GTO, BB in English form.',
			].join(' ');
		}

		return 'Output language must be English only. Do not mix Korean or Japanese sentences.';
	}

	private handReviewFallback(language: PreferredLanguage, premium: boolean): string {
		if (language === PreferredLanguage.KO) {
			return [
				'1) 핵심 실수',
				'- 분석 서비스 오류로 상세 분석을 생성하지 못했습니다.',
				'2) 더 나은 라인',
				'- 현재 액션 로그 기준으로 포지션/팟오즈 중심 재검토를 권장합니다.',
				'3) 익스플로잇 노트',
				'- 다음 시도에서 동일 모델/프롬프트로 재분석해 비교하세요.',
				premium ? '4) GTO 스타일 심화 노트' : '4) 기본 개선 계획',
				'- 서비스 오류로 심화 분석이 생략되었습니다.',
			].join('\n');
		}

		if (language === PreferredLanguage.JA) {
			return [
				'1) 主要なミス',
				'- 分析サービスのエラーにより詳細分析を生成できませんでした。',
				'2) より良いライン',
				'- 現在のアクションログを基に、ポジションとポットオッズ中心で再検討してください。',
				'3) エクスプロイトノート',
				'- 次回は同じモデル/プロンプトで再分析し、結果を比較してください。',
				premium ? '4) GTOスタイル詳細ノート' : '4) 基本改善プラン',
				'- サービスエラーにより詳細分析は省略されました。',
			].join('\n');
		}

		return [
			'1) Key Mistakes',
			'- Detailed analysis could not be generated due to analyzer service failure.',
			'2) Better Lines',
			'- Re-evaluate this hand with stronger focus on position and pot odds.',
			'3) Exploit Notes',
			'- Retry with the same model/prompt and compare differences.',
			premium ? '4) GTO-Style Deep Notes' : '4) Basic Improvement Plan',
			'- Deep analysis was skipped due to service failure.',
		].join('\n');
	}

	private toProviderText(content: unknown): string {
		if (typeof content === 'string') {
			return content;
		}

		if (Array.isArray(content)) {
			const merged = content
				.map((item) => {
					if (typeof item === 'string') return item;
					if (!item || typeof item !== 'object') return '';
					const block = item as Record<string, unknown>;
					if (typeof block.text === 'string') return block.text;
					if (typeof block.content === 'string') return block.content;
					return '';
				})
				.filter((part) => part.length > 0)
				.join('\n');
			if (merged.trim().length > 0) {
				return merged;
			}
		}

		if (content && typeof content === 'object') {
			const obj = content as Record<string, unknown>;
			if (typeof obj.text === 'string') return obj.text;
			if (typeof obj.content === 'string') return obj.content;
			try {
				return JSON.stringify(obj);
			} catch {
				return '';
			}
		}

		return '';
	}

	private defaultGtoMix(): GtoActionMix {
		return {
			check: 20,
			call: 20,
			fold: 20,
			raise: 20,
			allIn: 20,
		};
	}

	private actionHeuristicMix(action: string): GtoActionMix {
		const normalized = action.toLowerCase();
		if (normalized === 'fold') {
			return { check: 10, call: 8, fold: 72, raise: 7, allIn: 3 };
		}
		if (normalized === 'check') {
			return { check: 62, call: 8, fold: 7, raise: 18, allIn: 5 };
		}
		if (normalized === 'call') {
			return { check: 9, call: 58, fold: 14, raise: 14, allIn: 5 };
		}
		if (normalized === 'raise' || normalized === 'bet') {
			return { check: 8, call: 16, fold: 9, raise: 58, allIn: 9 };
		}
		if (normalized === 'all-in' || normalized === 'all_in' || normalized === 'allin') {
			return { check: 4, call: 12, fold: 8, raise: 16, allIn: 60 };
		}
		return this.defaultGtoMix();
	}

	private normalizeEvBb(value: unknown): number {
		const raw = Number(value);
		if (!Number.isFinite(raw)) return 0;
		return Math.round(raw * 100) / 100;
	}

	private normalizeEquity(value: unknown): number {
		const raw = Number(value);
		if (!Number.isFinite(raw)) return 50;
		const clamped = Math.max(0, Math.min(100, raw));
		return Math.round(clamped * 10) / 10;
	}

	private normalizeGtoMix(value: unknown): GtoActionMix {
		if (!value || typeof value !== 'object') {
			return this.defaultGtoMix();
		}

		const source = value as Record<string, unknown>;
		const pick = (keys: string[]) => {
			for (const key of keys) {
				const current = Number(source[key]);
				if (Number.isFinite(current)) {
					return Math.max(0, current);
				}
			}
			return 0;
		};

		const draft: GtoActionMix = {
			check: pick(['check']),
			call: pick(['call']),
			fold: pick(['fold']),
			raise: pick(['raise', 'bet']),
			allIn: pick(['allIn', 'all_in', 'all-in', 'allin', 'jam']),
		};

		const total = draft.check + draft.call + draft.fold + draft.raise + draft.allIn;
		if (!Number.isFinite(total) || total <= 0) {
			return this.defaultGtoMix();
		}

		const normalized: GtoActionMix = {
			check: Math.round((draft.check / total) * 1000) / 10,
			call: Math.round((draft.call / total) * 1000) / 10,
			fold: Math.round((draft.fold / total) * 1000) / 10,
			raise: Math.round((draft.raise / total) * 1000) / 10,
			allIn: Math.round((draft.allIn / total) * 1000) / 10,
		};

		const sum =
			normalized.check +
			normalized.call +
			normalized.fold +
			normalized.raise +
			normalized.allIn;
		const diff = Math.round((100 - sum) * 10) / 10;
		if (Math.abs(diff) >= 0.1) {
			const keys: Array<keyof GtoActionMix> = ['check', 'call', 'fold', 'raise', 'allIn'];
			const biggest = keys.reduce((prev, cur) =>
				normalized[cur] > normalized[prev] ? cur : prev,
			);
			normalized[biggest] = Math.max(0, Math.round((normalized[biggest] + diff) * 10) / 10);
		}

		return normalized;
	}

	private asObject(value: unknown): Record<string, unknown> | null {
		if (!value || typeof value !== 'object' || Array.isArray(value)) {
			return null;
		}
		return value as Record<string, unknown>;
	}

	private pickFirstString(source: Record<string, unknown> | null, keys: string[]): string {
		if (!source) return '';
		for (const key of keys) {
			const raw = source[key];
			if (typeof raw === 'string' && raw.trim().length > 0) {
				return raw.trim();
			}
		}
		return '';
	}

	private parsePositiveOrder(value: unknown): number | null {
		const direct = Number(value);
		if (Number.isInteger(direct) && direct > 0) {
			return direct;
		}

		if (typeof value === 'string') {
			const matched = value.match(/\d+/);
			if (matched) {
				const parsed = Number(matched[0]);
				if (Number.isInteger(parsed) && parsed > 0) {
					return parsed;
				}
			}
		}

		return null;
	}

	private extractActionItems(parsed: Record<string, unknown> | null): Array<Record<string, unknown>> {
		if (!parsed) return [];

		const keys = ['actions', 'reviews', 'actionReviews', 'items', 'results', 'analysisItems'];
		for (const key of keys) {
			const candidate = parsed[key];
			if (Array.isArray(candidate)) {
				return candidate
					.map((entry) => this.asObject(entry))
					.filter((entry): entry is Record<string, unknown> => entry !== null);
			}
		}

		const actionObject = this.asObject(parsed.actions);
		if (actionObject) {
			const entries: Array<Record<string, unknown>> = [];
			for (const [key, value] of Object.entries(actionObject)) {
				const item = this.asObject(value);
				if (!item) continue;
				entries.push({ order: key, ...item });
			}
			if (entries.length > 0) {
				return entries;
			}
		}

		return [];
	}

	private buildParsedActionAnalysis(
		item: Record<string, unknown>,
		language: PreferredLanguage,
	): string {
		const analysis = this.pickFirstString(item, [
			'analysis',
			'review',
			'coaching',
			'feedback',
			'comment',
			'text',
			'note',
			'reason',
		]);
		const betterLine = this.pickFirstString(item, ['betterLine', 'better', 'alternativeLine']);
		const verdict = this.pickFirstString(item, ['verdict', 'grade', 'evaluation']);
		const score = Number(item.score ?? item.rating ?? NaN);

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

		return chunks.join('\n').trim();
	}

	private localFallbackActionAnalysis(
		action: {
			order: number;
			playerId: string;
			action: string;
			amount: number;
			potAfter: number;
			street: string;
		},
		heroPlayerId: string,
		language: PreferredLanguage,
	): string {
		const isHeroAction = heroPlayerId.length > 0 && action.playerId === heroPlayerId;
		const actionLabel = action.action.toUpperCase();
		const amountLabel = action.amount > 0 ? ` $${action.amount}` : '';

		if (language === PreferredLanguage.KO) {
			if (isHeroAction) {
				return `액션 #${action.order}: ${action.street}에서 히어로 ${actionLabel}${amountLabel}. 현재 포트 $${action.potAfter} 기준으로 베팅 사이즈와 다음 스트리트 플랜의 일관성을 점검하세요. EV/에퀴티 수치가 불완전할 때는 포지션 우위와 리스크 관리 중심으로 라인을 재정렬하는 것이 안전합니다.`;
			}
			return `액션 #${action.order}: ${action.street}에서 상대 ${actionLabel}${amountLabel}. 이 구간은 상대 카드 추정보다 히어로의 대응 빈도(콜/폴드/레이즈) 조절이 핵심입니다. 포트오즈와 남은 스택을 기준으로 다음 노드 대응 라인을 선택하세요.`;
		}

		if (language === PreferredLanguage.JA) {
			if (isHeroAction) {
				return `アクション #${action.order}: ${action.street} でヒーロー ${actionLabel}${amountLabel}。現在のポット $${action.potAfter} を基準に、ベットサイズと次ストリート計画の整合性を確認してください。EV/エクイティが不十分な場合は、ポジション優位とリスク管理を優先してラインを再調整するのが安全です。`;
			}
			return `アクション #${action.order}: ${action.street} で相手 ${actionLabel}${amountLabel}。この局面では相手ハンド推測より、ヒーローの対応頻度（コール/フォールド/レイズ）調整が重要です。ポットオッズと残りスタックを基準に次ノードの対応ラインを選択してください。`;
		}

		if (isHeroAction) {
			return `Action #${action.order}: Hero ${actionLabel}${amountLabel} on ${action.street}. Re-check sizing and next-street planning against the current pot ($${action.potAfter}). When EV/equity is uncertain, prioritize position leverage and risk control for a cleaner line.`;
		}
		return `Action #${action.order}: Opponent ${actionLabel}${amountLabel} on ${action.street}. Focus on hero response frequencies (call/fold/raise) rather than hidden-card assumptions. Choose the next line using pot odds and remaining stack depth.`;
	}

	private parseNarrativeActionReviews(raw: string): Map<number, string> {
		const result = new Map<number, string>();
		if (typeof raw !== 'string' || raw.trim().length === 0) {
			return result;
		}

		const normalized = raw.replace(/\r\n/g, '\n');
		const markers: Array<{ order: number; index: number }> = [];
		const markerRegex = /(?:^|\n)\s*(?:action|액션|アクション|step|order)?\s*#?\s*(\d{1,3})\s*[:.)-]\s*/gi;
		let match: RegExpExecArray | null;
		while ((match = markerRegex.exec(normalized)) !== null) {
			const order = Number(match[1]);
			if (!Number.isInteger(order) || order <= 0) continue;
			markers.push({ order, index: match.index });
		}

		if (markers.length === 0) {
			return result;
		}

		for (let index = 0; index < markers.length; index += 1) {
			const current = markers[index];
			const next = markers[index + 1];
			const start = current.index;
			const end = next ? next.index : normalized.length;
			const block = normalized.slice(start, end).trim();
			if (!block) continue;
			if (!result.has(current.order)) {
				result.set(current.order, block);
			}
		}

		return result;
	}

	private async callOpenAICompatible(options: {
		baseUrl: string;
		apiKey?: string;
		model: string;
		systemPrompt: string;
		userPrompt: string;
		timeoutMs?: number;
		responseFormatJson?: boolean;
		maxTokens?: number;
	}): Promise<string> {
		const endpoint = `${options.baseUrl.replace(/\/$/, '')}/chat/completions`;
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
		};
		if (options.apiKey) {
			headers.Authorization = `Bearer ${options.apiKey}`;
		}

		const requestBody: Record<string, unknown> = {
			model: options.model,
			temperature: 0.2,
			messages: [
				{ role: 'system', content: options.systemPrompt },
				{ role: 'user', content: options.userPrompt },
			],
		};
		if (options.responseFormatJson ?? true) {
			requestBody.response_format = { type: 'json_object' };
		}
		if (Number.isInteger(options.maxTokens) && (options.maxTokens ?? 0) > 0) {
			requestBody.max_tokens = options.maxTokens;
		}

		const response = await firstValueFrom(
			this.httpService.post(endpoint, requestBody, {
				headers,
				timeout: options.timeoutMs ?? BOT_PROVIDER_TIMEOUT_MS,
			}),
		);

		const normalized = this.toProviderText(response.data?.choices?.[0]?.message?.content);
		return normalized || JSON.stringify(this.defaultBotDecision());
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
		maxTokens?: number;
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
				maxTokens: options.maxTokens,
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
		const fallbackModel = this.configService.get('LOCAL_LLM_MODEL', 'qwen2.5-coder:3b');

		try {
			return await this.callOpenAICompatible({
				baseUrl: localBase,
				apiKey: localKey,
				model: options.model,
				systemPrompt: options.systemPrompt,
				userPrompt: options.userPrompt,
				timeoutMs: options.timeoutMs,
				responseFormatJson: false,
				maxTokens: options.maxTokens,
			});
		} catch {
			// Continue to fallback model attempt if requested model is unavailable.
		}

		if (options.model !== fallbackModel) {
			return this.callOpenAICompatible({
				baseUrl: localBase,
				apiKey: localKey,
				model: fallbackModel,
				systemPrompt: options.systemPrompt,
				userPrompt: options.userPrompt,
				timeoutMs: options.timeoutMs,
				responseFormatJson: false,
				maxTokens: options.maxTokens,
			});
		}

		return this.callOpenAICompatible({
			baseUrl: localBase,
			apiKey: localKey,
			model: options.model,
			systemPrompt: options.systemPrompt,
			userPrompt: options.userPrompt,
			timeoutMs: options.timeoutMs,
			responseFormatJson: false,
			maxTokens: options.maxTokens,
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
			this.strictLanguageInstruction(language),
		].join(' ');

		const userPrompt = JSON.stringify(
			{
				handId: dto.handId,
				outputLanguage: language,
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
				timeoutMs: 0,
				maxTokens: 700,
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
			participants?: Array<{
				seatId?: number;
				displayName?: string;
				roleType?: string;
				playerId?: string;
				userId?: string;
				holeCards?: string[];
			}>;
			positions?: Record<string, string>;
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
			playerId: participant.playerId ?? '',
			userId: participant.userId,
			holeCards: Array.isArray(participant.holeCards)
				? participant.holeCards.map((card) => String(card))
				: [],
		}));

		const heroParticipant =
			participants.find((participant) => participant.userId === dto.heroUserId) ??
			null;
		const heroPlayerId = heroParticipant?.playerId ?? '';
		const heroPosition = heroParticipant
			? context.positions?.[String(heroParticipant.seatId)]
			: undefined;

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

		const perspectiveActions = actions.map((action) => {
			const isHeroAction = heroPlayerId.length > 0 && action.playerId === heroPlayerId;
			return {
				...action,
				actor: isHeroAction ? 'hero' : 'opponent',
				coachingFocus: isHeroAction
					? 'Evaluate hero action quality and better alternatives.'
					: 'Opponent action happened. Coach hero response and adjustment from this node.',
			};
		});

		if (actions.length === 0) {
			return {
				provider,
				model,
				summary: this.localizedText(language, {
					en: 'No action logs available to analyze.',
					ko: '분석할 액션 로그가 없습니다.',
					ja: '分析するアクションログがありません。',
				}),
				reviews: [] as Array<{
					order: number;
					analysis: string;
					evBb: number;
					heroEquity: number;
					gtoMix: GtoActionMix;
				}>,
			};
		}

		const systemPrompt = [
			'You are AIPOT action-by-action poker coach.',
			'Always analyze from HERO perspective only.',
			'Do not evaluate opponents as if they are the user.',
			'For opponent actions, coach what HERO should do next based on hero hand, board, pot and position.',
			'Never assume hidden opponent hole cards before showdown.',
			'Use only public board + action history + hero cards.',
			'Return strict JSON only.',
			'Schema: {"summary":string,"actions":[{"order":number,"analysis":string,"verdict":"good|neutral|bad","score":-5..5,"betterLine":string,"evBb":number,"heroEquity":number,"mix":{"check":number,"call":number,"fold":number,"raise":number,"allIn":number}}]}',
			'All mix values must be percentages and sum close to 100.',
			'In each analysis text, first describe EV/equity/frequency baseline, then provide concise coaching advice.',
			'Keep each action analysis short (2-4 sentences).',
			'If uncertain, still provide concise feedback per action order.',
			premium ? 'Include deeper tactical notes in analysis text.' : 'Keep analysis practical and concise.',
			this.languageInstruction(language),
			this.strictLanguageInstruction(language),
		].join(' ');

		const userPrompt = JSON.stringify(
			{
				handId: dto.handId,
				outputLanguage: language,
				hero: {
					playerId: heroParticipant?.playerId ?? null,
					userId: heroParticipant?.userId ?? dto.heroUserId ?? null,
					displayName: heroParticipant?.displayName ?? 'Hero',
					seatId: heroParticipant?.seatId ?? null,
					position: heroPosition ?? null,
					holeCards: heroParticipant?.holeCards ?? [],
				},
				boardCards: context.boardCards ?? [],
				participants: participants.map((participant) => ({
					seatId: participant.seatId,
					displayName: participant.displayName,
					roleType: participant.roleType,
					isHero: heroPlayerId.length > 0 && participant.playerId === heroPlayerId,
				})),
				actions: perspectiveActions,
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
				timeoutMs: 0,
				maxTokens: 1200,
			});

			const parsed = this.extractJson(raw);
			const summaryText = this.pickFirstString(parsed, [
				'summary',
				'overview',
				'handSummary',
				'message',
			]);
			const summary =
				summaryText.length > 0
					? summaryText
					: this.localizedText(language, {
						en: 'Hand-wide action review has been generated.',
						ko: '핸드 전체 액션 평가가 생성되었습니다.',
						ja: 'ハンド全体のアクション評価を生成しました。',
					});

			const parsedActions = this.extractActionItems(parsed);
			const byOrder = new Map<
				number,
				{ analysis: string; evBb: number; heroEquity: number; gtoMix: GtoActionMix }
			>();

			for (const item of parsedActions) {
				const order = this.parsePositiveOrder(
					item.order ?? item.actionOrder ?? item.step ?? item.index ?? item.no ?? item.id,
				);
				if (!order) continue;

				const analysis = this.buildParsedActionAnalysis(item, language);
				const evBb = this.normalizeEvBb(
					item.evBb ?? item.ev_bb ?? item.ev ?? item.evScore ?? item.score,
				);
				const heroEquity = this.normalizeEquity(
					item.heroEquity ??
						item.hero_equity ??
						item.equity ??
						item.winRate ??
						item.win_rate,
				);
				const gtoMix = this.normalizeGtoMix(
					item.mix ?? item.frequency ?? item.frequencies ?? item.gtoMix,
				);

				byOrder.set(order, {
					analysis:
						analysis ||
						this.localizedText(language, {
							en: 'No detailed text was provided for this action.',
							ko: '해당 액션에 대한 상세 텍스트가 제공되지 않았습니다.',
							ja: 'このアクションに対する詳細テキストは提供されませんでした。',
						}),
					evBb,
					heroEquity,
					gtoMix,
				});
			}

			if (byOrder.size === 0) {
				const narrativeByOrder = this.parseNarrativeActionReviews(raw);
				for (const action of actions) {
					const analysis = narrativeByOrder.get(action.order);
					if (!analysis) continue;
					byOrder.set(action.order, {
						analysis,
						evBb: 0,
						heroEquity: 50,
						gtoMix: this.actionHeuristicMix(action.action),
					});
				}
			}

			const missingActions = actions.filter((action) => !byOrder.has(action.order));
			if (missingActions.length > 0) {
				try {
					const missingPrompt = JSON.stringify(
						{
							handId: dto.handId,
							outputLanguage: language,
							requiredOrders: missingActions.map((action) => action.order),
							hero: {
								playerId: heroParticipant?.playerId ?? null,
								userId: heroParticipant?.userId ?? dto.heroUserId ?? null,
								displayName: heroParticipant?.displayName ?? 'Hero',
								position: heroPosition ?? null,
								holeCards: heroParticipant?.holeCards ?? [],
							},
							boardCards: context.boardCards ?? [],
							participants: participants.map((participant) => ({
								seatId: participant.seatId,
								displayName: participant.displayName,
								roleType: participant.roleType,
								isHero: heroPlayerId.length > 0 && participant.playerId === heroPlayerId,
							})),
							actions: perspectiveActions.filter((action) =>
								missingActions.some((target) => target.order === action.order),
							),
						},
						null,
						2,
					);

					const missingRaw = await this.runProvider({
						provider,
						model,
						systemPrompt: [
							'You are AIPOT poker coach.',
							'Return strict JSON only.',
							'Must include every order listed in requiredOrders with no omissions.',
							'Schema: {"actions":[{"order":number,"analysis":string,"evBb":number,"heroEquity":number,"mix":{"check":number,"call":number,"fold":number,"raise":number,"allIn":number}}]}',
							this.languageInstruction(language),
							this.strictLanguageInstruction(language),
						].join(' '),
						userPrompt: missingPrompt,
						timeoutMs: 0,
						maxTokens: Math.min(2200, Math.max(700, missingActions.length * 220)),
					});

					const missingParsed = this.extractJson(missingRaw);
					const missingItems = this.extractActionItems(missingParsed);
					for (const item of missingItems) {
						const order = this.parsePositiveOrder(
							item.order ??
								item.actionOrder ??
								item.step ??
								item.index ??
								item.no ??
								item.id,
						);
						if (!order || byOrder.has(order)) continue;

						const analysis = this.buildParsedActionAnalysis(item, language);
						byOrder.set(order, {
							analysis:
								analysis ||
								this.localizedText(language, {
									en: 'No detailed text was provided for this action.',
									ko: '해당 액션에 대한 상세 텍스트가 제공되지 않았습니다.',
									ja: 'このアクションに対する詳細テキストは提供されませんでした。',
								}),
							evBb: this.normalizeEvBb(
								item.evBb ?? item.ev_bb ?? item.ev ?? item.evScore ?? item.score,
							),
							heroEquity: this.normalizeEquity(
								item.heroEquity ??
									item.hero_equity ??
									item.equity ??
									item.winRate ??
									item.win_rate,
							),
							gtoMix: this.normalizeGtoMix(
								item.mix ?? item.frequency ?? item.frequencies ?? item.gtoMix,
							),
						});
					}

					const stillMissing = actions.filter((action) => !byOrder.has(action.order));
					if (stillMissing.length > 0) {
						const narrativeByOrder = this.parseNarrativeActionReviews(missingRaw);
						for (const action of stillMissing) {
							const analysis = narrativeByOrder.get(action.order);
							if (!analysis) continue;
							byOrder.set(action.order, {
								analysis,
								evBb: 0,
								heroEquity: 50,
								gtoMix: this.actionHeuristicMix(action.action),
							});
						}
					}
				} catch {
					// Keep already parsed results; remaining holes will be filled by deterministic local fallback text.
				}
			}

			const reviews = actions.map((action) => ({
				order: action.order,
				analysis:
					byOrder.get(action.order)?.analysis ??
					this.localFallbackActionAnalysis(action, heroPlayerId, language),
				evBb: byOrder.get(action.order)?.evBb ?? 0,
				heroEquity: byOrder.get(action.order)?.heroEquity ?? 50,
				gtoMix: byOrder.get(action.order)?.gtoMix ?? this.actionHeuristicMix(action.action),
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
					en: 'Generated fallback reviews due to analyzer service failure.',
					ko: '분석 서비스 오류로 폴백 리뷰를 생성했습니다.',
					ja: '分析サービスのエラーによりフォールバックレビューを生成しました。',
				}),
				reviews: actions.map((action) => ({
					order: action.order,
					analysis: this.localizedText(language, {
						en: `Action #${action.order}: ${action.action.toUpperCase()} / ${action.street} - Detailed analysis could not be generated due to service failure.`,
						ko: `액션 #${action.order}: ${action.action.toUpperCase()} / ${action.street} - 서비스 오류로 상세 분석을 생성하지 못했습니다.`,
						ja: `アクション #${action.order}: ${action.action.toUpperCase()} / ${action.street} - サービスエラーにより詳細分析を生成できませんでした。`,
					}),
					evBb: 0,
					heroEquity: 50,
					gtoMix: this.actionHeuristicMix(action.action),
				})),
			};
		}
	}
}
