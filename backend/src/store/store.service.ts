import {
	BadRequestException,
	ConflictException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
	ActionType,
	BotModelTier,
	HandStreet,
	LlmProvider,
	ParticipantType,
	PositionLabel,
	RoomStatus,
	RoomType,
} from '../common/enums/room.enum';
import {
	AvatarConfig,
	GameState,
	HandAction,
	HandReviewRecord,
	PlayerState,
	RoomRecord,
	TableSummary,
	UserRecord,
} from '../common/domain.types';

const DEFAULT_AVATAR: AvatarConfig = {
	hairStyle: 'shortHairShortFlat',
	skinTone: 'ffdbb4',
	hairColor: 'black',
	faceType: 'default',
	eyeType: 'default',
	mouthType: 'smile',
	outfit: 'hoodie',
};

@Injectable()
export class StoreService {
	private readonly users = new Map<string, UserRecord>();
	private readonly userNicknameIndex = new Map<string, string>();
	private readonly rooms = new Map<string, RoomRecord>();
	private readonly handReviews = new Map<string, HandReviewRecord>();
	private readonly turnTimeoutSec = 15;

	private roomSeeded = false;

	private normalizeNickname(nickname: string): string {
		return nickname.trim().toLowerCase();
	}

	findUserByNickname(nickname: string): UserRecord | null {
		const key = this.normalizeNickname(nickname);
		const id = this.userNicknameIndex.get(key);
		if (!id) return null;
		return this.users.get(id) ?? null;
	}

	findUserById(userId: string): UserRecord | null {
		return this.users.get(userId) ?? null;
	}

	createUser(params: {
		nickname: string;
		passwordHash: string;
		role: UserRecord['role'];
	}): UserRecord {
		const normalized = this.normalizeNickname(params.nickname);
		if (this.userNicknameIndex.has(normalized)) {
			throw new ConflictException('이미 사용 중인 닉네임입니다.');
		}

		const user: UserRecord = {
			id: randomUUID(),
			nickname: params.nickname.trim(),
			passwordHash: params.passwordHash,
			role: params.role,
			avatar: { ...DEFAULT_AVATAR },
			stats: {
				playedHands: 0,
				winHands: 0,
				biggestPot: 0,
				totalProfit: 0,
			},
			subscriptionActive: params.role === 'pro',
			createdAt: new Date().toISOString(),
		};

		this.users.set(user.id, user);
		this.userNicknameIndex.set(normalized, user.id);

		return user;
	}

	updateUserPassword(userId: string, passwordHash: string): UserRecord {
		const user = this.users.get(userId);
		if (!user) {
			throw new NotFoundException('사용자를 찾을 수 없습니다.');
		}
		user.passwordHash = passwordHash;
		return user;
	}

	updateUserAvatar(userId: string, avatar: AvatarConfig): UserRecord {
		const user = this.users.get(userId);
		if (!user) {
			throw new NotFoundException('사용자를 찾을 수 없습니다.');
		}
		user.avatar = { ...avatar };
		return user;
	}

	private generateRoomCode(): string {
		const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
		let code = '';
		do {
			code = Array.from({ length: 6 })
				.map(() => alphabet[Math.floor(Math.random() * alphabet.length)])
				.join('');
		} while (Array.from(this.rooms.values()).some((room) => room.code === code));
		return code;
	}

	private createEmptySeats(maxSeats: number): RoomRecord['seats'] {
		return Array.from({ length: maxSeats }, (_, idx) => ({
			seatId: idx + 1,
			participant: null,
		}));
	}

	private countParticipants(room: RoomRecord): number {
		return room.seats.filter((seat) => seat.participant).length;
	}

	private roomToSummary(room: RoomRecord): TableSummary {
		const currentPlayers = this.countParticipants(room);
		return {
			id: room.id,
			code: room.code,
			name: room.name,
			type: room.type,
			status: room.status,
			currentPlayers,
			maxPlayers: room.maxSeats,
			isPrivate: room.isPrivate,
			canJoin:
				room.status !== RoomStatus.CLOSED &&
				currentPlayers < room.maxSeats &&
				room.status !== RoomStatus.DEALING,
		};
	}

	private ensureRoom(roomId: string): RoomRecord {
		const room = this.rooms.get(roomId);
		if (!room) {
			throw new NotFoundException('룸을 찾을 수 없습니다.');
		}
		return room;
	}

	private ensureSeat(room: RoomRecord, seatId: number) {
		const seat = room.seats.find((item) => item.seatId === seatId);
		if (!seat) {
			throw new NotFoundException('좌석을 찾을 수 없습니다.');
		}
		return seat;
	}

	private assertRoomEditable(room: RoomRecord) {
		if (
			room.status !== RoomStatus.WAITING_SETUP &&
			room.status !== RoomStatus.READY &&
			room.status !== RoomStatus.HAND_ENDED
		) {
			throw new BadRequestException(
				'핸드 진행 중에는 좌석 구성 또는 봇 구성을 변경할 수 없습니다.',
			);
		}
	}

	private assertHostControlAllowed(room: RoomRecord, actorUserId: string) {
		if (room.hostUserId !== actorUserId) {
			throw new BadRequestException('방장만 수행할 수 있는 작업입니다.');
		}
		if (!room.isPrivate) {
			throw new BadRequestException(
				'공개 전환 이후에는 방장 전용 제어 기능을 사용할 수 없습니다.',
			);
		}
	}

	private setReadyState(room: RoomRecord) {
		const players = this.countParticipants(room);
		if (room.status === RoomStatus.CLOSED) return;
		if (players >= 2 && room.status !== RoomStatus.HAND_ENDED) {
			room.status = RoomStatus.READY;
			return;
		}
		if (players < 2) {
			room.status = RoomStatus.WAITING_SETUP;
			room.gameState = null;
		}
	}

	createRoom(params: {
		name: string;
		type: RoomType;
		maxSeats: number;
		hostUserId: string;
		hostDisplayName: string;
		hostAvatar: AvatarConfig | null;
	}): RoomRecord {
		const maxSeats = Math.min(Math.max(params.maxSeats, 2), 9);

		const room: RoomRecord = {
			id: randomUUID(),
			code: this.generateRoomCode(),
			name: params.name,
			type: params.type,
			status: RoomStatus.WAITING_SETUP,
			hostUserId: params.hostUserId,
			maxSeats,
			isPrivate: true,
			hasBeenPublic: false,
			blindSmall: 50,
			blindBig: 100,
			seats: this.createEmptySeats(maxSeats),
			gameState: null,
			createdAt: new Date().toISOString(),
		};

		room.seats[0].participant = {
			seatId: 1,
			playerId: params.hostUserId,
			userId: params.hostUserId,
			roleType: ParticipantType.HUMAN,
			displayName: params.hostDisplayName,
			stackAmount: 10000,
			currentBetAmount: 0,
			folded: false,
			allIn: false,
			connected: true,
			avatarInfo: params.hostAvatar,
			holeCards: [],
		};

		this.rooms.set(room.id, room);
		this.setReadyState(room);

		return room;
	}

	listRoomSummaries(type?: RoomType): TableSummary[] {
		this.seedLobbyRooms();
		return Array.from(this.rooms.values())
			.filter((room) => (type ? room.type === type : true))
			.map((room) => this.roomToSummary(room));
	}

	getRoomDetail(roomId: string): RoomRecord {
		return this.ensureRoom(roomId);
	}

	findRoomByCode(code: string): RoomRecord {
		const room = Array.from(this.rooms.values()).find(
			(item) => item.code === code.toUpperCase(),
		);
		if (!room) {
			throw new NotFoundException('코드에 해당하는 룸이 없습니다.');
		}
		return room;
	}

	joinRoomFirstEmptySeat(params: {
		roomId: string;
		userId: string;
		displayName: string;
		avatar: AvatarConfig | null;
	}): RoomRecord {
		const room = this.ensureRoom(params.roomId);
		if (room.status === RoomStatus.CLOSED) {
			throw new BadRequestException('이미 종료된 룸입니다.');
		}

		const alreadySeated = room.seats.find(
			(seat) => seat.participant?.userId === params.userId,
		);
		if (alreadySeated) {
			return room;
		}

		const seat = room.seats.find((item) => !item.participant);
		if (!seat) {
			throw new BadRequestException('빈 좌석이 없습니다.');
		}

		seat.participant = {
			seatId: seat.seatId,
			playerId: params.userId,
			userId: params.userId,
			roleType: ParticipantType.HUMAN,
			displayName: params.displayName,
			stackAmount: 10000,
			currentBetAmount: 0,
			folded: false,
			allIn: false,
			connected: true,
			avatarInfo: params.avatar,
			holeCards: [],
		};

		this.setReadyState(room);
		return room;
	}

	takeSeat(params: {
		roomId: string;
		seatId: number;
		userId: string;
		displayName: string;
		avatar: AvatarConfig | null;
	}): RoomRecord {
		const room = this.ensureRoom(params.roomId);
		this.assertRoomEditable(room);

		const targetSeat = this.ensureSeat(room, params.seatId);
		if (targetSeat.participant) {
			throw new ConflictException('이미 사용 중인 좌석입니다.');
		}

		const existing = room.seats.find(
			(seat) => seat.participant?.userId === params.userId,
		);
		if (existing) {
			throw new BadRequestException('이미 다른 좌석에 착석 중입니다.');
		}

		targetSeat.participant = {
			seatId: params.seatId,
			playerId: params.userId,
			userId: params.userId,
			roleType: ParticipantType.HUMAN,
			displayName: params.displayName,
			stackAmount: 10000,
			currentBetAmount: 0,
			folded: false,
			allIn: false,
			connected: true,
			avatarInfo: params.avatar,
			holeCards: [],
		};

		this.setReadyState(room);
		return room;
	}

	leaveSeat(roomId: string, seatId: number, actorUserId: string): RoomRecord {
		const room = this.ensureRoom(roomId);
		this.assertRoomEditable(room);

		const seat = this.ensureSeat(room, seatId);
		if (!seat.participant) {
			throw new BadRequestException('비어있는 좌석입니다.');
		}

		const participant = seat.participant;
		if (participant.roleType === ParticipantType.HUMAN) {
			if (participant.userId !== actorUserId && room.hostUserId !== actorUserId) {
				throw new BadRequestException('본인 좌석 또는 방장만 좌석 이탈이 가능합니다.');
			}
		} else {
			this.assertHostControlAllowed(room, actorUserId);
		}

		seat.participant = null;
		this.setReadyState(room);
		return room;
	}

	addBot(params: {
		roomId: string;
		seatId: number;
		actorUserId: string;
		config: NonNullable<PlayerState['botConfig']>;
	}): RoomRecord {
		const room = this.ensureRoom(params.roomId);
		this.assertHostControlAllowed(room, params.actorUserId);
		this.assertRoomEditable(room);

		const seat = this.ensureSeat(room, params.seatId);
		if (seat.participant) {
			throw new BadRequestException('빈 좌석에만 봇을 추가할 수 있습니다.');
		}

		seat.participant = {
			seatId: params.seatId,
			playerId: `bot-${randomUUID()}`,
			roleType: ParticipantType.BOT,
			displayName: `Bot-${params.config.style}`,
			stackAmount: 10000,
			currentBetAmount: 0,
			folded: false,
			allIn: false,
			connected: true,
			avatarInfo: null,
			holeCards: [],
			botConfig: params.config,
		};

		this.setReadyState(room);
		return room;
	}

	updateBotConfig(params: {
		roomId: string;
		seatId: number;
		actorUserId: string;
		config: NonNullable<PlayerState['botConfig']>;
	}): RoomRecord {
		const room = this.ensureRoom(params.roomId);
		this.assertHostControlAllowed(room, params.actorUserId);
		this.assertRoomEditable(room);

		const seat = this.ensureSeat(room, params.seatId);
		if (!seat.participant || seat.participant.roleType !== ParticipantType.BOT) {
			throw new BadRequestException('해당 좌석에 봇이 없습니다.');
		}

		seat.participant.botConfig = params.config;
		seat.participant.displayName = `Bot-${params.config.style}`;
		return room;
	}

	removeBot(roomId: string, seatId: number, actorUserId: string): RoomRecord {
		const room = this.ensureRoom(roomId);
		this.assertHostControlAllowed(room, actorUserId);
		this.assertRoomEditable(room);

		const seat = this.ensureSeat(room, seatId);
		if (!seat.participant || seat.participant.roleType !== ParticipantType.BOT) {
			throw new BadRequestException('해당 좌석에 봇이 없습니다.');
		}

		seat.participant = null;
		this.setReadyState(room);
		return room;
	}

	convertPrivateToPublic(roomId: string, actorUserId: string): RoomRecord {
		const room = this.ensureRoom(roomId);
		if (room.hostUserId !== actorUserId) {
			throw new BadRequestException('방장만 공개 전환할 수 있습니다.');
		}

		if (!room.isPrivate || room.hasBeenPublic) {
			throw new BadRequestException('이미 공개로 전환된 룸은 되돌릴 수 없습니다.');
		}

		room.isPrivate = false;
		room.hasBeenPublic = true;
		return room;
	}

	closeRoom(roomId: string, actorUserId: string): RoomRecord {
		const room = this.ensureRoom(roomId);
		if (room.hostUserId !== actorUserId) {
			throw new BadRequestException('방장만 룸을 종료할 수 있습니다.');
		}
		room.status = RoomStatus.CLOSED;
		room.gameState = null;
		return room;
	}

	startGame(roomId: string, actorUserId: string): RoomRecord {
		const room = this.ensureRoom(roomId);
		this.assertHostControlAllowed(room, actorUserId);

		if (
			room.status !== RoomStatus.WAITING_SETUP &&
			room.status !== RoomStatus.READY &&
			room.status !== RoomStatus.HAND_ENDED
		) {
			throw new BadRequestException('현재 상태에서는 게임을 시작할 수 없습니다.');
		}

		const seated = room.seats.filter((seat) => seat.participant);
		if (seated.length < 2) {
			throw new BadRequestException('최소 2명 이상 착석해야 시작할 수 있습니다.');
		}

		room.status = RoomStatus.DEALING;
		room.gameState = this.createInitialGameState(room, seated.map((s) => s.seatId));
		room.status = RoomStatus.IN_HAND;

		return room;
	}

	getGameState(roomId: string): GameState {
		const room = this.ensureRoom(roomId);
		if (!room.gameState) {
			throw new BadRequestException('진행 중인 핸드가 없습니다.');
		}
		return room.gameState;
	}

	getRoomWithGame(roomId: string): RoomRecord {
		const room = this.ensureRoom(roomId);
		if (!room.gameState) {
			throw new BadRequestException('진행 중인 핸드가 없습니다.');
		}
		return room;
	}

	private activePlayers(room: RoomRecord): PlayerState[] {
		return room.seats
			.map((seat) => seat.participant)
			.filter((participant): participant is PlayerState => !!participant)
			.filter((participant) => !participant.folded);
	}

	private nextTurnSeatId(room: RoomRecord, fromSeatId: number): number | null {
		const state = room.gameState;
		if (!state) return null;

		const seatIds = room.seats
			.filter((seat) => seat.participant)
			.map((seat) => seat.seatId)
			.sort((a, b) => a - b);

		if (seatIds.length <= 1) return null;

		const startIdx = seatIds.indexOf(fromSeatId);
		const loop = [...seatIds.slice(startIdx + 1), ...seatIds.slice(0, startIdx + 1)];

		for (const seatId of loop) {
			const participant = this.ensureSeat(room, seatId).participant;
			if (!participant) continue;
			if (participant.folded) continue;
			if (participant.allIn) continue;
			return seatId;
		}

		return null;
	}

	private sumPlayerBets(room: RoomRecord): number {
		return room.seats.reduce((acc, seat) => {
			const currentBet = seat.participant?.currentBetAmount ?? 0;
			return acc + currentBet;
		}, 0);
	}

	private resetStreetBets(room: RoomRecord) {
		room.seats.forEach((seat) => {
			if (!seat.participant) return;
			seat.participant.currentBetAmount = 0;
		});
		if (!room.gameState) return;
		room.gameState.maxBetAmount = 0;
		room.gameState.minCallAmount = 0;
		room.gameState.minRaiseAmount = room.blindBig;
		room.gameState.actedSeatIds = [];
		room.gameState.lastAggressiveSeatId = null;
	}

	private dealBoardCards(room: RoomRecord, count: number) {
		if (!room.gameState) return;
		for (let i = 0; i < count; i += 1) {
			const card = room.gameState.deck.shift();
			if (!card) {
				throw new BadRequestException('덱 카드가 부족합니다.');
			}
			room.gameState.boardCards.push(card);
		}
	}

	private determineWinner(room: RoomRecord): PlayerState {
		const candidates = this.activePlayers(room);
		if (candidates.length === 0) {
			throw new BadRequestException('승자를 결정할 플레이어가 없습니다.');
		}

		return candidates[Math.floor(Math.random() * candidates.length)];
	}

	private completeHand(room: RoomRecord, winner: PlayerState) {
		const state = room.gameState;
		if (!state) return;

		const pot = state.potAmount + this.sumPlayerBets(room);
		winner.stackAmount += pot;

		const winnerUser = winner.userId ? this.findUserById(winner.userId) : null;
		if (winnerUser) {
			winnerUser.stats.winHands += 1;
			winnerUser.stats.biggestPot = Math.max(winnerUser.stats.biggestPot, pot);
			winnerUser.stats.totalProfit += pot;
		}

		room.seats.forEach((seat) => {
			const participant = seat.participant;
			if (!participant?.userId) return;
			const user = this.findUserById(participant.userId);
			if (!user) return;
			user.stats.playedHands += 1;
		});

		const review: HandReviewRecord = {
			handId: state.handId,
			roomId: room.id,
			participantIds: room.seats
				.map((seat) => seat.participant?.userId)
				.filter((item): item is string => !!item),
			boardCards: [...state.boardCards],
			actions: [...state.actions],
			winnerPlayerId: winner.playerId,
			resultPot: pot,
			createdAt: new Date().toISOString(),
		};
		this.handReviews.set(review.handId, review);

		room.status = RoomStatus.HAND_ENDED;
		state.street = HandStreet.RESULT;
		state.currentTurnSeatId = null;
		state.actionTimerDeadline = null;

		room.seats.forEach((seat) => {
			if (!seat.participant) return;
			seat.participant.currentBetAmount = 0;
			seat.participant.holeCards = [];
			seat.participant.folded = false;
			seat.participant.allIn = false;
		});
	}

	private isStreetDone(room: RoomRecord): boolean {
		const state = room.gameState;
		if (!state) return false;

		const actives = room.seats
			.map((seat) => seat.participant)
			.filter((p): p is PlayerState => !!p)
			.filter((p) => !p.folded && !p.allIn);

		if (actives.length <= 1) return true;

		return actives.every(
			(player) =>
				state.actedSeatIds.includes(player.seatId) &&
				player.currentBetAmount === state.maxBetAmount,
		);
	}

	private moveStreet(room: RoomRecord) {
		const state = room.gameState;
		if (!state) return;

		if (state.street === HandStreet.PREFLOP) {
			this.dealBoardCards(room, 3);
			state.street = HandStreet.FLOP;
			this.resetStreetBets(room);
		} else if (state.street === HandStreet.FLOP) {
			this.dealBoardCards(room, 1);
			state.street = HandStreet.TURN;
			this.resetStreetBets(room);
		} else if (state.street === HandStreet.TURN) {
			this.dealBoardCards(room, 1);
			state.street = HandStreet.RIVER;
			this.resetStreetBets(room);
		} else if (state.street === HandStreet.RIVER) {
			room.status = RoomStatus.SHOWDOWN;
			state.street = HandStreet.SHOWDOWN;
			const winner = this.determineWinner(room);
			this.completeHand(room, winner);
			return;
		}

		const next = this.nextTurnSeatId(room, state.dealerSeatId) ?? state.dealerSeatId;
		state.currentTurnSeatId = next;
		state.actionTimerDeadline = new Date(
			Date.now() + this.turnTimeoutSec * 1000,
		).toISOString();
	}

	applyPlayerAction(params: {
		roomId: string;
		actorUserId: string;
		action: ActionType;
		amount?: number;
	}): RoomRecord {
		const room = this.getRoomWithGame(params.roomId);
		const state = room.gameState!;

		if (room.status !== RoomStatus.IN_HAND) {
			throw new BadRequestException('현재 핸드 액션을 처리할 수 없는 상태입니다.');
		}

		const actingSeat = room.seats.find(
			(seat) => seat.participant?.userId === params.actorUserId,
		);
		if (!actingSeat?.participant) {
			throw new BadRequestException('현재 룸에 착석 중인 플레이어가 아닙니다.');
		}

		const actor = actingSeat.participant;
		if (state.currentTurnSeatId !== actor.seatId) {
			throw new BadRequestException('현재 턴 플레이어가 아닙니다.');
		}
		if (actor.folded || actor.allIn) {
			throw new BadRequestException('액션 가능한 플레이어 상태가 아닙니다.');
		}

		const toCall = Math.max(state.maxBetAmount - actor.currentBetAmount, 0);
		let paid = 0;

		if (params.action === ActionType.FOLD) {
			actor.folded = true;
		} else if (params.action === ActionType.CHECK) {
			if (toCall > 0) {
				throw new BadRequestException('콜 금액이 존재할 때는 체크할 수 없습니다.');
			}
		} else if (params.action === ActionType.CALL) {
			paid = Math.min(toCall, actor.stackAmount);
			actor.stackAmount -= paid;
			actor.currentBetAmount += paid;
			actor.allIn = actor.stackAmount === 0;
		} else if (params.action === ActionType.BET) {
			if (state.maxBetAmount > 0) {
				throw new BadRequestException('이미 베팅이 존재하면 raise를 사용해야 합니다.');
			}
			const amount = params.amount ?? 0;
			if (amount < room.blindBig) {
				throw new BadRequestException('최소 베팅 금액보다 작습니다.');
			}
			if (amount > actor.stackAmount) {
				throw new BadRequestException('스택보다 큰 금액은 베팅할 수 없습니다.');
			}
			paid = amount;
			actor.stackAmount -= paid;
			actor.currentBetAmount += paid;
			actor.allIn = actor.stackAmount === 0;
			state.maxBetAmount = actor.currentBetAmount;
			state.minCallAmount = state.maxBetAmount;
			state.lastAggressiveSeatId = actor.seatId;
			state.actedSeatIds = [actor.seatId];
		} else if (params.action === ActionType.RAISE) {
			const raiseTo = params.amount ?? 0;
			const minTo = state.maxBetAmount + Math.max(state.minRaiseAmount, room.blindBig);
			if (raiseTo < minTo) {
				throw new BadRequestException(`최소 레이즈는 ${minTo} 입니다.`);
			}
			const need = raiseTo - actor.currentBetAmount;
			if (need > actor.stackAmount) {
				throw new BadRequestException('스택보다 큰 금액은 레이즈할 수 없습니다.');
			}

			paid = need;
			actor.stackAmount -= need;
			actor.currentBetAmount = raiseTo;
			actor.allIn = actor.stackAmount === 0;
			state.maxBetAmount = raiseTo;
			state.minCallAmount = raiseTo;
			state.lastAggressiveSeatId = actor.seatId;
			state.actedSeatIds = [actor.seatId];
		} else if (params.action === ActionType.ALL_IN) {
			paid = actor.stackAmount;
			actor.currentBetAmount += actor.stackAmount;
			actor.stackAmount = 0;
			actor.allIn = true;

			if (actor.currentBetAmount > state.maxBetAmount) {
				state.maxBetAmount = actor.currentBetAmount;
				state.minCallAmount = state.maxBetAmount;
				state.lastAggressiveSeatId = actor.seatId;
				state.actedSeatIds = [actor.seatId];
			}
		}

		state.potAmount += paid;
		if (!state.actedSeatIds.includes(actor.seatId)) {
			state.actedSeatIds.push(actor.seatId);
		}

		const action: HandAction = {
			handId: state.handId,
			order: state.actions.length + 1,
			seatId: actor.seatId,
			playerId: actor.playerId,
			action: params.action,
			amount: paid,
			potAfter: state.potAmount,
			street: state.street,
			createdAt: new Date().toISOString(),
		};
		state.actions.push(action);

		const remaining = this.activePlayers(room);
		if (remaining.length === 1) {
			this.completeHand(room, remaining[0]);
			return room;
		}

		if (this.isStreetDone(room)) {
			this.moveStreet(room);
			return room;
		}

		const nextSeatId = this.nextTurnSeatId(room, actor.seatId);
		state.currentTurnSeatId = nextSeatId;
		state.actionTimerDeadline = nextSeatId
			? new Date(Date.now() + this.turnTimeoutSec * 1000).toISOString()
			: null;

		return room;
	}

	syncTimer(roomId: string): { remainingMs: number; currentTurnSeatId: number | null } {
		const room = this.getRoomWithGame(roomId);
		const deadline = room.gameState?.actionTimerDeadline
			? Date.parse(room.gameState.actionTimerDeadline)
			: 0;

		const now = Date.now();
		return {
			remainingMs: Math.max(deadline - now, 0),
			currentTurnSeatId: room.gameState?.currentTurnSeatId ?? null,
		};
	}

	prepareNextHand(roomId: string, actorUserId: string): RoomRecord {
		const room = this.ensureRoom(roomId);
		this.assertHostControlAllowed(room, actorUserId);

		if (room.status !== RoomStatus.HAND_ENDED) {
			throw new BadRequestException('핸드 종료 이후에만 다음 핸드를 준비할 수 있습니다.');
		}

		room.gameState = null;
		room.seats.forEach((seat) => {
			if (!seat.participant) return;
			seat.participant.currentBetAmount = 0;
			seat.participant.holeCards = [];
			seat.participant.folded = false;
			seat.participant.allIn = false;
		});
		this.setReadyState(room);
		return room;
	}

	listHandReviews(userId: string): HandReviewRecord[] {
		return Array.from(this.handReviews.values()).filter((review) =>
			review.participantIds.includes(userId),
		);
	}

	getHandReview(handId: string, userId: string): HandReviewRecord {
		const review = this.handReviews.get(handId);
		if (!review) {
			throw new NotFoundException('핸드 리뷰를 찾을 수 없습니다.');
		}
		if (!review.participantIds.includes(userId)) {
			throw new BadRequestException('해당 핸드에 대한 접근 권한이 없습니다.');
		}
		return review;
	}

	private createDeck(): string[] {
		const suits = ['S', 'H', 'D', 'C'];
		const ranks = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
		const deck = suits.flatMap((suit) => ranks.map((rank) => `${rank}${suit}`));

		for (let i = deck.length - 1; i > 0; i -= 1) {
			const j = Math.floor(Math.random() * (i + 1));
			[deck[i], deck[j]] = [deck[j], deck[i]];
		}
		return deck;
	}

	private labelsForCount(count: number): PositionLabel[] {
		if (count === 2) return ['BTN/SB', 'BB'];
		if (count === 3) return ['BTN', 'SB', 'BB'];
		if (count === 4) return ['BTN', 'SB', 'BB', 'UTG'];
		if (count === 5) return ['BTN', 'SB', 'BB', 'UTG', 'CO'];
		if (count === 6) return ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO'];
		if (count === 7) return ['BTN', 'SB', 'BB', 'UTG', 'MP', 'HJ', 'CO'];
		return ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'MP', 'HJ', 'CO'];
	}

	private assignPositions(
		seatedSeatIds: number[],
		dealerSeatId: number,
	): Record<number, PositionLabel> {
		const sorted = [...seatedSeatIds].sort((a, b) => a - b);
		const dealerIndex = sorted.indexOf(dealerSeatId);
		const ordered = [...sorted.slice(dealerIndex), ...sorted.slice(0, dealerIndex)];
		const labels = this.labelsForCount(ordered.length);

		const map: Record<number, PositionLabel> = {};
		ordered.forEach((seatId, idx) => {
			map[seatId] = labels[idx] ?? 'CO';
		});
		return map;
	}

	private createInitialGameState(room: RoomRecord, seatedSeatIds: number[]): GameState {
		const deck = this.createDeck();
		const sorted = [...seatedSeatIds].sort((a, b) => a - b);

		const prevDealer = room.gameState?.dealerSeatId;
		const dealerSeatId = prevDealer
			? this.nextSeatFromList(sorted, prevDealer)
			: sorted[0];

		sorted.forEach((seatId) => {
			const seat = this.ensureSeat(room, seatId);
			if (!seat.participant) return;
			const card1 = deck.shift();
			const card2 = deck.shift();
			if (!card1 || !card2) {
				throw new BadRequestException('홀카드 배분 중 덱 부족 오류');
			}
			seat.participant.holeCards = [card1, card2];
			seat.participant.currentBetAmount = 0;
			seat.participant.folded = false;
			seat.participant.allIn = false;
		});

		const positions = this.assignPositions(sorted, dealerSeatId);
		const sbSeatId = this.findSeatByPosition(positions, 'SB', 'BTN/SB');
		const bbSeatId = this.findSeatByPosition(positions, 'BB');

		const sb = sbSeatId ? this.ensureSeat(room, sbSeatId).participant : null;
		const bb = bbSeatId ? this.ensureSeat(room, bbSeatId).participant : null;

		if (sb) {
			const blind = Math.min(room.blindSmall, sb.stackAmount);
			sb.stackAmount -= blind;
			sb.currentBetAmount += blind;
			sb.allIn = sb.stackAmount === 0;
		}
		if (bb) {
			const blind = Math.min(room.blindBig, bb.stackAmount);
			bb.stackAmount -= blind;
			bb.currentBetAmount += blind;
			bb.allIn = bb.stackAmount === 0;
		}

		const currentTurnSeatId = bbSeatId ? this.nextSeatFromList(sorted, bbSeatId) : sorted[0];
		const pot = (sb?.currentBetAmount ?? 0) + (bb?.currentBetAmount ?? 0);

		return {
			handId: randomUUID(),
			street: HandStreet.PREFLOP,
			deck,
			boardCards: [],
			dealerSeatId,
			positions,
			currentTurnSeatId,
			actionTimerDeadline: new Date(
				Date.now() + this.turnTimeoutSec * 1000,
			).toISOString(),
			minCallAmount: room.blindBig,
			minRaiseAmount: room.blindBig,
			potAmount: pot,
			sidePots: [],
			actions: [],
			actedSeatIds: [],
			lastAggressiveSeatId: bbSeatId ?? null,
			maxBetAmount: room.blindBig,
		};
	}

	private nextSeatFromList(seatIds: number[], currentSeat: number): number {
		const idx = seatIds.indexOf(currentSeat);
		if (idx < 0) return seatIds[0];
		return seatIds[(idx + 1) % seatIds.length];
	}

	private findSeatByPosition(
		positions: Record<number, PositionLabel>,
		...labels: PositionLabel[]
	): number | null {
		for (const [seatId, label] of Object.entries(positions)) {
			if (labels.includes(label)) return Number(seatId);
		}
		return null;
	}

	private seedLobbyRooms() {
		if (this.roomSeeded) return;
		this.roomSeeded = true;

		const mockHostId = 'system-host';
		const createSeedRoom = (
			name: string,
			type: RoomType,
			maxSeats: number,
			isPrivate: boolean,
			bots: number,
		) => {
			const room: RoomRecord = {
				id: randomUUID(),
				code: this.generateRoomCode(),
				name,
				type,
				status: RoomStatus.WAITING_SETUP,
				hostUserId: mockHostId,
				maxSeats,
				isPrivate,
				hasBeenPublic: !isPrivate,
				blindSmall: 50,
				blindBig: 100,
				seats: this.createEmptySeats(maxSeats),
				gameState: null,
				createdAt: new Date().toISOString(),
			};

			for (let i = 0; i < bots; i += 1) {
				room.seats[i].participant = {
					seatId: i + 1,
					playerId: `seed-bot-${randomUUID()}`,
					roleType: ParticipantType.BOT,
					displayName: `SeedBot-${i + 1}`,
					stackAmount: 10000,
					currentBetAmount: 0,
					folded: false,
					allIn: false,
					connected: true,
					avatarInfo: null,
					holeCards: [],
					botConfig: {
						modelTier: BotModelTier.FREE,
						provider: LlmProvider.LOCAL,
						style: 'balanced',
					},
				};
			}

			this.setReadyState(room);
			this.rooms.set(room.id, room);
		};

		createSeedRoom('AI Bot Practice Room', RoomType.AI_BOT, 8, false, 1);
		createSeedRoom('Beginner Cash Table', RoomType.CASH, 8, false, 2);
		createSeedRoom('Sunday Live Tournament', RoomType.TOURNAMENT, 8, false, 6);
	}
}
