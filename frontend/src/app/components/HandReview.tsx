import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import { 
  ArrowLeft, History, PlayCircle, ChevronRight, CheckCircle2, XCircle, BrainCircuit, Target, ShieldAlert, PauseCircle, ChevronLeft, Star
} from "lucide-react";
import { apiFetch } from "../api";
import { getCurrentAuth, getCurrentUserId } from "../auth";

// --- MOCK DATA ---
interface ActionStep {
  id: number;
  order: number | null;
  seatId: number | null;
  playerId: string;
  player: string;
  isHeroAction: boolean;
  street: "Preflop" | "Flop" | "Turn" | "River" | "Showdown";
  desc: string;
  pot: number;
  board: string[];
  heroCards: string[];
  opponents: { name: string; cards: string[] }[]; // Multiple opponents support
  analysis: string;
  evScore: number;
  heroEquity: number; // Win probability (%)
  heatMapType: "tight" | "premium" | "broadway" | "draws" | "bluff" | "showdown";
}

interface HandHistory {
  id: string;
  date: string;
  title: string;
  stakes: string;
  net: number;
  favorite: boolean;
  steps: ActionStep[];
}

interface HandActionAnalysisRecord {
  id: string;
  handId: string;
  actionOrder: number;
  seatId: number;
  playerId: string;
  street: string;
  provider: "local" | "openai" | "claude" | "gemini";
  model: string;
  analysis: string;
  createdByUserId: string;
  createdAt: string;
}

interface HandAnalyzeResponse {
  handId: string;
  provider: "local" | "openai" | "claude" | "gemini";
  model: string;
  summary: string;
  actions: Array<{
    order: number;
    analysis: string;
    createdAt: string;
  }>;
}

interface HandReviewAction {
  handId: string;
  order: number;
  seatId: number;
  playerId: string;
  action: string;
  amount: number;
  potAfter: number;
  street: string;
  createdAt: string;
}

interface HandReviewRecord {
  handId: string;
  roomId: string;
  participantIds: string[];
  participants?: {
    seatId: number;
    playerId: string;
    roleType: "human" | "bot";
    userId?: string;
    displayName: string;
    holeCards: string[];
  }[];
  boardCards: string[];
  actions: HandReviewAction[];
  winnerPlayerId: string;
  resultPot: number;
  analyses?: HandActionAnalysisRecord[];
  favoriteUserIds?: string[];
  createdAt: string;
}

const SUIT_MAP: Record<string, string> = {
  S: "\u2660",
  H: "\u2665",
  D: "\u2666",
  C: "\u2663",
};

function toUiCard(card: string) {
  if (card.length < 2) return card;
  const rank = card.slice(0, -1);
  const suit = card.slice(-1).toUpperCase();
  return `${rank}${SUIT_MAP[suit] ?? suit}`;
}

function toReviewStreet(street: string): ActionStep["street"] {
  if (street === "FLOP") return "Flop";
  if (street === "TURN") return "Turn";
  if (street === "RIVER") return "River";
  if (street === "SHOWDOWN" || street === "RESULT") return "Showdown";
  return "Preflop";
}

function toBoardByStreet(board: string[], street: string) {
  const cards = board.map(toUiCard);
  if (street === "FLOP") return cards.slice(0, 3);
  if (street === "TURN") return cards.slice(0, 4);
  if (street === "RIVER" || street === "SHOWDOWN" || street === "RESULT") return cards;
  return [];
}

function toRelativeDate(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return value;
  const diffMinutes = Math.max(1, Math.floor((Date.now() - timestamp) / 60000));
  if (diffMinutes < 60) return `${diffMinutes} mins ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hours ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} days ago`;
}

function toHeatMapType(action: string): ActionStep["heatMapType"] {
  if (action === "all-in") return "premium";
  if (action === "raise" || action === "bet") return "broadway";
  if (action === "call") return "draws";
  if (action === "fold") return "bluff";
  return "tight";
}

function toHandHistory(record: HandReviewRecord, viewerUserId: string | null): HandHistory {
  const participants = record.participants ?? [];
  const analyses = record.analyses ?? [];
  const heroParticipant = viewerUserId
    ? participants.find((participant) => participant.userId === viewerUserId) ?? null
    : null;
  const latestAnalysisByOrder = new Map<number, HandActionAnalysisRecord>();
  for (const item of analyses) {
    const prev = latestAnalysisByOrder.get(item.actionOrder);
    if (!prev || new Date(item.createdAt).getTime() >= new Date(prev.createdAt).getTime()) {
      latestAnalysisByOrder.set(item.actionOrder, item);
    }
  }

  const participantBySeat = new Map<number, NonNullable<HandReviewRecord["participants"]>[number]>();
  for (const participant of participants) {
    participantBySeat.set(participant.seatId, participant);
  }

  const opponents = participants
    .filter((participant) => !heroParticipant || participant.playerId !== heroParticipant.playerId)
    .map((participant) => ({
      name: participant.displayName,
      cards: participant.holeCards.map(toUiCard),
    }));

  const fallbackOpponents = record.participantIds.map((id, idx) => ({
    name: `P${idx + 1}`,
    cards: [] as string[],
  }));

  const resolvedOpponents = opponents.length > 0 ? opponents : fallbackOpponents;
  const heroCards = heroParticipant?.holeCards?.map(toUiCard) ?? [];
  const heroContribution = heroParticipant
    ? record.actions
        .filter((action) => action.playerId === heroParticipant.playerId)
        .reduce((sum, action) => sum + Math.max(action.amount, 0), 0)
    : 0;
  const heroWon = Boolean(heroParticipant && record.winnerPlayerId === heroParticipant.playerId);
  const handNet = heroParticipant
    ? (heroWon ? record.resultPot - heroContribution : -heroContribution)
    : record.resultPot;
  const winnerLabel =
    participants.find((participant) => participant.playerId === record.winnerPlayerId)
      ?.displayName ?? record.winnerPlayerId.slice(0, 8);

  const steps: ActionStep[] = record.actions
    .sort((a, b) => a.order - b.order)
    .map((action) => {
      const street = toReviewStreet(action.street);
      const actionName = action.action.toUpperCase();
      const amountText = action.amount > 0 ? ` $${action.amount.toLocaleString()}` : "";
      const actionOwner = participantBySeat.get(action.seatId);
      const latestAnalysis = latestAnalysisByOrder.get(action.order);
      const displayName = actionOwner?.displayName ?? `Seat ${action.seatId}`;
      const isHeroAction = Boolean(heroParticipant && action.playerId === heroParticipant.playerId);

      return {
        id: action.order,
        order: action.order,
        seatId: action.seatId,
        playerId: action.playerId,
        player: displayName,
        isHeroAction,
        street,
        desc: `${actionName}${amountText}`,
        pot: action.potAfter,
        board: toBoardByStreet(record.boardCards, action.street),
        heroCards,
        opponents: resolvedOpponents,
        analysis:
          latestAnalysis?.analysis ??
          `Live action replay from room ${record.roomId.slice(0, 8)}.`,
        evScore: 0,
        heroEquity: 50,
        heatMapType: toHeatMapType(action.action),
      };
    });

  steps.push({
    id: steps.length + 1,
    order: null,
    seatId: null,
    playerId: "system",
    player: "System",
    isHeroAction: false,
    street: "Showdown",
    desc: `Winner ${winnerLabel} wins $${record.resultPot.toLocaleString()}`,
    pot: record.resultPot,
    board: record.boardCards.map(toUiCard),
    heroCards,
    opponents: resolvedOpponents,
    analysis: "Showdown completed from real game data.",
    evScore: 0,
    heroEquity: 100,
    heatMapType: "showdown",
  });

  return {
    id: record.handId,
    date: toRelativeDate(record.createdAt),
    title: `Hand #${record.handId.slice(0, 8)}`,
    stakes: "LIVE",
    net: handNet,
    favorite: Boolean(viewerUserId && (record.favoriteUserIds ?? []).includes(viewerUserId)),
    steps,
  };
}

// --- 13x13 Range Grid Helper ---
const RANKS = ['A','K','Q','J','T','9','8','7','6','5','4','3','2'];

function getHeatMapColor(rIdx: number, cIdx: number, type: ActionStep['heatMapType']) {
  const isPair = rIdx === cIdx;
  const isSuited = cIdx > rIdx;
  const distance = rIdx + cIdx; // 0 (AA) to 24 (22)
  
  if (type === "showdown") return "bg-slate-800 text-slate-600 opacity-40"; // Disabled

  // Action Frequencies: Red=All-in, Orange=Raise, Blue=Call/Check, Slate=Fold
  if (type === "premium") {
    if (distance < 4 || (isPair && distance < 10)) return "bg-red-500 text-white"; // All-in range
    if (distance < 8 && isSuited) return "bg-orange-500 text-white"; // Raise range
    if (distance < 12) return "bg-blue-500 text-white"; // Call range
    return "bg-slate-800 text-slate-600"; // Fold range
  }
  
  if (type === "tight") {
    if (distance < 6 || (isPair && distance < 14)) return "bg-orange-500 text-white"; // Raise
    if (distance < 10 && isSuited) return "bg-gradient-to-br from-orange-500 to-blue-500 text-white"; // Mix Raise/Call
    if (distance < 14) return "bg-blue-500 text-white"; // Call
    return "bg-slate-800 text-slate-600"; // Fold
  }

  if (type === "broadway") {
    if (distance < 10 || (isPair && distance < 16)) return "bg-orange-500 text-white"; // Raise
    if (distance < 16 && (isSuited || isPair)) return "bg-blue-500 text-white"; // Call
    if (distance < 20 && isSuited) return "bg-gradient-to-br from-blue-500 to-slate-700 text-slate-300"; // Mix Call/Fold
    return "bg-slate-800 text-slate-600"; // Fold
  }

  if (type === "draws") {
    if (distance > 10 && distance < 20 && isSuited) return "bg-gradient-to-br from-red-500 to-blue-500 text-white"; // Shove/Call mix
    if (distance < 10) return "bg-orange-500 text-white"; // Raise
    if (distance < 16) return "bg-blue-500 text-white"; // Call
    return "bg-slate-800 text-slate-600"; // Fold
  }

  if (type === "bluff") {
    if (distance > 15 && !isPair && !isSuited) return "bg-gradient-to-br from-red-500 to-slate-800 text-white"; // Polarized Shove or Fold
    if (distance < 6) return "bg-blue-500 text-white"; // Trap/Call
    return "bg-slate-800 text-slate-600"; // Fold
  }

  return "bg-slate-800 text-slate-600";
}

type AnalysisProvider = "local" | "openai" | "claude" | "gemini";

const ANALYSIS_MODELS: Record<AnalysisProvider, Array<{ label: string; value: string }>> = {
  local: [
    { label: "Qwen 2.5 Coder", value: "qwen2.5-coder:3b" },
    { label: "EXAONE Deep", value: "exaone-deep:2.4b" },
  ],
  openai: [
    { label: "GPT-4.1 mini", value: "gpt-4.1-mini" },
    { label: "GPT-4.1", value: "gpt-4.1" },
  ],
  claude: [
    { label: "Claude 3.5 Sonnet", value: "claude-3-5-sonnet-latest" },
  ],
  gemini: [
    { label: "Gemini 1.5 Pro", value: "gemini-1.5-pro" },
  ],
};

export function HandReview() {
  const navigate = useNavigate();
  const { isLoggedIn, isPro } = getCurrentAuth();
  const viewerUserId = getCurrentUserId();
  const [hands, setHands] = useState<HandHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [selectedHand, setSelectedHand] = useState<HandHistory | null>(null);
  const [stepIdx, setStepIdx] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<"all" | "favorites">("all");
  const [analysisProvider, setAnalysisProvider] = useState<AnalysisProvider>("local");
  const [analysisModel, setAnalysisModel] = useState(ANALYSIS_MODELS.local[0].value);
  const [handAnalyzeBusy, setHandAnalyzeBusy] = useState(false);
  const [analysisSummary, setAnalysisSummary] = useState("");
  const [analysisError, setAnalysisError] = useState("");
  const [stepAnalysisMap, setStepAnalysisMap] = useState<Record<number, string>>({});
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isPro) {
      setHands([]);
      setLoading(false);
      setErrorMessage("");
      return;
    }

    const loadHands = async () => {
      setLoading(true);
      try {
        const list = await apiFetch<HandReviewRecord[]>("/hand-review/hands");
        const mapped = list
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .map((record) => toHandHistory(record, viewerUserId));
        setHands(mapped);
        setErrorMessage("");
      } catch (error) {
        setHands([]);
        setErrorMessage(error instanceof Error ? error.message : "Failed to load hand history.");
      } finally {
        setLoading(false);
      }
    };

    void loadHands();
  }, [isPro, viewerUserId]);

  useEffect(() => {
    const available = ANALYSIS_MODELS[analysisProvider];
    if (available.some((item) => item.value === analysisModel)) return;
    setAnalysisModel(available[0]?.value ?? "");
  }, [analysisProvider, analysisModel]);

  useEffect(() => {
    if (!selectedHand) {
      setStepAnalysisMap({});
      return;
    }

    const map: Record<number, string> = {};
    for (const step of selectedHand.steps) {
      if (step.order === null) continue;
      map[step.order] = step.analysis;
    }
    setStepAnalysisMap(map);
  }, [selectedHand?.id]);

  const toggleFavorite = async (handId: string, nextFavorite: boolean) => {
    try {
      await apiFetch<{ handId: string; favorite: boolean }>(`/hand-review/hands/${handId}/favorite`, {
        method: "POST",
        body: JSON.stringify({ favorite: nextFavorite }),
      });

      setHands((prev) =>
        prev.map((hand) =>
          hand.id === handId
            ? {
                ...hand,
                favorite: nextFavorite,
              }
            : hand,
        ),
      );
      setSelectedHand((prev) =>
        prev && prev.id === handId
          ? {
              ...prev,
              favorite: nextFavorite,
            }
          : prev,
      );
    } catch (error) {
      alert(error instanceof Error ? error.message : "즐겨찾기 저장에 실패했습니다.");
    }
  };

  const analyzeWholeHand = async () => {
    if (!selectedHand || handAnalyzeBusy) return;

    setHandAnalyzeBusy(true);
    setAnalysisSummary("");
    setAnalysisError("");
    try {
      const response = await apiFetch<HandAnalyzeResponse>(
        `/hand-review/hands/${selectedHand.id}/analyze`,
        {
          method: "POST",
          body: JSON.stringify({
            provider: analysisProvider,
            model: analysisModel,
            includePremiumAnalysis: true,
          }),
        },
      );

      const nextMap = response.actions.reduce<Record<number, string>>((acc, item) => {
        acc[item.order] = item.analysis;
        return acc;
      }, {});
      setStepAnalysisMap((prev) => ({ ...prev, ...nextMap }));

      setSelectedHand((prev) => {
        if (!prev || prev.id !== response.handId) return prev;
        return {
          ...prev,
          steps: prev.steps.map((step) =>
            step.order !== null && nextMap[step.order]
              ? {
                  ...step,
                  analysis: nextMap[step.order],
                }
              : step,
          ),
        };
      });

      setHands((prev) =>
        prev.map((hand) =>
          hand.id !== response.handId
            ? hand
            : {
                ...hand,
                steps: hand.steps.map((step) =>
                  step.order !== null && nextMap[step.order]
                    ? {
                        ...step,
                        analysis: nextMap[step.order],
                      }
                    : step,
                ),
              },
        ),
      );

      setAnalysisSummary(response.summary?.trim() ?? "");
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : "핸드 분석에 실패했습니다.");
    } finally {
      setHandAnalyzeBusy(false);
    }
  };

  if (!isPro) {
    return (
      <div className="flex flex-col w-full h-full bg-[#11122D] font-sans text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10 pointer-events-none" />
        <header className="relative z-10 flex items-center p-4 md:p-6 border-b border-white/5 bg-[#1A1C3E]">
          <button
            onClick={() => navigate("/lobby")}
            className="flex items-center gap-2 text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 px-4 py-2 rounded-full font-bold transition"
          >
            <ArrowLeft className="w-5 h-5" /> Back to Lobby
          </button>
        </header>
        <div className="flex-1 flex items-center justify-center p-6 z-10">
          <div className="max-w-xl w-full rounded-2xl border border-orange-500/40 bg-orange-500/10 p-6 text-center">
            <h2 className="text-2xl font-black text-white mb-2">Hand Review is PRO Only</h2>
            <p className="text-slate-300 font-semibold mb-6">
              {isLoggedIn ? "핸드 리플레이와 분석은 PRO 구독에서만 사용할 수 있습니다." : "로그인 후 PRO 구독이 필요합니다."}
            </p>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => navigate("/store")}
                className="bg-orange-500 hover:bg-orange-400 text-white font-black px-5 py-2.5 rounded-xl"
              >
                Go to Store
              </button>
              <button
                onClick={() => navigate("/lobby")}
                className="bg-slate-700 hover:bg-slate-600 text-white font-black px-5 py-2.5 rounded-xl"
              >
                Back
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Auto-play logic
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isPlaying && selectedHand) {
      if (stepIdx < selectedHand.steps.length - 1) {
        timer = setTimeout(() => setStepIdx(s => s + 1), 2000);
      } else {
        setIsPlaying(false);
      }
    }
    return () => clearTimeout(timer);
  }, [isPlaying, stepIdx, selectedHand]);

  // Scroll to active log item
  useEffect(() => {
    if (logRef.current) {
      const activeEl = logRef.current.querySelector('[data-active="true"]');
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [stepIdx, selectedHand]);

  // --- List View ---
  if (!selectedHand) {
    const visibleHands = historyFilter === "favorites"
      ? hands.filter((hand) => hand.favorite)
      : hands;

    return (
      <div className="flex flex-col w-full h-full bg-[#11122D] font-sans text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10 pointer-events-none" />
        
        <header className="relative z-10 flex items-center p-4 md:p-6 border-b border-white/5 bg-[#1A1C3E]">
          <button 
            onClick={() => navigate("/lobby")}
            className="flex items-center gap-2 text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 px-4 py-2 rounded-full font-bold transition"
          >
            <ArrowLeft className="w-5 h-5" /> Back to Lobby
          </button>
          <div className="mx-auto flex items-center gap-3">
            <History className="w-6 h-6 text-orange-400" />
            <h1 className="text-2xl font-black tracking-wider uppercase">Hand History</h1>
          </div>
          <div className="w-32"></div> {/* Spacer */}
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8 z-10">
          <div className="max-w-3xl mx-auto flex flex-col gap-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-slate-400 font-bold">Select a hand to review play-by-play.</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setHistoryFilter("all")}
                  className={`px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wider border transition ${historyFilter === "all" ? "bg-cyan-500/20 text-cyan-300 border-cyan-400/50" : "bg-white/5 text-slate-400 border-white/10 hover:text-white"}`}
                >
                  All
                </button>
                <button
                  onClick={() => setHistoryFilter("favorites")}
                  className={`px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wider border transition ${historyFilter === "favorites" ? "bg-yellow-500/20 text-yellow-300 border-yellow-400/50" : "bg-white/5 text-slate-400 border-white/10 hover:text-white"}`}
                >
                  Favorites
                </button>
              </div>
            </div>
            {loading && <p className="text-slate-300 font-semibold">Loading hands...</p>}
            {!loading && errorMessage && (
              <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-red-300 font-semibold">
                {errorMessage}
              </div>
            )}
            {!loading && !errorMessage && visibleHands.length === 0 && (
              <div className="rounded-xl border border-white/10 bg-[#242754] p-5 text-slate-300 font-semibold">
                {historyFilter === "favorites"
                  ? "No favorite hands yet."
                  : "No hands yet. Play a game first and come back for review."}
              </div>
            )}
            
            {visibleHands.map((hand, idx) => {
              const finalStep = hand.steps[hand.steps.length - 1];
              return (
                <motion.div
                  initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.1 }}
                  key={hand.id} onClick={() => { setSelectedHand(hand); setStepIdx(0); setIsPlaying(false); }}
                  className="relative bg-[#242754] border border-white/10 hover:border-orange-500/50 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between cursor-pointer group shadow-lg hover:shadow-[0_0_20px_rgba(249,115,22,0.15)] transition-all"
                >
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      void toggleFavorite(hand.id, !hand.favorite);
                    }}
                    className={`absolute right-4 top-4 rounded-full p-2 border transition ${hand.favorite ? "bg-yellow-500/20 border-yellow-400/50 text-yellow-300" : "bg-white/5 border-white/10 text-slate-400 hover:text-white"}`}
                    title={hand.favorite ? "Remove from favorites" : "Add to favorites"}
                  >
                    <Star className={`w-4 h-4 ${hand.favorite ? "fill-yellow-300" : ""}`} />
                  </button>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-slate-400 font-bold">{hand.date}</span>
                      <span className="text-slate-600">•</span>
                      <span className="text-cyan-400 font-mono font-bold bg-cyan-950/30 px-2 py-0.5 rounded">{hand.stakes}</span>
                    </div>
                    <h3 className="text-xl font-black text-white">{hand.title}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex gap-1">
                        {finalStep.heroCards.length === 0 && (
                          <span className="text-xs font-bold text-slate-500">Cards Hidden</span>
                        )}
                        {finalStep.heroCards.map((c, i) => (
                          <div key={i} className={`w-6 h-8 bg-white rounded flex items-center justify-center text-xs font-black border border-slate-300 ${c.includes('♥') || c.includes('♦') ? 'text-red-600' : 'text-slate-900'}`}>{c}</div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 md:mt-0 flex items-center justify-between md:justify-end md:gap-6 border-t md:border-t-0 border-white/5 pt-4 md:pt-0">
                    <div className="flex flex-col items-end">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Net Result</span>
                      <span className={`text-xl font-black ${hand.net > 0 ? 'text-green-400' : hand.net < 0 ? 'text-red-400' : 'text-slate-300'}`}>
                        {hand.net > 0 ? '+' : hand.net < 0 ? '-' : ''}${Math.abs(hand.net).toLocaleString()}
                      </span>
                    </div>
                    <div className="bg-orange-500/20 p-3 rounded-full group-hover:bg-orange-500 group-hover:text-white transition-colors">
                      <PlayCircle className="w-6 h-6 text-orange-400 group-hover:text-white" />
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // --- Step-by-Step Detail View ---
  const currentStep = selectedHand.steps[stepIdx];
  const isShowdown = currentStep.street === "Showdown";
  const currentStepAnalysis =
    currentStep.order !== null
      ? (stepAnalysisMap[currentStep.order] ?? currentStep.analysis)
      : currentStep.analysis;

  return (
    <div className="flex flex-col w-full h-full bg-[#11122D] font-sans text-white relative overflow-hidden">
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10 pointer-events-none" />
      
      {/* Header */}
      <header className="relative z-10 flex justify-between items-center p-4 border-b border-white/5 bg-[#1A1C3E]">
        <button 
          onClick={() => setSelectedHand(null)}
          className="flex items-center gap-2 text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 px-4 py-2 rounded-full font-bold transition"
        >
          <ArrowLeft className="w-5 h-5" /> Back to List
        </button>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              void toggleFavorite(selectedHand.id, !selectedHand.favorite);
            }}
            className={`rounded-full p-2 border transition ${selectedHand.favorite ? "bg-yellow-500/20 border-yellow-400/50 text-yellow-300" : "bg-white/5 border-white/10 text-slate-400 hover:text-white"}`}
            title={selectedHand.favorite ? "Remove from favorites" : "Add to favorites"}
          >
            <Star className={`w-4 h-4 ${selectedHand.favorite ? "fill-yellow-300" : ""}`} />
          </button>
          <span className="text-sm font-bold text-slate-400">{selectedHand.title}</span>
          <select
            value={analysisProvider}
            onChange={(event) => setAnalysisProvider(event.target.value as AnalysisProvider)}
            className="bg-[#11122D] border border-white/10 rounded-lg px-2 py-1 text-xs font-bold text-slate-200"
          >
            <option value="local">Local</option>
            <option value="openai">OpenAI</option>
            <option value="claude">Claude</option>
            <option value="gemini">Gemini</option>
          </select>
          <select
            value={analysisModel}
            onChange={(event) => setAnalysisModel(event.target.value)}
            className="bg-[#11122D] border border-white/10 rounded-lg px-2 py-1 text-xs font-bold text-slate-200"
          >
            {ANALYSIS_MODELS[analysisProvider].map((item) => (
              <option key={`${analysisProvider}-${item.value}`} value={item.value}>{item.label}</option>
            ))}
          </select>
          <button
            onClick={() => {
              void analyzeWholeHand();
            }}
            disabled={handAnalyzeBusy}
            className="px-3 py-1 rounded-lg text-xs font-black uppercase tracking-wider border border-orange-500/40 bg-orange-500/20 text-orange-300 hover:bg-orange-500/30 disabled:opacity-60 flex items-center gap-1"
          >
            <BrainCircuit className="w-3 h-3" />
            {handAnalyzeBusy ? "Analyzing" : "Analyze Hand"}
          </button>
          <div className="bg-orange-500/20 text-orange-400 px-3 py-1 rounded-full font-mono text-xs font-bold border border-orange-500/30 flex items-center gap-2 uppercase tracking-wider">
            <Target className="w-3 h-3" /> Step Analysis
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden z-10 flex-col md:flex-row">
        
        {/* Left: Replay Board */}
        <div className="w-full md:w-[45%] lg:w-[55%] p-4 md:p-8 flex flex-col items-center justify-center bg-[#151632] border-r border-white/5 relative">
           
           {/* Villain Area */}
           <div className="absolute top-4 md:top-8 w-full flex justify-center gap-6 md:gap-12 px-4 z-20">
              {currentStep.opponents.map((opp, idx) => (
                 <div key={`opp-${idx}`} className="flex flex-col items-center">
                    <span className="bg-black/50 px-3 py-1 rounded-full text-[10px] md:text-xs font-bold text-slate-400 border border-white/5 uppercase tracking-wider mb-2 shadow-lg backdrop-blur-sm">
                      {opp.name}
                    </span>
                    <div className="flex gap-1 md:gap-2 justify-center">
                       {opp.cards.length > 0 ? opp.cards.map((c, i) => (
                          <motion.div key={`v-${idx}-${i}`} initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className={`w-10 h-14 md:w-14 md:h-20 bg-white rounded-md md:rounded-lg shadow-xl flex items-center justify-center text-base md:text-xl font-black border-2 border-slate-300 ${c.includes('♥') || c.includes('♦') ? 'text-red-600' : 'text-slate-900'}`}>
                            {c}
                          </motion.div>
                       )) : (
                          <>
                            <div className="w-10 h-14 md:w-14 md:h-20 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-800 to-indigo-950 rounded-md md:rounded-lg shadow-xl border-2 border-white/20 flex items-center justify-center">
                              <ShieldAlert className="w-4 h-4 md:w-5 md:h-5 text-white/20"/>
                            </div>
                            <div className="w-10 h-14 md:w-14 md:h-20 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-800 to-indigo-950 rounded-md md:rounded-lg shadow-xl border-2 border-white/20 flex items-center justify-center">
                              <ShieldAlert className="w-4 h-4 md:w-5 md:h-5 text-white/20"/>
                            </div>
                          </>
                       )}
                    </div>
                 </div>
              ))}
           </div>

           {/* Table */}
           <div className="w-full max-w-[450px] h-[200px] md:h-[260px] bg-[#2E3C98] rounded-full border-[12px] border-[#1D2660] shadow-[inset_0_-5px_30px_rgba(0,0,0,0.5)] flex flex-col items-center justify-center relative mt-8 md:mt-0">
              
              <div className="absolute -top-6 bg-cyan-950/80 px-6 py-2 rounded-full border border-cyan-500/50 flex flex-col items-center shadow-xl backdrop-blur-sm z-10">
                <span className="text-cyan-400 font-black text-[10px] uppercase tracking-widest">Total Pot</span>
                <span className="text-white font-black text-xl">${currentStep.pot.toLocaleString()}</span>
              </div>
              
              <div className="flex gap-2 mt-4 min-h-[80px] items-center">
                <AnimatePresence mode="popLayout">
                  {currentStep.board.map((c, i) => (
                    <motion.div 
                      key={`board-${c}-${i}`} 
                      initial={{ scale: 0, rotateY: 90 }} 
                      animate={{ scale: 1, rotateY: 0 }} 
                      transition={{ type: "spring", bounce: 0.4 }}
                      className={`w-12 h-16 md:w-16 md:h-24 bg-white rounded-lg flex items-center justify-center text-lg md:text-2xl font-black border-2 border-slate-300 shadow-xl ${c.includes('♥') || c.includes('♦') ? 'text-red-600' : 'text-slate-900'}`}
                    >
                      {c}
                    </motion.div>
                  ))}
                  {currentStep.board.length === 0 && (
                    <span className="text-white/20 font-bold uppercase tracking-widest text-sm">Pre-Flop</span>
                  )}
                </AnimatePresence>
              </div>

              {/* Win Probability Bar (Hero) */}
              <div className="absolute -bottom-5 flex flex-col items-center w-full max-w-[200px] md:max-w-[250px] z-10 bg-black/60 px-4 py-1.5 rounded-full border border-white/10 backdrop-blur-sm shadow-xl">
                 <div className="flex justify-between w-full text-[9px] md:text-[10px] uppercase tracking-widest font-bold mb-1">
                   <span className="text-cyan-400">Win Prob</span>
                   <span className="text-slate-400">{currentStep.heroEquity}%</span>
                 </div>
                 <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                   <motion.div 
                     className={`h-full ${currentStep.heroEquity > 50 ? 'bg-gradient-to-r from-cyan-600 to-cyan-400' : 'bg-gradient-to-r from-orange-600 to-orange-400'}`}
                     initial={{ width: 0 }}
                     animate={{ width: `${currentStep.heroEquity}%` }}
                     transition={{ type: "spring", bounce: 0, duration: 0.8 }}
                   />
                 </div>
              </div>
           </div>

           {/* Hero Area */}
           <div className="absolute bottom-8 md:bottom-12 text-center">
              <div className="flex gap-2 mb-3 justify-center">
                 {currentStep.heroCards.length === 0 && (
                   <>
                     <div className="w-12 h-16 md:w-16 md:h-24 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-800 to-indigo-950 rounded-lg shadow-2xl border-2 border-white/20" />
                     <div className="w-12 h-16 md:w-16 md:h-24 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-800 to-indigo-950 rounded-lg shadow-2xl border-2 border-white/20" />
                   </>
                 )}
                 {currentStep.heroCards.map((c, i) => (
                    <motion.div key={`h-${i}`} className={`w-12 h-16 md:w-16 md:h-24 bg-white rounded-lg shadow-2xl flex items-center justify-center text-lg md:text-2xl font-black border-2 border-slate-300 ${c.includes('♥') || c.includes('♦') ? 'text-red-600' : 'text-slate-900'}`}>
                      {c}
                    </motion.div>
                 ))}
              </div>
              <span className="bg-cyan-500/20 text-cyan-400 px-4 py-1.5 rounded-full text-xs font-bold border border-cyan-500/30 uppercase tracking-wider">Hero (You)</span>
           </div>
        </div>

        {/* Right: Analysis & Logs Panel */}
        <div className="w-full md:w-[55%] lg:w-[45%] flex flex-col bg-[#1A1C3E]">
           
           {/* Top: Action Log (Scrollable) */}
           <div className="h-1/3 min-h-[200px] border-b border-white/5 flex flex-col">
             <div className="px-4 py-3 bg-[#1A1C3E] border-b border-white/5 shadow-md z-20 shrink-0">
               <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">Play-by-Play Action Log</h3>
             </div>
             <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-[#161836]" ref={logRef}>
               <div className="flex flex-col gap-2">
                 {selectedHand.steps.map((step, idx) => {
                 const isActive = idx === stepIdx;
                   const isHero = step.isHeroAction;
                 const isSystem = step.player === "System";

                 return (
                   <div 
                     key={step.id} 
                     data-active={isActive}
                     onClick={() => { setStepIdx(idx); setIsPlaying(false); }}
                     className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border ${
                       isActive ? 'bg-orange-500/20 border-orange-500/50 shadow-[0_0_15px_rgba(249,115,22,0.15)] scale-[1.02]' 
                       : 'bg-white/5 border-white/5 hover:bg-white/10'
                     }`}
                   >
                      <div className={`w-16 shrink-0 text-xs font-black text-center py-1 rounded ${isActive ? 'bg-orange-500 text-white' : 'bg-slate-800 text-slate-400'}`}>
                        {step.street}
                      </div>
                      <div className="flex-1 flex gap-2 items-center">
                        {!isSystem && (
                          <span className={`text-xs font-bold px-2 py-0.5 rounded uppercase ${isHero ? 'bg-cyan-500/20 text-cyan-400' : 'bg-slate-700 text-slate-300'}`}>
                            {step.player}
                          </span>
                        )}
                        <span className={`text-sm font-semibold ${isActive ? 'text-white' : 'text-slate-300'}`}>
                          {step.desc}
                        </span>
                      </div>
                   </div>
                 )
               })}
             </div>
           </div>
         </div>

         {/* Middle: Step Analysis & Heatmap */}
           <div className="flex-1 p-5 overflow-y-auto bg-[#161836]">
              <AnimatePresence mode="wait">
                <motion.div 
                  key={`analysis-${stepIdx}`} 
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                  className="flex flex-col gap-5"
                >
                  {/* Analysis Text */}
                  <div className={`p-4 rounded-xl border flex gap-3 ${currentStep.evScore > 0 ? 'bg-green-500/10 border-green-500/30' : currentStep.evScore < 0 ? 'bg-red-500/10 border-red-500/30' : 'bg-slate-800/50 border-slate-600/50'}`}>
                    {currentStep.evScore > 0 ? <CheckCircle2 className="w-6 h-6 text-green-400 shrink-0"/> : currentStep.evScore < 0 ? <XCircle className="w-6 h-6 text-red-400 shrink-0"/> : <Target className="w-6 h-6 text-slate-400 shrink-0"/>}
                    <div>
                      <h4 className="font-bold mb-1 text-white flex items-center gap-2">
                        Step Analysis
                        {currentStep.evScore !== 0 && (
                           <span className={`text-xs px-2 py-0.5 rounded-full ${currentStep.evScore > 0 ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
                             {currentStep.evScore > 0 ? '+' : ''}{currentStep.evScore} EV
                           </span>
                        )}
                      </h4>
                      <p className="text-sm text-slate-300 leading-relaxed">{currentStepAnalysis}</p>
                      {analysisSummary && (
                        <p className="mt-2 text-xs font-semibold text-cyan-300">{analysisSummary}</p>
                      )}
                      {analysisError && (
                        <p className="mt-2 text-xs font-semibold text-red-300">{analysisError}</p>
                      )}
                    </div>
                  </div>

                  {/* Range Heatmap */}
                  <div className="bg-[#242754] p-4 md:p-5 rounded-2xl border border-white/5 shadow-lg flex flex-col items-center relative">
                     {isShowdown && (
                       <div className="absolute inset-0 bg-black/60 backdrop-blur-sm rounded-2xl flex flex-col items-center justify-center z-20">
                          <span className="text-2xl font-black text-white uppercase tracking-widest">Hand Over</span>
                          <span className="text-sm text-slate-300 mt-2 font-bold">{currentStep.desc}</span>
                       </div>
                     )}
                     
                     <div className="flex justify-between w-full mb-4 items-end">
                       <h4 className="font-black text-slate-300 uppercase tracking-wider text-xs md:text-sm">Opponent Range Estimate</h4>
                       <span className="text-[10px] md:text-xs font-bold text-orange-400 bg-orange-500/10 px-2 py-1 rounded">Live updating...</span>
                     </div>
                     
                     <div className="grid grid-cols-13 gap-[1px] md:gap-[2px] bg-slate-800 p-1 md:p-1.5 rounded-lg border border-white/10 w-full max-w-[320px] aspect-square" style={{ gridTemplateColumns: 'repeat(13, minmax(0, 1fr))'}}>
                       {RANKS.map((rowRank, rIdx) => (
                         RANKS.map((colRank, cIdx) => {
                           const label = rIdx === cIdx ? `${rowRank}${rowRank}` : cIdx > rIdx ? `${rowRank}${colRank}s` : `${colRank}${rowRank}o`;
                           const colorClass = getHeatMapColor(rIdx, cIdx, currentStep.heatMapType);
                           
                           // Highlight Hero's actual cards
                           const isHeroCombo = currentStep.heroCards.length > 0 && 
                                             (currentStep.heroCards[0][0] === label[0] && currentStep.heroCards[1][0] === label[1] ||
                                              currentStep.heroCards[0][0] === label[1] && currentStep.heroCards[1][0] === label[0]);

                           return (
                             <div 
                               key={`${rIdx}-${cIdx}`} 
                               title={label} 
                               className={`w-full h-full text-[6px] md:text-[8px] flex items-center justify-center font-bold transition-all duration-500 ${colorClass} ${isHeroCombo ? 'ring-2 ring-cyan-400 z-10 scale-125 shadow-lg' : ''}`}
                             >
                               {label}
                             </div>
                           );
                         })
                       ))}
                     </div>
                     
                     <div className="flex flex-wrap gap-3 md:gap-5 mt-4 text-[9px] md:text-xs font-bold text-slate-400 w-full justify-center">
                       <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-red-500 rounded-sm shadow-sm"></div> All-in</div>
                       <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-orange-500 rounded-sm shadow-sm"></div> Raise</div>
                       <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-blue-500 rounded-sm shadow-sm"></div> Call/Check</div>
                       <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-gradient-to-br from-orange-500 to-blue-500 rounded-sm shadow-sm"></div> Mixed</div>
                       <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-slate-800 border border-slate-600 rounded-sm"></div> Fold</div>
                     </div>
                  </div>
                </motion.div>
              </AnimatePresence>
           </div>

           {/* Bottom: Navigation Controls */}
           <div className="p-4 border-t border-white/5 bg-[#1A1C3E] flex items-center justify-between shrink-0">
             <button 
               onClick={() => { setStepIdx(s => Math.max(0, s - 1)); setIsPlaying(false); }}
               disabled={stepIdx === 0}
               className="p-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-full text-white transition-colors"
             >
               <ChevronLeft className="w-6 h-6" />
             </button>

             <button 
               onClick={() => setIsPlaying(!isPlaying)}
               className={`flex items-center gap-2 px-6 py-3 rounded-full font-black text-sm uppercase tracking-wider transition-all shadow-lg ${isPlaying ? 'bg-red-500/20 text-red-400 border border-red-500/50 hover:bg-red-500/30' : 'bg-orange-500 text-white hover:bg-orange-400 shadow-[0_4px_0_#C2410C] active:translate-y-1 active:shadow-none'}`}
             >
               {isPlaying ? <><PauseCircle className="w-5 h-5"/> Pause</> : <><PlayCircle className="w-5 h-5"/> Auto Play</>}
             </button>

             <button 
               onClick={() => { setStepIdx(s => Math.min(selectedHand.steps.length - 1, s + 1)); setIsPlaying(false); }}
               disabled={stepIdx === selectedHand.steps.length - 1}
               className="p-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-full text-white transition-colors"
             >
               <ChevronRight className="w-6 h-6" />
             </button>
           </div>

        </div>
      </div>
    </div>
  );
}
