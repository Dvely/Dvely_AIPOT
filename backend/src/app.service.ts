import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type TableType = 'heads-up' | '6-max' | '9-max';
export type BotTier = 'free' | 'premium';

export interface BotProfile {
  id: string;
  name: string;
  style: string;
  difficulty: 'easy' | 'normal' | 'hard';
  tier: BotTier;
  engine: string;
  chatTone: string;
}

export interface LobbyPayload {
  profile: {
    mode: 'guest' | 'member';
    nickname: string;
    bankroll: number;
    isPremium: boolean;
    language: 'ko' | 'en';
  };
  quickStartPreset: {
    tableType: TableType;
    difficulty: 'easy' | 'normal' | 'hard';
    localBots: number;
  };
  recommendedBots: BotProfile[];
}

type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'finished';
export type PlayerAction = 'fold' | 'check' | 'call' | 'bet' | 'raise';
type TurnActor = 'hero' | 'ai';
export type AiModelType = 'random' | 'openai' | 'gemini' | 'anthropic';

interface ActionHistoryItem {
  street: Street;
  actor: TurnActor;
  action: PlayerAction;
  amount: number;
  toCallBefore: number;
  potAfter: number;
  timestamp: number;
}

interface PendingAiTurn {
  readyAt: number;
}

interface PlaySession {
  sessionId: string;
  mode: 'guest' | 'member';
  tableType: TableType;
  difficulty: 'easy' | 'normal' | 'hard';
  bot: BotProfile;
  deck: string[];
  heroCards: string[];
  aiCards: string[];
  board: string[];
  street: Street;
  pot: number;
  heroStack: number;
  aiStack: number;
  heroRoundInvested: number;
  aiRoundInvested: number;
  toCall: number;
  actorTurn: TurnActor;
  aiModel: AiModelType;
  pendingAiTurn: PendingAiTurn | null;
  aiResolving: boolean;
  actionHistory: ActionHistoryItem[];
  winner: 'hero' | 'ai' | 'draw' | null;
  winnerReason: string | null;
  events: string[];
}

export interface PlayState {
  sessionId: string;
  mode: 'guest' | 'member';
  tableType: TableType;
  difficulty: 'easy' | 'normal' | 'hard';
  opponent: string;
  selectedAiModel: AiModelType;
  street: Street;
  pot: number;
  heroStack: number;
  aiStack: number;
  toCall: number;
  actorTurn: TurnActor;
  aiPending: boolean;
  heroCards: string[];
  opponentCards: string[];
  board: string[];
  availableActions: PlayerAction[];
  winner: 'hero' | 'ai' | 'draw' | null;
  winnerReason: string | null;
  isFinished: boolean;
  events: string[];
}

@Injectable()
export class AppService {
  private readonly playSessions = new Map<string, PlaySession>();

  constructor(private readonly configService: ConfigService) {}

  private readonly bots: BotProfile[] = [
    {
      id: 'local-rock',
      name: 'Rocky',
      style: '수비적',
      difficulty: 'easy',
      tier: 'free',
      engine: 'Local LLM',
      chatTone: '차분하고 친절한 코치형',
    },
    {
      id: 'local-balance',
      name: 'Mira',
      style: '밸런스형',
      difficulty: 'normal',
      tier: 'free',
      engine: 'Local LLM',
      chatTone: '상황별 팁을 짧게 전달',
    },
    {
      id: 'gpt-bluff',
      name: 'Nova',
      style: '공격적/블러프 지향',
      difficulty: 'hard',
      tier: 'premium',
      engine: 'GPT',
      chatTone: '도발적이지만 분석이 정교함',
    },
    {
      id: 'claude-sage',
      name: 'Sage',
      style: 'GTO 밸런스',
      difficulty: 'hard',
      tier: 'premium',
      engine: 'Claude',
      chatTone: '설명형 코칭, 초보자 친화',
    },
    {
      id: 'gemini-lab',
      name: 'Flux',
      style: '실험형',
      difficulty: 'normal',
      tier: 'premium',
      engine: 'Gemini',
      chatTone: '리스크와 대안 액션을 같이 제시',
    },
  ];

  getLobby(mode: 'guest' | 'member' = 'guest'): LobbyPayload {
    const isMember = mode === 'member';
    return {
      profile: {
        mode,
        nickname: isMember ? 'AIPOT Learner' : 'Guest Player',
        bankroll: isMember ? 12400 : 0,
        isPremium: false,
        language: 'ko',
      },
      quickStartPreset: {
        tableType: '6-max',
        difficulty: 'easy',
        localBots: 5,
      },
      recommendedBots: this.bots.slice(0, 3),
    };
  }

  getBots(tableType?: TableType, tier: BotTier | 'all' = 'all') {
    const pool = this.bots.filter((bot) => (tier === 'all' ? true : bot.tier === tier));

    return {
      tableType: tableType ?? '6-max',
      bots: pool,
    };
  }

  createQuickStart(payload: {
    mode?: 'guest' | 'member';
    tableType?: TableType;
    difficulty?: 'easy' | 'normal' | 'hard';
  }) {
    const tableType = payload.tableType ?? '6-max';
    const difficulty = payload.difficulty ?? 'easy';
    const mode = payload.mode ?? 'guest';

    return {
      sessionId: `sess_${Date.now()}`,
      mode,
      match: {
        gameMode: 'money-game',
        tableType,
        blind: '50/100',
        bots: this.bots
          .filter((bot) => (difficulty === 'easy' ? bot.difficulty !== 'hard' : true))
          .slice(0, tableType === 'heads-up' ? 1 : tableType === '6-max' ? 5 : 8),
      },
      nextStep: mode === 'member' ? 'finish-game-and-review' : 'sign-up-to-save-history',
    };
  }

  getTodayMissions() {
    return {
      date: new Date().toISOString().slice(0, 10),
      missions: [
        { id: 'm1', label: '빠른 시작 2회 플레이', reward: 500, progress: '1/2' },
        { id: 'm2', label: '복기 리포트 1회 완료', reward: 300, progress: '0/1' },
        { id: 'm3', label: '프리플랍 폴드율 35% 이상 유지', reward: 700, progress: 'in-progress' },
      ],
    };
  }

  getRecentReports() {
    return {
      reports: [
        {
          id: 'r_240401_01',
          tableType: '6-max',
          result: '+1,250',
          hands: 46,
          majorLeak: '턴 구간 과도한 콜',
          createdAt: '2026-04-01T12:21:00Z',
        },
        {
          id: 'r_240331_04',
          tableType: 'heads-up',
          result: '-320',
          hands: 31,
          majorLeak: '리버 블러프 빈도 과다',
          createdAt: '2026-03-31T17:03:00Z',
        },
      ],
    };
  }

  getReportDetail(reportId: string, premium = false) {
    return {
      reportId,
      summary: {
        score: 71,
        decisionQuality: 'B',
        coachComment: '턴에서 약한 탑페어를 과보호한 점이 손실의 핵심입니다.',
      },
      timeline: [
        { street: 'Preflop', action: 'BTN raise 2.5BB', ev: 0.32, equity: 0.54 },
        { street: 'Flop', action: 'C-bet 33%', ev: 0.48, equity: 0.61 },
        { street: 'Turn', action: 'Call overbet', ev: -0.11, equity: 0.34 },
        { street: 'River', action: 'Fold vs jam', ev: 0.04, equity: 0.19 },
      ],
      premium: premium
        ? {
            gtoGap: '-7.8bb/100',
            leakTags: ['Turn Bluff Catch', 'Thin Value Missed'],
            improvementPoints: [
              '턴 오버벳 대응 시 MDF 기준으로 콜 빈도 축소',
              '리버에서 블로커 기반 밸류 베팅 라인 추가',
            ],
          }
        : null,
    };
  }

  startPlayableHand(payload: {
    mode?: 'guest' | 'member';
    tableType?: TableType;
    difficulty?: 'easy' | 'normal' | 'hard';
    aiModel?: AiModelType;
  }): PlayState {
    const mode = payload.mode ?? 'guest';
    const tableType = payload.tableType ?? '6-max';
    const difficulty = payload.difficulty ?? 'easy';
    const aiModel = payload.aiModel ?? 'random';

    const candidateBots = this.bots.filter((bot) => {
      if (difficulty === 'easy') return bot.difficulty !== 'hard';
      if (difficulty === 'hard') return bot.difficulty !== 'easy';
      return true;
    });
    const bot = candidateBots[Math.floor(Math.random() * candidateBots.length)] ?? this.bots[0];

    const deck = createShuffledDeck();
    const heroCards = [drawCard(deck), drawCard(deck)];
    const aiCards = [drawCard(deck), drawCard(deck)];

    const session: PlaySession = {
      sessionId: `play_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      mode,
      tableType,
      difficulty,
      bot,
      deck,
      heroCards,
      aiCards,
      board: [],
      street: 'preflop',
      pot: 30,
      heroStack: 2000 - 10,
      aiStack: 2000 - 20,
      heroRoundInvested: 10,
      aiRoundInvested: 20,
      toCall: 10,
      actorTurn: 'hero',
      aiModel,
      pendingAiTurn: null,
      aiResolving: false,
      actionHistory: [],
      winner: null,
      winnerReason: null,
      events: [`핸드 시작: SB 10 / BB 20 포스팅 완료 · AI 모델 ${aiModel}`],
    };

    this.playSessions.set(session.sessionId, session);
    return this.serializePlayState(session);
  }

  async getPlayableHand(sessionId: string): Promise<PlayState> {
    const session = this.playSessions.get(sessionId);
    if (!session) {
      throw new NotFoundException('플레이 세션을 찾을 수 없습니다.');
    }

    await this.resolveAiTurnIfReady(session);

    return this.serializePlayState(session);
  }

  async applyPlayerAction(sessionId: string, action: PlayerAction): Promise<PlayState> {
    const session = this.playSessions.get(sessionId);
    if (!session) {
      throw new NotFoundException('플레이 세션을 찾을 수 없습니다.');
    }
    if (session.street === 'finished' || session.street === 'showdown') {
      throw new BadRequestException('이미 종료된 핸드입니다. 새 핸드를 시작해 주세요.');
    }
    if (session.actorTurn !== 'hero') {
      throw new BadRequestException('현재는 AI 턴입니다. 잠시 후 다시 시도해 주세요.');
    }

    const available = this.getAvailableActions(session);
    if (!available.includes(action)) {
      throw new BadRequestException(`현재 가능한 액션: ${available.join(', ')}`);
    }

    if (action === 'fold') {
      session.events.push('Hero: Fold');
      this.recordAction(session, 'hero', 'fold', 0, session.toCall);
      this.finishByFold(session, 'ai');
      return this.serializePlayState(session);
    }

    if (action === 'check') {
      session.events.push('Hero: Check');
      this.recordAction(session, 'hero', 'check', 0, session.toCall);
      this.scheduleAiTurn(session);
      return this.serializePlayState(session);
    }

    if (action === 'call') {
      const callAmount = session.toCall;
      this.contribute(session, 'hero', callAmount);
      session.events.push(`Hero: Call ${callAmount}`);
      this.recordAction(session, 'hero', 'call', callAmount, callAmount);
      session.toCall = 0;
      this.advanceStreet(session);
      return this.serializePlayState(session);
    }

    if (action === 'bet' || action === 'raise') {
      const raiseUnit = session.street === 'preflop' ? 40 : 60;
      const wager = action === 'raise' ? session.toCall + raiseUnit : raiseUnit;
      const toCallBefore = session.toCall;
      this.contribute(session, 'hero', wager);
      session.events.push(`Hero: ${action === 'raise' ? 'Raise' : 'Bet'} ${wager}`);
      this.recordAction(session, 'hero', action, wager, toCallBefore);
      this.scheduleAiTurn(session);
      return this.serializePlayState(session);
    }

    throw new BadRequestException('알 수 없는 액션입니다.');
  }

  private serializePlayState(session: PlaySession): PlayState {
    return {
      sessionId: session.sessionId,
      mode: session.mode,
      tableType: session.tableType,
      difficulty: session.difficulty,
      opponent: `${session.bot.name} (${session.bot.style})`,
      selectedAiModel: session.aiModel,
      street: session.street,
      pot: session.pot,
      heroStack: session.heroStack,
      aiStack: session.aiStack,
      toCall: session.toCall,
      actorTurn: session.actorTurn,
      aiPending: Boolean(session.pendingAiTurn),
      heroCards: session.heroCards,
      opponentCards: session.street === 'finished' || session.street === 'showdown' ? session.aiCards : ['??', '??'],
      board: session.board,
      availableActions: this.getAvailableActions(session),
      winner: session.winner,
      winnerReason: session.winnerReason,
      isFinished: session.street === 'finished' || session.street === 'showdown',
      events: session.events.slice(-8),
    };
  }

  private getAvailableActions(session: PlaySession): PlayerAction[] {
    if (session.actorTurn !== 'hero') return [];
    if (session.street === 'finished' || session.street === 'showdown') return [];
    if (session.toCall > 0) return ['fold', 'call', 'raise'];
    return ['check', 'bet'];
  }

  private getAiAvailableActions(session: PlaySession): PlayerAction[] {
    if (session.street === 'finished' || session.street === 'showdown') return [];
    const aiToCall = Math.max(0, session.heroRoundInvested - session.aiRoundInvested);
    if (aiToCall > 0) return ['fold', 'call', 'raise'];
    return ['check', 'bet'];
  }

  private contribute(session: PlaySession, player: 'hero' | 'ai', amount: number) {
    if (amount <= 0) return;
    if (player === 'hero') {
      const paid = Math.min(session.heroStack, amount);
      session.heroStack -= paid;
      session.heroRoundInvested += paid;
      session.pot += paid;
      return;
    }

    const paid = Math.min(session.aiStack, amount);
    session.aiStack -= paid;
    session.aiRoundInvested += paid;
    session.pot += paid;
  }

  private scheduleAiTurn(session: PlaySession) {
    const minDelay = Number(this.configService.get<string>('AI_MIN_DELAY_MS', '1200'));
    const maxDelay = Number(this.configService.get<string>('AI_MAX_DELAY_MS', '3200'));
    const jitter = Math.max(0, maxDelay - minDelay);
    const delay = minDelay + Math.floor(Math.random() * (jitter + 1));

    session.actorTurn = 'ai';
    session.pendingAiTurn = {
      readyAt: Date.now() + delay,
    };
    session.events.push(`${session.bot.name}가 생각 중... (${delay}ms)`);
  }

  private async resolveAiTurnIfReady(session: PlaySession) {
    if (!session.pendingAiTurn) return;
    if (session.aiResolving) return;
    if (Date.now() < session.pendingAiTurn.readyAt) return;

    session.aiResolving = true;
    try {
      const aiToCall = Math.max(0, session.heroRoundInvested - session.aiRoundInvested);
      const availableActions = this.getAiAvailableActions(session);
      const decision = await this.decideAiAction(session, availableActions, aiToCall);
      this.applyAiDecision(session, decision.action, decision.amount ?? 0, aiToCall, decision.note);
    } finally {
      session.pendingAiTurn = null;
      session.aiResolving = false;
    }
  }

  private applyAiDecision(
    session: PlaySession,
    action: PlayerAction,
    requestedAmount: number,
    aiToCall: number,
    note?: string,
  ) {
    if (action === 'fold') {
      session.events.push(`${session.bot.name}: Fold`);
      this.recordAction(session, 'ai', 'fold', 0, aiToCall);
      this.finishByFold(session, 'hero');
      return;
    }

    if (action === 'check') {
      if (aiToCall > 0) {
        this.applyAiDecision(session, 'call', aiToCall, aiToCall, note);
        return;
      }
      session.events.push(`${session.bot.name}: Check`);
      this.recordAction(session, 'ai', 'check', 0, 0);
      this.advanceStreet(session);
      session.actorTurn = 'hero';
      return;
    }

    if (action === 'call') {
      this.contribute(session, 'ai', aiToCall);
      session.events.push(`${session.bot.name}: Call ${aiToCall}`);
      this.recordAction(session, 'ai', 'call', aiToCall, aiToCall);
      session.toCall = 0;
      this.advanceStreet(session);
      session.actorTurn = session.street === 'finished' ? 'ai' : 'hero';
      return;
    }

    const raiseUnit = session.street === 'preflop' ? 40 : 60;
    const extra = Math.max(raiseUnit, Math.min(raiseUnit * 5, requestedAmount || raiseUnit));
    const total = aiToCall + extra;
    this.contribute(session, 'ai', total);
    const normalizedAction: PlayerAction = aiToCall > 0 ? 'raise' : 'bet';
    session.events.push(`${session.bot.name}: ${normalizedAction === 'raise' ? 'Raise' : 'Bet'} ${total}`);
    if (note) {
      session.events.push(`${session.bot.name} 코멘트: ${note.slice(0, 90)}`);
    }
    this.recordAction(session, 'ai', normalizedAction, total, aiToCall);

    session.toCall = Math.max(0, session.aiRoundInvested - session.heroRoundInvested);
    session.actorTurn = 'hero';
  }

  private async decideAiAction(
    session: PlaySession,
    availableActions: PlayerAction[],
    toCall: number,
  ): Promise<{ action: PlayerAction; amount?: number; note?: string }> {
    if (session.aiModel === 'random') {
      return this.getRandomDecision(session, availableActions, toCall);
    }

    const apiKeyMap: Record<Exclude<AiModelType, 'random'>, string | undefined> = {
      openai: this.configService.get<string>('OPENAI_API_KEY'),
      gemini: this.configService.get<string>('GEMINI_API_KEY'),
      anthropic: this.configService.get<string>('ANTHROPIC_API_KEY'),
    };

    const apiKey = apiKeyMap[session.aiModel];
    if (!apiKey) {
      session.events.push(`${session.aiModel} API 키가 없어 random 모델로 대체됨`);
      return this.getRandomDecision(session, availableActions, toCall);
    }

    try {
      const prompt = this.buildPokerAgentPrompt(session, availableActions, toCall);
      const llmText =
        session.aiModel === 'openai'
          ? await this.callOpenAi(apiKey, prompt)
          : session.aiModel === 'gemini'
            ? await this.callGemini(apiKey, prompt)
            : await this.callAnthropic(apiKey, prompt);

      const parsed = parseAiDecision(llmText, availableActions);
      return parsed ?? this.getRandomDecision(session, availableActions, toCall);
    } catch {
      session.events.push(`${session.aiModel} 응답 실패로 random 모델로 대체됨`);
      return this.getRandomDecision(session, availableActions, toCall);
    }
  }

  private getRandomDecision(
    session: PlaySession,
    availableActions: PlayerAction[],
    toCall: number,
  ): { action: PlayerAction; amount?: number; note?: string } {
    const aggression = session.difficulty === 'hard' ? 0.45 : session.difficulty === 'normal' ? 0.3 : 0.18;

    if (toCall > 0) {
      const roll = Math.random();
      if (roll < 0.2) return { action: 'fold' };
      if (roll < 0.2 + aggression && availableActions.includes('raise')) {
        return { action: 'raise', amount: 40 + Math.floor(Math.random() * 90), note: '압박 레이즈' };
      }
      return { action: 'call' };
    }

    if (availableActions.includes('bet') && Math.random() < aggression) {
      return { action: 'bet', amount: 50 + Math.floor(Math.random() * 110), note: '밸류 베팅 시도' };
    }
    return { action: 'check' };
  }

  private buildPokerAgentPrompt(session: PlaySession, availableActions: PlayerAction[], toCall: number) {
    const behavior = summarizeBehavior(session.actionHistory);
    const historyText = session.actionHistory
      .slice(-12)
      .map((h) => `${h.street} | ${h.actor} | ${h.action} | amount=${h.amount} | potAfter=${h.potAfter}`)
      .join('\n');

    const system = [
      'You are AIPOT Poker Agent.',
      'Goal: choose one legal action for the AI in No-Limit Texas Holdem heads-up.',
      'Rules:',
      '- Use ONLY one of availableActions.',
      '- Consider board texture, pot odds, stack pressure, and opponent tendency.',
      '- If action is bet/raise, provide amount as a positive integer chip value.',
      '- Respond in strict JSON: {"action":"call","amount":80,"note":"reason"}',
      '- Never output markdown.',
    ].join('\n');

    const user = [
      `street=${session.street}`,
      `toCall=${toCall}`,
      `pot=${session.pot}`,
      `heroStack=${session.heroStack}`,
      `aiStack=${session.aiStack}`,
      `aiCards=${session.aiCards.join(' ')}`,
      `board=${session.board.join(' ') || 'none'}`,
      `availableActions=${availableActions.join(',')}`,
      `heroBehavior=${behavior}`,
      'recentHistory:',
      historyText || 'none',
    ].join('\n');

    return { system, user };
  }

  private async callOpenAi(apiKey: string, prompt: { system: string; user: string }) {
    const model = this.configService.get<string>('OPENAI_MODEL', 'gpt-4o-mini');
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.5,
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
      }),
    });
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content ?? '';
  }

  private async callGemini(apiKey: string, prompt: { system: string; user: string }) {
    const model = this.configService.get<string>('GEMINI_MODEL', 'gemini-1.5-flash');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: `${prompt.system}\n\n${prompt.user}` }],
          },
        ],
      }),
    });
    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  }

  private async callAnthropic(apiKey: string, prompt: { system: string; user: string }) {
    const model = this.configService.get<string>('ANTHROPIC_MODEL', 'claude-3-5-sonnet-latest');
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 200,
        temperature: 0.5,
        system: prompt.system,
        messages: [{ role: 'user', content: prompt.user }],
      }),
    });
    const data = (await response.json()) as {
      content?: Array<{ text?: string }>;
    };
    return data.content?.[0]?.text ?? '';
  }

  private recordAction(
    session: PlaySession,
    actor: TurnActor,
    action: PlayerAction,
    amount: number,
    toCallBefore: number,
  ) {
    session.actionHistory.push({
      street: session.street,
      actor,
      action,
      amount,
      toCallBefore,
      potAfter: session.pot,
      timestamp: Date.now(),
    });
  }

  private advanceStreet(session: PlaySession) {
    session.heroRoundInvested = 0;
    session.aiRoundInvested = 0;
    session.toCall = 0;

    if (session.street === 'preflop') {
      session.board.push(drawCard(session.deck), drawCard(session.deck), drawCard(session.deck));
      session.street = 'flop';
      session.events.push('Flop 오픈');
      return;
    }

    if (session.street === 'flop') {
      session.board.push(drawCard(session.deck));
      session.street = 'turn';
      session.events.push('Turn 오픈');
      return;
    }

    if (session.street === 'turn') {
      session.board.push(drawCard(session.deck));
      session.street = 'river';
      session.events.push('River 오픈');
      return;
    }

    if (session.street === 'river') {
      this.finishByShowdown(session);
    }
  }

  private finishByFold(session: PlaySession, winner: 'hero' | 'ai') {
    if (winner === 'hero') session.heroStack += session.pot;
    if (winner === 'ai') session.aiStack += session.pot;
    session.winner = winner;
    session.winnerReason = '상대 폴드';
    session.street = 'finished';
    session.actorTurn = 'ai';
    session.pendingAiTurn = null;
    session.events.push(`${winner === 'hero' ? 'Hero' : session.bot.name} 승리 (${session.winnerReason})`);
  }

  private finishByShowdown(session: PlaySession) {
    const heroRank = getBestHandRank([...session.heroCards, ...session.board]);
    const aiRank = getBestHandRank([...session.aiCards, ...session.board]);
    const cmp = compareRanks(heroRank, aiRank);

    session.street = 'showdown';
    if (cmp > 0) {
      session.heroStack += session.pot;
      session.winner = 'hero';
      session.winnerReason = `Showdown ${describeRank(heroRank[0])}`;
    } else if (cmp < 0) {
      session.aiStack += session.pot;
      session.winner = 'ai';
      session.winnerReason = `Showdown ${describeRank(aiRank[0])}`;
    } else {
      const split = Math.floor(session.pot / 2);
      session.heroStack += split;
      session.aiStack += session.pot - split;
      session.winner = 'draw';
      session.winnerReason = 'Showdown Split Pot';
    }
    session.events.push(`쇼다운: ${session.winnerReason}`);
    session.street = 'finished';
    session.actorTurn = 'ai';
    session.pendingAiTurn = null;
  }
}

function summarizeBehavior(history: ActionHistoryItem[]) {
  const heroActions = history.filter((h) => h.actor === 'hero');
  if (heroActions.length === 0) return 'no data';

  const betLike = heroActions.filter((h) => h.action === 'bet' || h.action === 'raise').length;
  const callLike = heroActions.filter((h) => h.action === 'call').length;
  const foldLike = heroActions.filter((h) => h.action === 'fold').length;

  const aggr = Math.round((betLike / heroActions.length) * 100);
  return `aggression=${aggr}%, calls=${callLike}, folds=${foldLike}`;
}

function parseAiDecision(
  raw: string,
  availableActions: PlayerAction[],
): { action: PlayerAction; amount?: number; note?: string } | null {
  if (!raw) return null;
  const jsonLike = raw.match(/\{[\s\S]*\}/)?.[0] ?? raw;
  try {
    const parsed = JSON.parse(jsonLike) as { action?: string; amount?: number; note?: string };
    const action = parsed.action as PlayerAction;
    if (!availableActions.includes(action)) return null;
    const amount = typeof parsed.amount === 'number' ? Math.max(0, Math.floor(parsed.amount)) : undefined;
    const note = typeof parsed.note === 'string' ? parsed.note : undefined;
    return { action, amount, note };
  } catch {
    return null;
  }
}

function createShuffledDeck() {
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
  const suits = ['s', 'h', 'd', 'c'];
  const deck: string[] = [];

  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push(`${rank}${suit}`);
    }
  }

  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck;
}

function drawCard(deck: string[]) {
  const card = deck.pop();
  if (!card) throw new Error('덱이 비었습니다.');
  return card;
}

function estimatePreflopPower(cards: string[]) {
  const [a, b] = cards;
  const ra = rankValue(a[0]);
  const rb = rankValue(b[0]);
  const pair = ra === rb;
  const suited = a[1] === b[1];
  const high = Math.max(ra, rb);
  const low = Math.min(ra, rb);
  let power = high + low;
  if (pair) power += 30;
  if (suited) power += 4;
  if (high >= 13) power += 5;
  if (Math.abs(ra - rb) <= 2) power += 3;
  return power;
}

function rankValue(rank: string) {
  const map: Record<string, number> = {
    '2': 2,
    '3': 3,
    '4': 4,
    '5': 5,
    '6': 6,
    '7': 7,
    '8': 8,
    '9': 9,
    T: 10,
    J: 11,
    Q: 12,
    K: 13,
    A: 14,
  };
  return map[rank] ?? 0;
}

function getBestHandRank(cards: string[]) {
  const combos = combinations(cards, 5);
  let best = evaluateFiveCards(combos[0]);

  for (let i = 1; i < combos.length; i += 1) {
    const rank = evaluateFiveCards(combos[i]);
    if (compareRanks(rank, best) > 0) best = rank;
  }
  return best;
}

function evaluateFiveCards(cards: string[]) {
  const values = cards.map((card) => rankValue(card[0])).sort((a, b) => b - a);
  const suits = cards.map((card) => card[1]);
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);

  const groups = [...counts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return b[0] - a[0];
  });

  const isFlush = suits.every((s) => s === suits[0]);
  const straightHigh = getStraightHigh(values);
  if (isFlush && straightHigh > 0) return [8, straightHigh];

  if (groups[0][1] === 4) {
    const kicker = groups[1][0];
    return [7, groups[0][0], kicker];
  }

  if (groups[0][1] === 3 && groups[1][1] === 2) {
    return [6, groups[0][0], groups[1][0]];
  }

  if (isFlush) return [5, ...values];
  if (straightHigh > 0) return [4, straightHigh];

  if (groups[0][1] === 3) {
    const kickers = groups.filter((g) => g[1] === 1).map((g) => g[0]).sort((a, b) => b - a);
    return [3, groups[0][0], ...kickers];
  }

  if (groups[0][1] === 2 && groups[1][1] === 2) {
    const highPair = Math.max(groups[0][0], groups[1][0]);
    const lowPair = Math.min(groups[0][0], groups[1][0]);
    const kicker = groups.find((g) => g[1] === 1)?.[0] ?? 0;
    return [2, highPair, lowPair, kicker];
  }

  if (groups[0][1] === 2) {
    const pair = groups[0][0];
    const kickers = groups.filter((g) => g[1] === 1).map((g) => g[0]).sort((a, b) => b - a);
    return [1, pair, ...kickers];
  }

  return [0, ...values];
}

function getStraightHigh(values: number[]) {
  const unique = [...new Set(values)].sort((a, b) => b - a);
  if (unique.includes(14)) unique.push(1);

  let streak = 1;
  for (let i = 1; i < unique.length; i += 1) {
    if (unique[i - 1] - unique[i] === 1) {
      streak += 1;
      if (streak >= 5) return unique[i - 4];
    } else {
      streak = 1;
    }
  }
  return 0;
}

function combinations(cards: string[], pick: number) {
  const result: string[][] = [];
  const stack: string[] = [];

  const dfs = (index: number) => {
    if (stack.length === pick) {
      result.push([...stack]);
      return;
    }
    for (let i = index; i < cards.length; i += 1) {
      stack.push(cards[i]);
      dfs(i + 1);
      stack.pop();
    }
  };

  dfs(0);
  return result;
}

function compareRanks(a: number[], b: number[]) {
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av !== bv) return av > bv ? 1 : -1;
  }
  return 0;
}

function describeRank(rankType: number) {
  const map: Record<number, string> = {
    8: 'Straight Flush',
    7: 'Four of a Kind',
    6: 'Full House',
    5: 'Flush',
    4: 'Straight',
    3: 'Three of a Kind',
    2: 'Two Pair',
    1: 'One Pair',
    0: 'High Card',
  };
  return map[rankType] ?? 'Unknown';
}
