import { Injectable } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { JwtUserPayload, PlayerState, RoomRecord } from '../common/domain.types';
import { ActionType, HandStreet, ParticipantType, RoomStatus } from '../common/enums/room.enum';
import { UserRole } from '../common/enums/role.enum';
import { StoreService } from '../store/store.service';
import { ActDto } from './dto/act.dto';

const BOT_TURN_TIMEOUT_MS = 15_000;
const BOT_THINK_DELAY_MS = 1_200;
const BOT_DECISION_FALLBACK_DELAY_MS = 5_600;

@Injectable()
export class GameService {
	constructor(
		private readonly store: StoreService,
		private readonly aiService: AiService,
	) {}

	private getBotTurn(roomId: string): {
		room: RoomRecord;
		state: NonNullable<RoomRecord['gameState']>;
		bot: PlayerState;
	} | null {
		const room = this.store.getRoomDetail(roomId);
		if (room.status !== RoomStatus.IN_HAND || !room.gameState) {
			return null;
		}

		const state = room.gameState;
		if (!state.currentTurnSeatId) {
			return null;
		}

		const actingSeat = room.seats.find(
			(seat) => seat.seatId === state.currentTurnSeatId,
		);
		const bot = actingSeat?.participant;
		if (!bot) return null;
		if (bot.roleType !== ParticipantType.BOT) return null;
		if (bot.folded || bot.allIn) return null;

		return {
			room,
			state,
			bot,
		};
	}

	private fallbackBotAction(room: RoomRecord, bot: PlayerState): {
		action: ActionType;
		amount?: number;
	} {
		const state = room.gameState;
		if (!state) {
			return { action: ActionType.CHECK };
		}

		const style = bot.botConfig?.style ?? 'balanced';
		const aggressionChance =
			style === 'aggressive'
				? 0.48
				: style === 'tight'
					? 0.14
					: 0.24;

		const toCall = Math.max(state.maxBetAmount - bot.currentBetAmount, 0);
		const maxTotalBet = bot.currentBetAmount + bot.stackAmount;
		const minRaiseTo =
			state.maxBetAmount + Math.max(state.minRaiseAmount, room.blindBig);
		const canRaise = state.maxBetAmount > 0 && maxTotalBet > minRaiseTo;
		const canBet = state.maxBetAmount === 0 && bot.stackAmount > room.blindBig;
		const roll = Math.random();

		if (toCall <= 0) {
			if (canBet && roll < aggressionChance) {
				const baseBet = Math.max(
					room.blindBig,
					Math.floor(state.potAmount * 0.5),
					room.blindBig * 2,
				);
				const betAmount = Math.min(
					Math.max(room.blindBig, baseBet),
					bot.stackAmount,
				);
				if (betAmount >= bot.stackAmount) {
					return { action: ActionType.ALL_IN };
				}
				return { action: ActionType.BET, amount: betAmount };
			}
			return { action: ActionType.CHECK };
		}

		if (canRaise && roll < aggressionChance * 0.85) {
			const potDrivenRaiseTo =
				state.maxBetAmount + Math.max(room.blindBig, Math.floor(state.potAmount * 0.6));
			const raiseTo = Math.min(Math.max(minRaiseTo, potDrivenRaiseTo), maxTotalBet);
			if (raiseTo >= maxTotalBet) {
				return { action: ActionType.ALL_IN };
			}
			if (raiseTo > state.maxBetAmount && raiseTo > bot.currentBetAmount) {
				return { action: ActionType.RAISE, amount: raiseTo };
			}
		}

		if (toCall <= Math.max(room.blindBig * 2, Math.floor(bot.stackAmount * 0.25))) {
			return { action: ActionType.CALL };
		}

		if (
			style === 'aggressive' &&
			toCall <= Math.max(room.blindBig * 3, Math.floor(bot.stackAmount * 0.4))
		) {
			return { action: ActionType.CALL };
		}

		return { action: ActionType.FOLD };
	}

	private buildBotDecisionContext(
		room: RoomRecord,
		state: NonNullable<RoomRecord['gameState']>,
		bot: PlayerState,
	) {
		const totalPlayers = room.seats.filter((seat) => seat.participant).length;
		const activePlayers = room.seats.filter(
			(seat) => seat.participant && !seat.participant.folded,
		).length;
		const allInPlayers = room.seats.filter(
			(seat) => seat.participant?.allIn,
		).length;
		const toCallAmount = Math.max(state.maxBetAmount - bot.currentBetAmount, 0);
		const minRaiseTo =
			state.maxBetAmount + Math.max(state.minRaiseAmount, room.blindBig);

		const previousActionsThisStreet = state.actions
			.filter((action) => action.street === state.street)
			.map((action) => {
				const potBefore = Math.max(action.potAfter - action.amount, 0);
				return {
					order: action.order,
					seatId: action.seatId,
					playerId: action.playerId,
					action: action.action,
					amountPaid: action.amount,
					potBefore,
					potAfter: action.potAfter,
					potRatioToBefore:
						potBefore > 0
							? Number((action.amount / potBefore).toFixed(3))
							: null,
				};
			});

		return {
			tableSummary: {
				totalPlayers,
				activePlayers,
				foldedPlayers: Math.max(totalPlayers - activePlayers, 0),
				allInPlayers,
				potAmount: state.potAmount,
				blindSmall: room.blindSmall,
				blindBig: room.blindBig,
				street: state.street,
				currentTurnSeatId: state.currentTurnSeatId,
			},
			actorSnapshot: {
				seatId: bot.seatId,
				playerId: bot.playerId,
				position: state.positions[bot.seatId] ?? null,
				stackAmount: bot.stackAmount,
				currentBetAmount: bot.currentBetAmount,
				toCallAmount,
				minRaiseTo,
				maxBetAmount: state.maxBetAmount,
				holeCards: [...bot.holeCards],
			},
			previousActionsThisStreet,
		};
	}

	private normalizeBotAction(
		room: RoomRecord,
		bot: PlayerState,
		requestedAction: ActionType,
		requestedAmount: number,
	): { action: ActionType; amount?: number } {
		const state = room.gameState;
		if (!state) {
			return { action: ActionType.CHECK };
		}

		const toCall = Math.max(state.maxBetAmount - bot.currentBetAmount, 0);
		const stack = Math.max(0, bot.stackAmount);
		const maxTotalBet = bot.currentBetAmount + stack;
		const minRaiseTo = state.maxBetAmount + Math.max(state.minRaiseAmount, room.blindBig);
		const amount = Number.isFinite(requestedAmount)
			? Math.max(0, Math.floor(requestedAmount))
			: 0;

		switch (requestedAction) {
			case ActionType.FOLD:
				if (toCall <= 0) {
					return { action: ActionType.CHECK };
				}
				return { action: ActionType.FOLD };
			case ActionType.CHECK:
				if (toCall <= 0) {
					return { action: ActionType.CHECK };
				}
				return stack > toCall
					? { action: ActionType.CALL }
					: { action: ActionType.ALL_IN };
			case ActionType.CALL:
				if (toCall <= 0) {
					return { action: ActionType.CHECK };
				}
				return stack > toCall
					? { action: ActionType.CALL }
					: { action: ActionType.ALL_IN };
			case ActionType.BET: {
				if (state.maxBetAmount > 0) {
					return this.normalizeBotAction(room, bot, ActionType.RAISE, amount);
				}

				const betAmount = Math.max(room.blindBig, amount || room.blindBig);
				if (stack <= betAmount) {
					return { action: ActionType.ALL_IN };
				}
				return { action: ActionType.BET, amount: betAmount };
			}
			case ActionType.RAISE: {
				if (state.maxBetAmount <= 0) {
					return this.normalizeBotAction(room, bot, ActionType.BET, amount);
				}

				if (maxTotalBet <= state.maxBetAmount) {
					return { action: ActionType.ALL_IN };
				}

				let raiseTo = amount || minRaiseTo;
				raiseTo = Math.max(minRaiseTo, raiseTo);
				if (raiseTo >= maxTotalBet) {
					return { action: ActionType.ALL_IN };
				}

				return { action: ActionType.RAISE, amount: raiseTo };
			}
			case ActionType.ALL_IN:
				return { action: ActionType.ALL_IN };
			default:
				return this.fallbackBotAction(room, bot);
		}
	}

	private async decideBotAction(room: RoomRecord, bot: PlayerState): Promise<{
		action: ActionType;
		amount?: number;
	}> {
		const state = room.gameState;
		if (!state) {
			return { action: ActionType.CHECK };
		}

		const config = bot.botConfig;
		if (!config) {
			return this.fallbackBotAction(room, bot);
		}

		try {
			const decisionContext = this.buildBotDecisionContext(room, state, bot);
			const result = await this.aiService.generateBotAction(
				{
					roomId: room.id,
					handId: state.handId,
					seatId: bot.seatId,
					modelTier: config.modelTier,
					provider: config.provider,
					model: config.model,
					playStyle: config.style,
					context: {
						gameState: {
							street: state.street,
							boardCards: state.boardCards,
							potAmount: state.potAmount,
							currentTurnSeatId: state.currentTurnSeatId,
							minCallAmount: state.minCallAmount,
							minRaiseAmount: state.minRaiseAmount,
							maxBetAmount: state.maxBetAmount,
							positions: state.positions,
						},
						accumulatedState: {
							actions: state.actions,
							seats: room.seats.map((seat) => ({
								seatId: seat.seatId,
								participant: seat.participant
									? {
										playerId: seat.participant.playerId,
										displayName: seat.participant.displayName,
										roleType: seat.participant.roleType,
										stackAmount: seat.participant.stackAmount,
										currentBetAmount: seat.participant.currentBetAmount,
										folded: seat.participant.folded,
										allIn: seat.participant.allIn,
									}
									: null,
							})),
						},
						decisionContext,
					},
				},
				UserRole.PRO,
			);

			return this.normalizeBotAction(
				room,
				bot,
				result.decision.action,
				result.decision.amount,
			);
		} catch {
			return this.fallbackBotAction(room, bot);
		}
	}

	private async decideBotActionFast(room: RoomRecord, bot: PlayerState) {
		return Promise.race<{
			action: ActionType;
			amount?: number;
		}>([
			this.decideBotAction(room, bot),
			new Promise((resolve) => {
				setTimeout(
					() => resolve(this.fallbackBotAction(room, bot)),
					BOT_DECISION_FALLBACK_DELAY_MS,
				);
			}),
		]);
	}

	private shouldProcessBotTurnNow(state: NonNullable<RoomRecord['gameState']>): boolean {
		if (!state.actionTimerDeadline) return true;

		const deadlineMs = Date.parse(state.actionTimerDeadline);
		if (!Number.isFinite(deadlineMs)) return true;

		const turnStartedAtMs = deadlineMs - BOT_TURN_TIMEOUT_MS;
		return Date.now() - turnStartedAtMs >= BOT_THINK_DELAY_MS;
	}

	private async processBotTurns(roomId: string): Promise<void> {
		const botTurn = this.getBotTurn(roomId);
		if (!botTurn) return;

		const { room, state, bot } = botTurn;
		if (!this.shouldProcessBotTurnNow(state)) return;

		let action = await this.decideBotActionFast(room, bot);

		try {
			this.store.applyPlayerAction({
				roomId,
				actorSeatId: bot.seatId,
				action: action.action,
				amount: action.amount,
			});
		} catch {
			action = this.fallbackBotAction(room, bot);
			this.store.applyPlayerAction({
				roomId,
				actorSeatId: bot.seatId,
				action: action.action,
				amount: action.amount,
			});
		}
	}

	async getState(user: JwtUserPayload, roomId: string) {
		this.store.autoResolveTimeout(roomId);
		await this.processBotTurns(roomId);
		const room = this.store.autoResolveTimeout(roomId);
		const latestAction = room.gameState?.actions.at(-1);
		const endedByFold =
			room.status === RoomStatus.HAND_ENDED &&
			room.gameState?.street === HandStreet.RESULT &&
			latestAction?.action === ActionType.FOLD;
		const revealAllCards =
			room.status === RoomStatus.SHOWDOWN ||
			(room.status === RoomStatus.HAND_ENDED && !endedByFold);

		const seats = room.seats.map((seat) => {
			if (!seat.participant) return seat;

			const isSelf = seat.participant.userId === user.sub;
			const canRevealAtShowdown = revealAllCards && !seat.participant.folded;
			return {
				...seat,
				participant: {
					...seat.participant,
					holeCards: isSelf || canRevealAtShowdown ? [...seat.participant.holeCards] : [],
				},
			};
		});

		return {
			roomId: room.id,
			roomStatus: room.status,
			seats,
			gameState: room.gameState,
			blinds: {
				small: room.blindSmall,
				big: room.blindBig,
			},
		};
	}

	async act(user: JwtUserPayload, roomId: string, dto: ActDto) {
		this.store.applyPlayerAction({
			roomId,
			actorUserId: user.sub,
			action: dto.action,
			amount: dto.amount,
		});

		await this.processBotTurns(roomId);
		return this.store.getRoomDetail(roomId);
	}

	async timerSync(roomId: string) {
		this.store.autoResolveTimeout(roomId);
		await this.processBotTurns(roomId);
		return this.store.syncTimer(roomId);
	}

	nextHand(user: JwtUserPayload, roomId: string) {
		return this.store.prepareNextHand(roomId, user.sub);
	}
}
