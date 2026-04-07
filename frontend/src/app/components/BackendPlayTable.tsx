import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Play, RefreshCcw, SkipForward } from "lucide-react";
import { apiFetch } from "../api";

type ActionType = "fold" | "check" | "call" | "bet" | "raise" | "all-in";

interface Participant {
  seatId: number;
  playerId: string;
  userId?: string;
  roleType: "human" | "bot";
  displayName: string;
  stackAmount: number;
  currentBetAmount: number;
  folded: boolean;
  allIn: boolean;
}

interface Seat {
  seatId: number;
  participant: Participant | null;
}

interface RoomDetail {
  id: string;
  code: string;
  name: string;
  type: "ai_bot" | "cash" | "tournament";
  status: string;
  maxSeats: number;
  isPrivate: boolean;
  blindSmall: number;
  blindBig: number;
  seats: Seat[];
}

interface HandAction {
  order: number;
  seatId: number;
  playerId: string;
  action: ActionType;
  amount: number;
  street: string;
}

interface GameState {
  handId: string;
  street: string;
  boardCards: string[];
  currentTurnSeatId: number | null;
  minCallAmount: number;
  minRaiseAmount: number;
  potAmount: number;
  actions: HandAction[];
}

interface GameSnapshot {
  roomStatus: string;
  gameState: GameState;
}

function getStatusBadge(status: string) {
  if (status === "IN_HAND") return "bg-emerald-500/20 text-emerald-300";
  if (status === "HAND_ENDED") return "bg-amber-500/20 text-amber-300";
  if (status === "READY") return "bg-cyan-500/20 text-cyan-300";
  return "bg-slate-500/20 text-slate-300";
}

interface BackendPlayTableProps {
  roomId: string;
}

export function BackendPlayTable({ roomId }: BackendPlayTableProps) {
  const navigate = useNavigate();
  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [game, setGame] = useState<GameSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [action, setAction] = useState<ActionType>("check");
  const [amount, setAmount] = useState("100");

  const loadSnapshot = async (withSpinner = false) => {
    if (withSpinner) {
      setLoading(true);
    }

    try {
      const roomDetail = await apiFetch<RoomDetail>(`/rooms/${roomId}`);
      setRoom(roomDetail);

      try {
        const gameSnapshot = await apiFetch<GameSnapshot>(`/game/rooms/${roomId}/state`);
        setGame(gameSnapshot);
      } catch {
        setGame(null);
      }

      setErrorMessage("");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "룸 정보를 불러오지 못했습니다.",
      );
    } finally {
      if (withSpinner) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    void loadSnapshot(true);
    const timer = setInterval(() => {
      if (!busy) {
        void loadSnapshot(false);
      }
    }, 3000);

    return () => clearInterval(timer);
  }, [roomId, busy]);

  const totalPot = useMemo(() => {
    if (!game?.gameState) return 0;
    return game.gameState.potAmount;
  }, [game]);

  const submitAction = async () => {
    if (!game?.gameState) return;

    const parsedAmount = Number(amount);
    const payload: { action: ActionType; amount?: number } = { action };
    if ((action === "bet" || action === "raise") && Number.isFinite(parsedAmount)) {
      payload.amount = Math.max(1, Math.floor(parsedAmount));
    }

    setBusy(true);
    try {
      await apiFetch(`/game/rooms/${roomId}/act`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      await loadSnapshot(false);
    } catch (error) {
      alert(error instanceof Error ? error.message : "액션 처리에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const startGame = async () => {
    setBusy(true);
    try {
      await apiFetch(`/rooms/${roomId}/start-game`, { method: "POST" });
      await loadSnapshot(false);
    } catch (error) {
      alert(error instanceof Error ? error.message : "게임 시작에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const nextHand = async () => {
    setBusy(true);
    try {
      await apiFetch(`/game/rooms/${roomId}/next-hand`, { method: "POST" });
      await loadSnapshot(false);
    } catch (error) {
      alert(error instanceof Error ? error.message : "다음 핸드 준비에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full h-full bg-[#11122D] text-white p-4 md:p-6 overflow-y-auto">
      <div className="max-w-6xl mx-auto flex flex-col gap-4">
        <div className="flex items-center justify-between bg-[#1A1C3E] border border-white/10 rounded-xl p-4">
          <button
            onClick={() => navigate("/lobby")}
            className="flex items-center gap-2 text-slate-300 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4" />
            Lobby
          </button>
          <button
            onClick={() => {
              void loadSnapshot(true);
            }}
            className="flex items-center gap-2 rounded-lg bg-cyan-600 px-3 py-2 text-sm font-bold hover:bg-cyan-500"
          >
            <RefreshCcw className="w-4 h-4" />
            Refresh
          </button>
        </div>

        {loading && <div className="text-slate-300 font-semibold">Loading room...</div>}
        {!loading && errorMessage && (
          <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-red-300">
            {errorMessage}
          </div>
        )}

        {room && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-xl border border-white/10 bg-[#1A1C3E] p-4">
                <p className="text-xs text-slate-400 uppercase tracking-widest">Room</p>
                <p className="text-xl font-black">{room.name}</p>
                <p className="text-sm text-slate-300 mt-1">{room.type} · code {room.code}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-[#1A1C3E] p-4">
                <p className="text-xs text-slate-400 uppercase tracking-widest">Status</p>
                <span className={`inline-block mt-1 rounded-full px-3 py-1 text-xs font-bold ${getStatusBadge(room.status)}`}>
                  {room.status}
                </span>
                <p className="text-sm text-slate-300 mt-2">
                  Players {room.seats.filter((seat) => seat.participant).length}/{room.maxSeats}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-[#1A1C3E] p-4">
                <p className="text-xs text-slate-400 uppercase tracking-widest">Blinds</p>
                <p className="text-xl font-black">
                  {room.blindSmall}/{room.blindBig}
                </p>
                <p className="text-sm text-slate-300 mt-1">Pot {totalPot}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={startGame}
                disabled={busy || (room.status !== "READY" && room.status !== "WAITING_SETUP" && room.status !== "HAND_ENDED")}
                className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 font-bold disabled:opacity-40"
              >
                <Play className="w-4 h-4" />
                Start Game
              </button>
              <button
                onClick={nextHand}
                disabled={busy || room.status !== "HAND_ENDED"}
                className="flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 font-bold disabled:opacity-40"
              >
                <SkipForward className="w-4 h-4" />
                Next Hand
              </button>
            </div>

            {game?.gameState && (
              <div className="rounded-xl border border-white/10 bg-[#1A1C3E] p-4 flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-full bg-indigo-500/20 px-3 py-1 text-xs font-bold text-indigo-300">
                    Hand {game.gameState.handId.slice(0, 8)}
                  </span>
                  <span className="rounded-full bg-cyan-500/20 px-3 py-1 text-xs font-bold text-cyan-300">
                    Street {game.gameState.street}
                  </span>
                  <span className="rounded-full bg-slate-700 px-3 py-1 text-xs font-bold text-slate-200">
                    Turn Seat {game.gameState.currentTurnSeatId ?? "-"}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {game.gameState.boardCards.length === 0 && (
                    <span className="text-slate-400 text-sm">Board cards not dealt yet.</span>
                  )}
                  {game.gameState.boardCards.map((card) => (
                    <span
                      key={card}
                      className="rounded-md border border-white/15 bg-slate-900 px-3 py-1 text-sm font-black"
                    >
                      {card}
                    </span>
                  ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-2 pt-2 border-t border-white/10">
                  <select
                    value={action}
                    onChange={(event) => setAction(event.target.value as ActionType)}
                    className="rounded-lg border border-white/10 bg-[#11122D] px-3 py-2"
                  >
                    <option value="fold">fold</option>
                    <option value="check">check</option>
                    <option value="call">call</option>
                    <option value="bet">bet</option>
                    <option value="raise">raise</option>
                    <option value="all-in">all-in</option>
                  </select>
                  <input
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder="amount"
                    className="rounded-lg border border-white/10 bg-[#11122D] px-3 py-2"
                    disabled={action !== "bet" && action !== "raise"}
                  />
                  <button
                    onClick={submitAction}
                    disabled={busy}
                    className="rounded-lg bg-cyan-600 px-4 py-2 font-bold hover:bg-cyan-500 disabled:opacity-40"
                  >
                    Send Action
                  </button>
                  <div className="text-xs text-slate-400 self-center">
                    min call {game.gameState.minCallAmount} · min raise {game.gameState.minRaiseAmount}
                  </div>
                </div>
              </div>
            )}

            <div className="rounded-xl border border-white/10 bg-[#1A1C3E] p-4">
              <h3 className="font-black mb-3">Seats</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {room.seats.map((seat) => (
                  <div key={seat.seatId} className="rounded-lg border border-white/10 bg-[#11122D] p-3">
                    <p className="text-xs text-slate-400 uppercase">Seat {seat.seatId}</p>
                    {!seat.participant && <p className="text-slate-500">Empty</p>}
                    {seat.participant && (
                      <>
                        <p className="font-bold">{seat.participant.displayName}</p>
                        <p className="text-sm text-slate-300">
                          {seat.participant.roleType} · stack {seat.participant.stackAmount} · bet {seat.participant.currentBetAmount}
                        </p>
                        <p className="text-xs text-slate-400">
                          {seat.participant.folded ? "folded" : "active"}
                          {seat.participant.allIn ? " · all-in" : ""}
                        </p>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {game?.gameState?.actions && game.gameState.actions.length > 0 && (
              <div className="rounded-xl border border-white/10 bg-[#1A1C3E] p-4">
                <h3 className="font-black mb-3">Hand Actions</h3>
                <div className="max-h-64 overflow-y-auto space-y-2">
                  {game.gameState.actions
                    .slice()
                    .reverse()
                    .map((item) => (
                      <div
                        key={`${item.order}-${item.playerId}`}
                        className="rounded-lg border border-white/10 bg-[#11122D] px-3 py-2 text-sm"
                      >
                        #{item.order} seat {item.seatId} · {item.action}
                        {item.amount > 0 ? ` ${item.amount}` : ""} · {item.street}
                      </div>
                    ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
