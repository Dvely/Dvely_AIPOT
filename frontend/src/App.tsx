import { useEffect, useMemo, useState } from 'react'
import './App.css'

type Mode = 'guest' | 'member'
type TableType = 'heads-up' | '6-max' | '9-max'
type Difficulty = 'easy' | 'normal' | 'hard'
type AiModelType = 'random' | 'openai' | 'gemini' | 'anthropic'
type AppScreen = 'loading' | 'landing' | 'lobby' | 'game'

interface LobbyResponse {
  profile: {
    mode: Mode
    nickname: string
    bankroll: number
    isPremium: boolean
    language: 'ko' | 'en'
  }
  quickStartPreset: {
    tableType: TableType
    difficulty: Difficulty
    localBots: number
  }
  recommendedBots: Array<{
    id: string
    name: string
    style: string
    difficulty: Difficulty
    tier: 'free' | 'premium'
    engine: string
    chatTone: string
  }>
}

interface PlayState {
  sessionId: string
  mode: Mode
  tableType: TableType
  difficulty: Difficulty
  opponent: string
  selectedAiModel: AiModelType
  street: 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'finished'
  pot: number
  heroStack: number
  aiStack: number
  toCall: number
  actorTurn: 'hero' | 'ai'
  aiPending: boolean
  heroCards: string[]
  opponentCards: string[]
  board: string[]
  availableActions: Array<'fold' | 'check' | 'call' | 'bet' | 'raise'>
  winner: 'hero' | 'ai' | 'draw' | null
  winnerReason: string | null
  isFinished: boolean
  events: string[]
}

interface BotConfig {
  id: string
  name: string
  style: string
  provider: AiModelType
  tier: 'free' | 'premium'
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api'

const SUIT_SYMBOL: Record<string, string> = {
  s: '♠',
  h: '♥',
  d: '♦',
  c: '♣',
}

const SUIT_KO: Record<string, string> = {
  s: '스페이드',
  h: '하트',
  d: '다이아',
  c: '클로버',
}

const BASE_BOTS: BotConfig[] = [
  { id: 'random-core', name: 'Random Rookie', style: '난수 기반 즉시 플레이', provider: 'random', tier: 'free' },
  { id: 'openai-pro', name: 'OpenAI Pro', style: '설명형 전략 대응', provider: 'openai', tier: 'premium' },
  { id: 'gemini-flow', name: 'Gemini Flow', style: '균형형 템포 플레이', provider: 'gemini', tier: 'premium' },
  { id: 'anthropic-sage', name: 'Anthropic Sage', style: '리스크 관리형', provider: 'anthropic', tier: 'premium' },
]

function providerFromEngine(engine: string): AiModelType {
  if (engine.toLowerCase().includes('gpt')) return 'openai'
  if (engine.toLowerCase().includes('gemini')) return 'gemini'
  if (engine.toLowerCase().includes('claude')) return 'anthropic'
  return 'random'
}

function CardFace({ card, back = false }: { card: string; back?: boolean }) {
  if (back || card === '??' || card === '--' || card.includes('?')) {
    return <span className="table-card back" />
  }

  const rank = card.slice(0, 1)
  const suit = card.slice(1, 2)
  const red = suit === 'h' || suit === 'd'
  return (
    <span className={red ? 'table-card red' : 'table-card black'}>
      <em>{rank}</em>
      <b>{SUIT_SYMBOL[suit] ?? '♠'}</b>
      <small>{SUIT_KO[suit] ?? ''}</small>
    </span>
  )
}

function App() {
  const [screen, setScreen] = useState<AppScreen>('loading')
  const [lobbyTab, setLobbyTab] = useState<'instant' | 'open' | 'leaderboard'>('instant')
  const [mode, setMode] = useState<Mode>('member')
  const [tableType, setTableType] = useState<TableType>('6-max')
  const [difficulty, setDifficulty] = useState<Difficulty>('easy')

  const [lobby, setLobby] = useState<LobbyResponse | null>(null)
  const [botLibrary, setBotLibrary] = useState<BotConfig[]>(BASE_BOTS)
  const [activeBotIds, setActiveBotIds] = useState<string[]>(['random-core'])
  const [nextBotIndex, setNextBotIndex] = useState(0)

  const [playState, setPlayState] = useState<PlayState | null>(null)
  const [sessionInfo, setSessionInfo] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [isActionLoading, setIsActionLoading] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setScreen('landing'), 1200)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    const fetchLobbyData = async () => {
      const lobbyRes = await fetch(`${API_BASE}/lobby?mode=${mode}`)
      const lobbyData = (await lobbyRes.json()) as LobbyResponse
      setLobby(lobbyData)
      setTableType(lobbyData.quickStartPreset.tableType)
      setDifficulty(lobbyData.quickStartPreset.difficulty)

      const mapped = lobbyData.recommendedBots.map((bot) => ({
        id: `rec-${bot.id}`,
        name: bot.name,
        style: bot.style,
        provider: providerFromEngine(bot.engine),
        tier: bot.tier,
      }))

      const merged = [...BASE_BOTS]
      for (const item of mapped) {
        if (!merged.find((m) => m.id === item.id)) merged.push(item)
      }
      setBotLibrary(merged)
      setActiveBotIds((prev) => (prev.length ? prev : [merged[0].id]))
    }

    fetchLobbyData().catch(() => {
      setSessionInfo('API 연결 실패: backend 서버를 실행해 주세요.')
    })
  }, [mode])

  const activeBots = useMemo(
    () => botLibrary.filter((bot) => activeBotIds.includes(bot.id)),
    [botLibrary, activeBotIds],
  )

  const addBot = (botId: string) => {
    setActiveBotIds((prev) => (prev.includes(botId) ? prev : [...prev, botId]))
  }

  const removeBot = (botId: string) => {
    setActiveBotIds((prev) => {
      if (prev.length <= 1) return prev
      return prev.filter((id) => id !== botId)
    })
  }

  const startQuickMatch = async () => {
    if (!activeBots.length) {
      setSessionInfo('활성 봇을 최소 1개 이상 추가해 주세요.')
      return false
    }

    const selected = activeBots[nextBotIndex % activeBots.length]
    setNextBotIndex((v) => v + 1)

    setIsLoading(true)
    try {
      const response = await fetch(`${API_BASE}/play/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          tableType,
          difficulty,
          aiModel: selected.provider,
        }),
      })

      const data = (await response.json()) as PlayState
      setPlayState(data)
      setSessionInfo(`매칭 봇 ${selected.name} · 세션 ${data.sessionId}`)
      return true
    } catch {
      setSessionInfo('매칭 실패: 서버 상태를 확인하세요.')
      return false
    } finally {
      setIsLoading(false)
    }
  }

  const enterGameFromLobby = async () => {
    const ok = await startQuickMatch()
    if (ok) setScreen('game')
  }

  const applyAction = async (action: 'fold' | 'check' | 'call' | 'bet' | 'raise') => {
    if (!playState || isActionLoading) return
    setIsActionLoading(true)
    try {
      const response = await fetch(`${API_BASE}/play/${playState.sessionId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = (await response.json()) as PlayState
      setPlayState(data)

      if (data.aiPending) {
        setSessionInfo(`${data.opponent}가 생각 중입니다...`)
      } else if (data.isFinished) {
        setSessionInfo(`핸드 종료: ${data.winner === 'hero' ? '승리' : data.winner === 'ai' ? '패배' : '무승부'} · ${data.winnerReason ?? ''}`)
      }
    } finally {
      setIsActionLoading(false)
    }
  }

  useEffect(() => {
    if (!playState?.aiPending || !playState.sessionId) return

    const timer = window.setInterval(async () => {
      const response = await fetch(`${API_BASE}/play/${playState.sessionId}`)
      const data = (await response.json()) as PlayState
      setPlayState(data)

      if (!data.aiPending && !data.isFinished) {
        setSessionInfo(`당신의 턴입니다. To Call ${data.toCall}`)
      }
      if (data.isFinished) {
        setSessionInfo(`핸드 종료: ${data.winner === 'hero' ? '승리' : data.winner === 'ai' ? '패배' : '무승부'} · ${data.winnerReason ?? ''}`)
      }
    }, 800)

    return () => window.clearInterval(timer)
  }, [playState?.aiPending, playState?.sessionId])

  const bankrollText = useMemo(() => {
    if (!lobby) return '--'
    return lobby.profile.bankroll.toLocaleString('ko-KR')
  }, [lobby])

  const seatCount = tableType === 'heads-up' ? 2 : tableType === '6-max' ? 6 : 9
  const seatClasses = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9']

  const tableSeats = useMemo(() => {
    const seats: Array<{ id: string; name: string; stack: string; isHero?: boolean; isOpponent?: boolean }> = []
    for (let i = 0; i < seatCount; i += 1) {
      if (i === seatCount - 1) {
        seats.push({ id: `hero-${i}`, name: 'YOU', stack: playState ? `${playState.heroStack}` : '2,000', isHero: true })
      } else if (i === 0) {
        seats.push({ id: `opp-${i}`, name: playState ? playState.opponent.split(' ')[0] : 'BOT', stack: playState ? `${playState.aiStack}` : '2,000', isOpponent: true })
      } else {
        seats.push({ id: `bot-${i}`, name: `BOT ${i}`, stack: `${1900 + i * 70}` })
      }
    }
    return seats
  }, [seatCount, playState])

  const boardCards = playState?.board.length ? playState.board : ['--', '--', '--', '--', '--']

  const getSeatCards = (seatIndex: number, seat: { isHero?: boolean; isOpponent?: boolean }) => {
    if (seat.isHero) return []
    if (seat.isOpponent) return playState?.opponentCards ?? ['??', '??']

    const pseudoRanks = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6']
    const rank = pseudoRanks[seatIndex % pseudoRanks.length]
    return [`${rank}?`, `${rank}?`]
  }

  if (screen === 'loading') {
    return (
      <main className="scene loading-scene">
        <div className="loading-logo">AIPOT</div>
        <p>Connecting Table...</p>
        <span className="spinner" />
      </main>
    )
  }

  if (screen === 'landing') {
    return (
      <main className="scene landing-scene">
        <div className="landing-card">
          <p className="eyebrow">AIPOT</p>
          <h1>재미있게 플레이하고, 끝나면 제대로 배우는 홀덤</h1>
          <p>AI 봇전 · 복기 분석 · 모바일 가로모드 최적화</p>
          <button className="big-btn" onClick={() => setScreen('lobby')}>로비 입장</button>
        </div>
      </main>
    )
  }

  if (screen === 'lobby') {
    return (
      <main className="scene lobby-scene">
        <header className="lobby-topbar">
          <div className="brand">AIPOT</div>
          <div className="wallet-pack">
            <span className="wallet-badge">#{Math.floor(930000 + Math.random() * 999)}</span>
            <span className="wallet-chip">보유칩 {bankrollText}</span>
          </div>
        </header>

        <section className="lobby-layout">
          <aside className="lobby-sidebar">
            <button className="menu-btn">CUSTOMIZE</button>
            <button className="menu-btn yellow">CREATE PRIVATE</button>
            <button className="menu-btn lime">JOIN PRIVATE</button>
            <button className="menu-btn cyan">MOBILE MODE</button>
            <div className="settings-box">
              <label>
                모드
                <select value={mode} onChange={(event) => setMode(event.target.value as Mode)}>
                  <option value="guest">게스트</option>
                  <option value="member">회원</option>
                </select>
              </label>
              <label>
                인원
                <select value={tableType} onChange={(event) => setTableType(event.target.value as TableType)}>
                  <option value="heads-up">헤즈업</option>
                  <option value="6-max">6인</option>
                  <option value="9-max">9인</option>
                </select>
              </label>
              <label>
                난이도
                <select value={difficulty} onChange={(event) => setDifficulty(event.target.value as Difficulty)}>
                  <option value="easy">쉬움</option>
                  <option value="normal">보통</option>
                  <option value="hard">어려움</option>
                </select>
              </label>
            </div>
          </aside>

          <section className="lobby-main">
            <div className="lobby-tabs">
              <button className={lobbyTab === 'instant' ? 'tab active' : 'tab'} onClick={() => setLobbyTab('instant')}>INSTANT TABLES</button>
              <button className={lobbyTab === 'open' ? 'tab active' : 'tab'} onClick={() => setLobbyTab('open')}>OPEN TABLES</button>
              <button className={lobbyTab === 'leaderboard' ? 'tab active' : 'tab'} onClick={() => setLobbyTab('leaderboard')}>LEADERBOARD</button>
              <button className="tab quest">QUESTS</button>
            </div>

            <div className="mode-cards">
              <button className="mode-card mint">Classic Poker</button>
              <button className="mode-card sky">Short Deck</button>
              <button className="mode-card amber">All-in or Fold</button>
              <button className="mode-card violet">Bounties</button>
              <button className="mode-card red">Bomb Poker</button>
            </div>

            <div className="bot-manager">
              <h3>봇 로스터 설정</h3>
              <p>추가/삭제로 활성 봇을 구성하세요. 다음 핸드마다 순환 매칭됩니다.</p>

              <div className="bot-pool">
                {botLibrary.map((bot) => {
                  const active = activeBotIds.includes(bot.id)
                  return (
                    <div key={bot.id} className={active ? 'bot-chip active' : 'bot-chip'}>
                      <div>
                        <strong>{bot.name}</strong>
                        <small>{bot.style} · {bot.provider}</small>
                      </div>
                      {active ? (
                        <button onClick={() => removeBot(bot.id)} disabled={activeBotIds.length <= 1}>삭제</button>
                      ) : (
                        <button onClick={() => addBot(bot.id)}>추가</button>
                      )}
                    </div>
                  )
                })}
              </div>

              <div className="active-summary">활성 봇 {activeBotIds.length}명</div>
              <button className="big-btn" onClick={enterGameFromLobby} disabled={isLoading || !activeBotIds.length}>
                {isLoading ? '매칭 중...' : '테이블 입장'}
              </button>
            </div>
          </section>
        </section>
      </main>
    )
  }

  return (
    <main className="aipot-shell">
      <div className="rotate-warning">최적 경험을 위해 휴대폰 가로모드로 플레이하세요.</div>

      <header className="topbar glass">
        <div>
          <p className="eyebrow">AIPOT GAME</p>
          <h1>텍사스 홀덤 AI 테이블</h1>
        </div>
        <div className="profile-row">
          <button className="chip" onClick={() => setScreen('lobby')}>로비</button>
          <div className="bankroll">보유칩 {bankrollText}</div>
        </div>
      </header>

      <section className="table-stage glass">
        <div className="table-headline">
          <div className="mode-picks">
            <label>
              인원
              <select value={tableType} onChange={(event) => setTableType(event.target.value as TableType)}>
                <option value="heads-up">헤즈업</option>
                <option value="6-max">6인</option>
                <option value="9-max">9인</option>
              </select>
            </label>
            <label>
              난이도
              <select value={difficulty} onChange={(event) => setDifficulty(event.target.value as Difficulty)}>
                <option value="easy">쉬움</option>
                <option value="normal">보통</option>
                <option value="hard">어려움</option>
              </select>
            </label>
            <button className="cta" disabled={isLoading} onClick={startQuickMatch}>
              {isLoading ? '매칭 중...' : playState ? '핸드 재시작' : '입장'}
            </button>
          </div>
          <div className="session-info">
            {sessionInfo || '세션 대기 중'}
            {playState ? ` · 턴 ${playState.actorTurn === 'hero' ? 'HERO' : 'AI'} · 모델 ${playState.selectedAiModel}` : ''}
          </div>
        </div>

        <div className="poker-surface">
          <div className="table-ring" />

          {tableSeats.map((seat, idx) => (
            <div key={seat.id} className={`seat ${seatClasses[idx]}`}>
              <div className={seat.isHero ? 'avatar hero' : seat.isOpponent ? 'avatar opp' : 'avatar'}>{seat.name.slice(0, 1)}</div>
              <p className="seat-name">{seat.name}</p>
              <p className="seat-stack">{seat.stack}</p>
              {!seat.isHero ? (
                <div className="seat-cards">
                  {getSeatCards(idx, seat).map((card, cardIdx) => (
                    <CardFace key={`${seat.id}-${cardIdx}-${card}`} card={card} back={!seat.isOpponent} />
                  ))}
                </div>
              ) : null}
            </div>
          ))}

          <div className="board-center">
            <p className="pot-chip">POT {playState?.pot ?? 0}</p>
            <div className="community-cards">
              {boardCards.map((card, idx) => (
                <CardFace key={`board-${idx}-${card}`} card={card} />
              ))}
            </div>
            <p className="street-label">{playState ? playState.street.toUpperCase() : 'READY'}</p>
          </div>

          <div className="hero-hand-area">
            <div className="hero-cards">
              {(playState?.heroCards ?? ['--', '--']).map((card, idx) => (
                <CardFace key={`hero-${idx}-${card}`} card={card} />
              ))}
            </div>
            <div className="hero-stack">내 스택 {playState?.heroStack ?? 2000}</div>
          </div>

          <div className="action-dock">
            {playState ? (
              !playState.isFinished ? (
                playState.availableActions.map((action) => (
                  <button
                    key={action}
                    className="action-btn"
                    disabled={isActionLoading || playState.actorTurn !== 'hero' || playState.aiPending}
                    onClick={() => applyAction(action)}
                  >
                    {isActionLoading ? '처리 중' : playState.aiPending ? 'AI THINK...' : action.toUpperCase()}
                  </button>
                ))
              ) : (
                <button className="action-btn primary" onClick={startQuickMatch}>다음 핸드</button>
              )
            ) : (
              <button className="action-btn primary" onClick={startQuickMatch}>게임 시작</button>
            )}
          </div>
        </div>
      </section>
    </main>
  )
}

export default App
