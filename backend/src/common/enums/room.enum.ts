export enum RoomType {
  AI_BOT = 'ai_bot',
  CASH = 'cash',
  TOURNAMENT = 'tournament',
}

export enum RoomStatus {
  WAITING_SETUP = 'WAITING_SETUP',
  READY = 'READY',
  DEALING = 'DEALING',
  IN_HAND = 'IN_HAND',
  SHOWDOWN = 'SHOWDOWN',
  HAND_ENDED = 'HAND_ENDED',
  CLOSED = 'CLOSED',
}

export enum HandStreet {
  INIT = 'INIT',
  PREFLOP = 'PREFLOP',
  FLOP = 'FLOP',
  TURN = 'TURN',
  RIVER = 'RIVER',
  SHOWDOWN = 'SHOWDOWN',
  RESULT = 'RESULT',
}

export enum ParticipantType {
  HUMAN = 'human',
  BOT = 'bot',
}

export enum BotModelTier {
  FREE = 'free',
  PAID = 'paid',
}

export enum LlmProvider {
  LOCAL = 'local',
  OPENAI = 'openai',
  CLAUDE = 'claude',
  GEMINI = 'gemini',
}

export enum ActionType {
  FOLD = 'fold',
  CHECK = 'check',
  CALL = 'call',
  BET = 'bet',
  RAISE = 'raise',
  ALL_IN = 'all-in',
}

export type PositionLabel =
  | 'BTN'
  | 'SB'
  | 'BB'
  | 'UTG'
  | 'UTG+1'
  | 'MP'
  | 'HJ'
  | 'CO'
  | 'BTN/SB';
