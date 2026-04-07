import { Injectable } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { JwtUserPayload, PlayerState, RoomRecord } from '../common/domain.types';
import { ActionType, ParticipantType, RoomStatus } from '../common/enums/room.enum';
import { UserRole } from '../common/enums/role.enum';
import { StoreService } from '../store/store.service';
import { ActDto } from './dto/act.dto';

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

		const toCall = Math.max(state.maxBetAmount - bot.currentBetAmount, 0);
		if (toCall <= 0) {
			return { action: ActionType.CHECK };
		}

		if (toCall <= Math.max(room.blindBig, Math.floor(bot.stackAmount * 0.15))) {
			return { action: ActionType.CALL };
		}

		return { action: ActionType.FOLD };
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
				setTimeout(() => resolve(this.fallbackBotAction(room, bot)), 1200);
			}),
		]);
	}

	private async processBotTurns(roomId: string): Promise<void> {
		for (let guard = 0; guard < 48; guard += 1) {
			const botTurn = this.getBotTurn(roomId);
			if (!botTurn) return;

			const { room, bot } = botTurn;
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
	}

	async getState(user: JwtUserPayload, roomId: string) {
		this.store.autoResolveTimeout(roomId);
		await this.processBotTurns(roomId);
		const room = this.store.autoResolveTimeout(roomId);
		const revealAllCards =
			room.status === RoomStatus.SHOWDOWN || room.status === RoomStatus.HAND_ENDED;

		const seats = room.seats.map((seat) => {
			if (!seat.participant) return seat;

			const isSelf = seat.participant.userId === user.sub;
			return {
				...seat,
				participant: {
					...seat.participant,
					holeCards: revealAllCards || isSelf ? [...seat.participant.holeCards] : [],
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
