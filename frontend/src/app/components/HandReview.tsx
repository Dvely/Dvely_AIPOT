import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import { 
  ArrowLeft, History, PlayCircle, ChevronRight, CheckCircle2, XCircle, BrainCircuit, Target, ShieldAlert, PauseCircle, ChevronLeft, FastForward
} from "lucide-react";

// --- MOCK DATA ---
interface ActionStep {
  id: number;
  player: string;
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
  steps: ActionStep[];
}

const mockHands: HandHistory[] = [
  {
    id: "h1",
    date: "2 mins ago",
    title: "AA vs KK All-in Preflop",
    stakes: "$500/$1000",
    net: 21250,
    steps: [
      {
        id: 1, player: "Villain", street: "Preflop", desc: "Raises to $2,500", pot: 4000, board: [], heroCards: ["A♠", "A♥"], opponents: [{ name: "Villain", cards: [] }],
        analysis: "Villain opens from early position. Their range is likely tight (top 15% of hands).", evScore: 0, heroEquity: 82, heatMapType: "tight"
      },
      {
        id: 2, player: "Hero", street: "Preflop", desc: "3-Bets to $7,500", pot: 11500, board: [], heroCards: ["A♠", "A♥"], opponents: [{ name: "Villain", cards: [] }],
        analysis: "Excellent 3-bet. With AA, you must build the pot immediately and deny equity to speculative hands.", evScore: +1.5, heroEquity: 82, heatMapType: "premium"
      },
      {
        id: 3, player: "Villain", street: "Preflop", desc: "4-Bets All-in $21,250", pot: 28750, board: [], heroCards: ["A♠", "A♥"], opponents: [{ name: "Villain", cards: [] }],
        analysis: "Villain jams. Their range narrows to QQ+, AKs. You are crushing this range.", evScore: 0, heroEquity: 82, heatMapType: "premium"
      },
      {
        id: 4, player: "Hero", street: "Preflop", desc: "Calls $13,750", pot: 42500, board: [], heroCards: ["A♠", "A♥"], opponents: [{ name: "Villain", cards: [] }],
        analysis: "Snap call. Folding here would be a catastrophic mistake.", evScore: +4.2, heroEquity: 82, heatMapType: "premium"
      },
      {
        id: 5, player: "System", street: "Showdown", desc: "Hero wins $42,500", pot: 42500, board: ["7♦", "2♠", "Q♥", "5♣", "9♠"], heroCards: ["A♠", "A♥"], opponents: [{ name: "Villain", cards: ["K♣", "K♦"] }],
        analysis: "Board runs out clean. AA holds against KK. Perfect execution.", evScore: 0, heroEquity: 100, heatMapType: "showdown"
      }
    ]
  },
  {
    id: "h2",
    date: "15 mins ago",
    title: "Tough Fold on the Turn",
    stakes: "$100/$200",
    net: -600,
    steps: [
      {
        id: 1, player: "Hero", street: "Preflop", desc: "Raises to $600", pot: 900, board: [], heroCards: ["7♠", "8♠"], opponents: [{ name: "Villain", cards: [] }],
        analysis: "Standard open with a suited connector from late position to steal blinds or play a multi-way pot.", evScore: +0.2, heroEquity: 42, heatMapType: "broadway"
      },
      {
        id: 2, player: "Villain", street: "Preflop", desc: "Calls $600", pot: 1500, board: [], heroCards: ["7♠", "8♠"], opponents: [{ name: "Villain", cards: [] }],
        analysis: "Villain defends BB. Their range is wide but capped (likely no AA, KK, AK).", evScore: 0, heroEquity: 45, heatMapType: "broadway"
      },
      {
        id: 3, player: "Hero", street: "Flop", desc: "C-Bets $800", pot: 2300, board: ["9♠", "10♠", "2♣"], heroCards: ["7♠", "8♠"], opponents: [{ name: "Villain", cards: [] }],
        analysis: "Great c-bet. You flopped a massive open-ended straight flush draw. You want to build the pot.", evScore: +1.8, heroEquity: 56, heatMapType: "draws"
      },
      {
        id: 4, player: "Villain", street: "Flop", desc: "Calls $800", pot: 3100, board: ["9♠", "10♠", "2♣"], heroCards: ["7♠", "8♠"], opponents: [{ name: "Villain", cards: [] }],
        analysis: "Villain calls. They likely have a piece (Tx, 9x) or a worse draw.", evScore: 0, heroEquity: 54, heatMapType: "broadway"
      },
      {
        id: 5, player: "Hero", street: "Turn", desc: "Checks", pot: 3100, board: ["9♠", "10♠", "2♣", "A♥"], heroCards: ["7♠", "8♠"], opponents: [{ name: "Villain", cards: [] }],
        analysis: "Checking the Ace is prudent. It hits Villain's calling range hard (A9, AT, AQ).", evScore: +0.5, heroEquity: 28, heatMapType: "tight"
      },
      {
        id: 6, player: "Villain", street: "Turn", desc: "Bets $3,400", pot: 6500, board: ["9♠", "10♠", "2♣", "A♥"], heroCards: ["7♠", "8♠"], opponents: [{ name: "Villain", cards: [] }],
        analysis: "Villain overbets the pot. This strongly polarizes their range to two-pair+ or pure bluffs.", evScore: 0, heroEquity: 28, heatMapType: "bluff"
      },
      {
        id: 7, player: "Hero", street: "Turn", desc: "Folds", pot: 6500, board: ["9♠", "10♠", "2♣", "A♥"], heroCards: ["7♠", "8♠"], opponents: [{ name: "Villain", cards: [] }],
        analysis: "Excellent discipline. You don't have the direct pot odds to call for your draw against this sizing.", evScore: +1.5, heroEquity: 0, heatMapType: "draws"
      }
    ]
  },
  {
    id: "h3",
    date: "Just now",
    title: "3-Way All-in on the Flop",
    stakes: "$200/$400",
    net: 48000,
    steps: [
      {
        id: 1, player: "UTG", street: "Preflop", desc: "Raises to $1,200", pot: 1800, board: [], heroCards: ["9♠", "8♠"], opponents: [{ name: "UTG", cards: [] }, { name: "BTN", cards: [] }],
        analysis: "UTG opens strong. BTN and you (BB) call. Multi-way dynamics require careful play of drawing hands.", evScore: 0, heroEquity: 22, heatMapType: "tight"
      },
      {
        id: 2, player: "BTN", street: "Preflop", desc: "Calls $1,200", pot: 3000, board: [], heroCards: ["9♠", "8♠"], opponents: [{ name: "UTG", cards: [] }, { name: "BTN", cards: [] }],
        analysis: "BTN flat calls, capping their range. They likely have mid-pairs or broadways.", evScore: 0, heroEquity: 25, heatMapType: "broadway"
      },
      {
        id: 3, player: "Hero", street: "Preflop", desc: "Calls $800", pot: 3800, board: [], heroCards: ["9♠", "8♠"], opponents: [{ name: "UTG", cards: [] }, { name: "BTN", cards: [] }],
        analysis: "Closing the action with suited connectors. Excellent pot odds to see a flop 3-way.", evScore: +0.5, heroEquity: 25, heatMapType: "draws"
      },
      {
        id: 4, player: "Hero", street: "Flop", desc: "Checks", pot: 3800, board: ["7♠", "6♠", "2♦"], heroCards: ["9♠", "8♠"], opponents: [{ name: "UTG", cards: [] }, { name: "BTN", cards: [] }],
        analysis: "Monster flop! Open-ended straight flush draw. Checking to the preflop aggressor.", evScore: +1.2, heroEquity: 54, heatMapType: "draws"
      },
      {
        id: 5, player: "UTG", street: "Flop", desc: "Bets $2,500", pot: 6300, board: ["7♠", "6♠", "2♦"], heroCards: ["9♠", "8♠"], opponents: [{ name: "UTG", cards: [] }, { name: "BTN", cards: [] }],
        analysis: "UTG continues. They likely have an overpair (AA, KK) given the dry board.", evScore: 0, heroEquity: 54, heatMapType: "premium"
      },
      {
        id: 6, player: "BTN", street: "Flop", desc: "Raises to $8,000", pot: 14300, board: ["7♠", "6♠", "2♦"], heroCards: ["9♠", "8♠"], opponents: [{ name: "UTG", cards: [] }, { name: "BTN", cards: [] }],
        analysis: "BTN raises! This shows immense strength, likely a set (77, 66) or two pair.", evScore: 0, heroEquity: 42, heatMapType: "tight"
      },
      {
        id: 7, player: "Hero", street: "Flop", desc: "All-in $22,100", pot: 36400, board: ["7♠", "6♠", "2♦"], heroCards: ["9♠", "8♠"], opponents: [{ name: "UTG", cards: [] }, { name: "BTN", cards: [] }],
        analysis: "Hero jams! With 15 outs twice, you are actually the mathematical favorite or flipping against sets.", evScore: +2.8, heroEquity: 42, heatMapType: "draws"
      },
      {
        id: 8, player: "System", street: "Showdown", desc: "Hero hits Flush and wins $80,600", pot: 80600, board: ["7♠", "6♠", "2♦", "K♣", "3♠"], heroCards: ["9♠", "8♠"], opponents: [{ name: "UTG", cards: ["A♦", "A♥"] }, { name: "BTN", cards: ["7♣", "7♥"] }],
        analysis: "River brings the spade! Your draw comes in against Aces and top set. Great push on the flop.", evScore: 0, heroEquity: 100, heatMapType: "showdown"
      }
    ]
  }
];

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

export function HandReview() {
  const navigate = useNavigate();
  const [selectedHand, setSelectedHand] = useState<HandHistory | null>(null);
  const [stepIdx, setStepIdx] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

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
            <p className="text-slate-400 font-bold mb-2">Select a hand to review play-by-play.</p>
            
            {mockHands.map((hand, idx) => {
              const finalStep = hand.steps[hand.steps.length - 1];
              return (
                <motion.div
                  initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.1 }}
                  key={hand.id} onClick={() => { setSelectedHand(hand); setStepIdx(0); setIsPlaying(false); }}
                  className="bg-[#242754] border border-white/10 hover:border-orange-500/50 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between cursor-pointer group shadow-lg hover:shadow-[0_0_20px_rgba(249,115,22,0.15)] transition-all"
                >
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-slate-400 font-bold">{hand.date}</span>
                      <span className="text-slate-600">•</span>
                      <span className="text-cyan-400 font-mono font-bold bg-cyan-950/30 px-2 py-0.5 rounded">{hand.stakes}</span>
                    </div>
                    <h3 className="text-xl font-black text-white">{hand.title}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex gap-1">
                        {finalStep.heroCards.map((c, i) => (
                          <div key={i} className={`w-6 h-8 bg-white rounded flex items-center justify-center text-xs font-black border border-slate-300 ${c.includes('♥') || c.includes('♦') ? 'text-red-600' : 'text-slate-900'}`}>{c}</div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 md:mt-0 flex items-center justify-between md:justify-end md:gap-6 border-t md:border-t-0 border-white/5 pt-4 md:pt-0">
                    <div className="flex flex-col items-end">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Net Result</span>
                      <span className={`text-xl font-black ${hand.net > 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {hand.net > 0 ? '+' : ''}${Math.abs(hand.net).toLocaleString()}
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
          <span className="text-sm font-bold text-slate-400">{selectedHand.title}</span>
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
                 const isHero = step.player === "Hero";
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
                      <p className="text-sm text-slate-300 leading-relaxed">{currentStep.analysis}</p>
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
