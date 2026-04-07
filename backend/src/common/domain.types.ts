import { UserRole } from './enums/role.enum';
import {
  ActionType,
  BotModelTier,
  HandStreet,
  LlmProvider,
  ParticipantType,
  PositionLabel,
  RoomStatus,
  RoomType,
} from './enums/room.enum';

export interface AvatarConfig {
  hairStyle: string;
  skinTone: string;
  hairColor: string;
  faceType: string;
  eyeType: string;
  mouthType: string;
  outfit: string;
  accessory?: string;
}

export interface UserStats {
  playedHands: number;
  winHands: number;
  biggestPot: number;
  totalProfit: number;
}

export interface UserRecord {
  id: string;
  nickname: string;
  passwordHash: string;
  role: UserRole;
  balanceAmount: number;
  avatar: AvatarConfig;
  stats: UserStats;
  subscriptionActive: boolean;
  createdAt: string;
}

export interface JwtUserPayload {
  sub: string;
  role: UserRole;
  nickname: string;
  guest: boolean;
}

export interface BotConfig {
  modelTier: BotModelTier;
  provider: LlmProvider;
  style: 'balanced' | 'aggressive' | 'tight' | 'random';
  model?: string;
}

export interface PlayerState {
  seatId: number;
  playerId: string;
  roleType: ParticipantType;
  userId?: string;
  displayName: string;
  stackAmount: number;
  currentBetAmount: number;
  folded: boolean;
  allIn: boolean;
  connected: boolean;
  avatarInfo: AvatarConfig | null;
  holeCards: string[];
  botConfig?: BotConfig;
}

export interface SeatState {
  seatId: number;
  participant: PlayerState | null;
}

export interface HandAction {
  handId: string;
  order: number;
  seatId: number;
  playerId: string;
  action: ActionType;
  amount: number;
  potAfter: number;
  street: HandStreet;
  createdAt: string;
}

export interface GameState {
  handId: string;
  street: HandStreet;
  deck: string[];
  boardCards: string[];
  dealerSeatId: number;
  positions: Record<number, PositionLabel>;
  currentTurnSeatId: number | null;
  actionTimerDeadline: string | null;
  minCallAmount: number;
  minRaiseAmount: number;
  potAmount: number;
  sidePots: number[];
  actions: HandAction[];
  actedSeatIds: number[];
  lastAggressiveSeatId: number | null;
  maxBetAmount: number;
}

export interface RoomRecord {
  id: string;
  code: string;
  name: string;
  type: RoomType;
  status: RoomStatus;
  hostUserId: string;
  maxSeats: number;
  isPrivate: boolean;
  hasBeenPublic: boolean;
  blindSmall: number;
  blindBig: number;
  seats: SeatState[];
  gameState: GameState | null;
  createdAt: string;
}

export interface TableSummary {
  id: string;
  code: string;
  name: string;
  type: RoomType;
  status: RoomStatus;
  hostUserId: string;
  blindSmall: number;
  blindBig: number;
  currentPlayers: number;
  humanPlayers: number;
  maxPlayers: number;
  isPrivate: boolean;
  hasBeenPublic: boolean;
  canJoin: boolean;
}

export interface LeaderboardEntry {
  id: string;
  nickname: string;
  role: UserRole;
  balanceAmount: number;
}

export interface HandReviewRecord {
  handId: string;
  roomId: string;
  participantIds: string[];
  boardCards: string[];
  actions: HandAction[];
  winnerPlayerId: string;
  resultPot: number;
  createdAt: string;
}

export interface AiBotDecision {
  action: ActionType;
  amount: number;
  reason: string;
  confidence: number;
}
