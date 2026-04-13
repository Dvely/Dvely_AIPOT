import {
	BadRequestException,
	ConflictException,
	Injectable,
	OnModuleInit,
	OnModuleDestroy,
	NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
import { PreferredLanguage } from '../common/enums/language.enum';
import { UserRole } from '../common/enums/role.enum';
import {
	AvatarConfig,
	FriendRequestRecord,
	GameState,
	GtoActionMix,
	HandActionAnalysis,
	HandReviewAnalyzeJob,
	HandAction,
	HandReviewParticipant,
	HandReviewRecord,
	LeaderboardEntry,
	PendingJoinRequest,
	PlayerState,
	RoomInviteRecord,
	RoomRecord,
	TableSummary,
	UserRecord,
} from '../common/domain.types';
import { StateSnapshotEntity } from './entities/state-snapshot.entity';

const DEFAULT_AVATAR: AvatarConfig = {
	hairStyle: 'shortFlat',
	skinTone: 'ffdbb4',
	hairColor: '2c1b18',
	faceType: 'default',
	eyeType: 'default',
	mouthType: 'smile',
	outfit: 'hoodie',
};

const BOT_AVATAR_TOP_OPTIONS = [
	'shortFlat',
	'shortCurly',
	'straight01',
	'longButNotTooLong',
	'bob',
	'hat',
	'hijab',
	'turban',
];

const BOT_AVATAR_OUTFIT_OPTIONS = [
	'hoodie',
	'blazerAndShirt',
	'blazerAndSweater',
	'graphicShirt',
	'shirtCrewNeck',
	'shirtVNeck',
];

const BOT_AVATAR_EYE_OPTIONS = [
	'default',
	'happy',
	'wink',
	'surprised',
	'squint',
];

const BOT_AVATAR_MOUTH_OPTIONS = [
	'smile',
	'default',
	'serious',
	'sad',
	'twinkle',
];

const BOT_AVATAR_FACE_OPTIONS = [
	'default',
	'defaultNatural',
	'raisedExcited',
	'sadConcerned',
	'upDown',
];

const BOT_AVATAR_SKIN_COLORS = [
	'ffdbb4',
	'edb98a',
	'd08b5b',
	'ae5d29',
	'614335',
	'fd9841',
	'f8d25c',
];

const BOT_AVATAR_HAIR_COLORS = [
	'2c1b18',
	'a55728',
	'724133',
	'd6b370',
	'c93305',
	'f59797',
	'e8e1e1',
];

function pickRandom<T>(items: readonly T[]): T {
	return items[Math.floor(Math.random() * items.length)] as T;
}

const DEFAULT_ACCOUNT_BALANCE = 10000;
const DEFAULT_GUEST_BALANCE = 1000;
const PRIVATE_AI_BOT_NEXT_HAND_DELAY_MS = 2500;
const MAX_TIMEOUT_STRIKES_BEFORE_AUTO_LEAVE = 3;
const STALE_PUBLIC_ROOM_DELETE_MS = 5 * 60 * 1000;
const ROOM_INVITE_EXPIRE_MS = 10 * 60 * 1000;

@Injectable()
export class StoreService implements OnModuleInit, OnModuleDestroy {
	private readonly users = new Map<string, UserRecord>();
	private readonly userNicknameIndex = new Map<string, string>();
	private readonly friendRequests = new Map<string, FriendRequestRecord>();
	private readonly roomInvites = new Map<string, RoomInviteRecord>();
	private readonly rooms = new Map<string, RoomRecord>();
	private readonly handReviews = new Map<string, HandReviewRecord>();
	private readonly turnTimeoutSec = 15;
	private readonly snapshotId = 'global-state-v1';
	private timeoutTicker: NodeJS.Timeout | null = null;

	private roomSeeded = false;

	constructor(
		@InjectRepository(StateSnapshotEntity)
		private readonly snapshotRepository: Repository<StateSnapshotEntity>,
	) {}

	async onModuleInit(): Promise<void> {
		await this.hydrateFromSnapshot();
		this.timeoutTicker = setInterval(() => {
			let dirty = false;
			for (const room of this.rooms.values()) {
				if (
					this.shouldDeleteRoomWithoutHumans(room) ||
					this.shouldDeleteStalePublicWaitingRoom(room)
				) {
					this.rooms.delete(room.id);
					dirty = true;
					continue;
				}

				if (this.autoAdvanceRoom(room)) {
					dirty = true;
				}

				if (room.status === RoomStatus.IN_HAND && room.gameState) {
					if (this.shouldStartAllInRunout(room)) {
						this.beginAllInRunout(room);
						dirty = true;
					}

					if (this.advanceAllInRunout(room)) {
						dirty = true;
						continue;
					}

					this.autoResolveTimeout(room.id);
				}
			}

			if (dirty) {
				this.markDirty();
			}
		}, 1000);
	}

	onModuleDestroy(): void {
		if (this.timeoutTicker) {
			clearInterval(this.timeoutTicker);
			this.timeoutTicker = null;
		}
	}

	private createRandomBotAvatar(): AvatarConfig {
		return {
			hairStyle: pickRandom(BOT_AVATAR_TOP_OPTIONS),
			skinTone: pickRandom(BOT_AVATAR_SKIN_COLORS),
			hairColor: pickRandom(BOT_AVATAR_HAIR_COLORS),
			faceType: pickRandom(BOT_AVATAR_FACE_OPTIONS),
			eyeType: pickRandom(BOT_AVATAR_EYE_OPTIONS),
			mouthType: pickRandom(BOT_AVATAR_MOUTH_OPTIONS),
			outfit: pickRandom(BOT_AVATAR_OUTFIT_OPTIONS),
		};
	}

	private snapshotPayload() {
		return {
			users: Array.from(this.users.values()),
			friendRequests: Array.from(this.friendRequests.values()),
			roomInvites: Array.from(this.roomInvites.values()),
			rooms: Array.from(this.rooms.values()),
			handReviews: Array.from(this.handReviews.values()),
			roomSeeded: this.roomSeeded,
		};
	}

	private async hydrateFromSnapshot() {
		const snapshot = await this.snapshotRepository.findOne({
			where: { id: this.snapshotId },
		});
		if (!snapshot?.payload) return;

		try {
			const parsed = JSON.parse(snapshot.payload) as {
				users?: UserRecord[];
				friendRequests?: FriendRequestRecord[];
				roomInvites?: RoomInviteRecord[];
				rooms?: RoomRecord[];
				handReviews?: HandReviewRecord[];
				roomSeeded?: boolean;
			};

			this.users.clear();
			this.userNicknameIndex.clear();
			this.friendRequests.clear();
			this.roomInvites.clear();
			this.rooms.clear();
			this.handReviews.clear();

			for (const user of parsed.users ?? []) {
				const normalizedUser: UserRecord = {
					...user,
					preferredLanguage:
						user.preferredLanguage ?? PreferredLanguage.EN,
					friendIds: Array.isArray(user.friendIds)
						? Array.from(new Set(user.friendIds.filter((id) => typeof id === 'string')))
						: [],
					balanceAmount: Number.isFinite(user.balanceAmount)
						? user.balanceAmount
						: this.defaultBalanceForRole(user.role),
				};
				this.users.set(normalizedUser.id, normalizedUser);
				this.userNicknameIndex.set(
					this.normalizeNickname(normalizedUser.nickname),
					normalizedUser.id,
				);
			}
			for (const request of parsed.friendRequests ?? []) {
				if (!request?.id) continue;
				this.friendRequests.set(request.id, request);
			}
			for (const invite of parsed.roomInvites ?? []) {
				if (!invite?.id) continue;
				this.roomInvites.set(invite.id, invite);
			}
			for (const room of parsed.rooms ?? []) {
				room.pendingJoins = Array.isArray(room.pendingJoins)
					? room.pendingJoins.filter((join) => !!join?.userId)
					: [];
				for (const seat of room.seats) {
					if (!seat.participant) continue;
					seat.participant.timeoutStrikeCount = Math.max(
						0,
						Math.floor(seat.participant.timeoutStrikeCount ?? 0),
					);
					seat.participant.sittingOut = !!seat.participant.sittingOut;
				}
				this.rooms.set(room.id, room);
			}
			for (const review of parsed.handReviews ?? []) {
				this.handReviews.set(review.handId, review);
			}
			this.roomSeeded = parsed.roomSeeded ?? false;
		} catch {
			// Ignore malformed snapshot and continue with clean in-memory state.
		}
	}

	private async persistSnapshot() {
		const entity = this.snapshotRepository.create({
			id: this.snapshotId,
			payload: JSON.stringify(this.snapshotPayload()),
		});
		await this.snapshotRepository.save(entity);
	}

	private markDirty() {
		void this.persistSnapshot().catch(() => {
			// Persist failure should not break gameplay flow.
		});
	}

	private normalizeNickname(nickname: string): string {
		return nickname.trim().toLowerCase();
	}

	private defaultBalanceForRole(role: UserRole): number {
		return role === UserRole.GUEST
			? DEFAULT_GUEST_BALANCE
			: DEFAULT_ACCOUNT_BALANCE;
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
			preferredLanguage: PreferredLanguage.EN,
			balanceAmount: this.defaultBalanceForRole(params.role),
			avatar: { ...DEFAULT_AVATAR },
			stats: {
				playedHands: 0,
				winHands: 0,
				biggestPot: 0,
				totalProfit: 0,
			},
			subscriptionActive: params.role === 'pro',
			friendIds: [],
			createdAt: new Date().toISOString(),
		};

		this.users.set(user.id, user);
		this.userNicknameIndex.set(normalized, user.id);
		this.markDirty();

		return user;
	}

	updateUserPassword(userId: string, passwordHash: string): UserRecord {
		const user = this.users.get(userId);
		if (!user) {
			throw new NotFoundException('사용자를 찾을 수 없습니다.');
		}
		user.passwordHash = passwordHash;
		this.markDirty();
		return user;
	}

	updateUserAvatar(userId: string, avatar: AvatarConfig): UserRecord {
		const user = this.users.get(userId);
		if (!user) {
			throw new NotFoundException('사용자를 찾을 수 없습니다.');
		}
		user.avatar = { ...avatar };
		this.markDirty();
		return user;
	}

	updateUserPreferredLanguage(
		userId: string,
		preferredLanguage: PreferredLanguage,
	): UserRecord {
		const user = this.users.get(userId);
		if (!user) {
			throw new NotFoundException('사용자를 찾을 수 없습니다.');
		}
		user.preferredLanguage = preferredLanguage;
		this.markDirty();
		return user;
	}

	addUserBalance(userId: string, amount: number): UserRecord {
		const user = this.users.get(userId);
		if (!user) {
			throw new NotFoundException('사용자를 찾을 수 없습니다.');
		}

		const delta = Math.floor(amount);
		if (!Number.isFinite(delta) || delta <= 0) {
			throw new BadRequestException('충전 금액은 1 이상 정수여야 합니다.');
		}

		user.balanceAmount += delta;
		this.markDirty();
		return user;
	}

	upgradeUserToPro(userId: string): UserRecord {
		const user = this.users.get(userId);
		if (!user) {
			throw new NotFoundException('사용자를 찾을 수 없습니다.');
		}

		user.role = UserRole.PRO;
		user.subscriptionActive = true;
		this.markDirty();
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

	private countHumanParticipants(room: RoomRecord): number {
		return room.seats.filter(
			(seat) => seat.participant?.roleType === ParticipantType.HUMAN,
		).length;
	}

	private countActiveParticipants(room: RoomRecord): number {
		return room.seats.filter(
			(seat) => seat.participant && !seat.participant.sittingOut,
		).length;
	}

	private isRoomEditableStatus(status: RoomStatus): boolean {
		return (
			status === RoomStatus.WAITING_SETUP ||
			status === RoomStatus.READY ||
			status === RoomStatus.HAND_ENDED
		);
	}

	private ensurePendingJoinList(room: RoomRecord): PendingJoinRequest[] {
		room.pendingJoins = room.pendingJoins ?? [];
		return room.pendingJoins;
	}

	private queuePendingJoin(
		room: RoomRecord,
		request: Omit<PendingJoinRequest, 'createdAt'>,
	) {
		const queue = this.ensurePendingJoinList(room);
		const existingIdx = queue.findIndex((item) => item.userId === request.userId);
		if (existingIdx >= 0) {
			const current = queue[existingIdx];
			queue[existingIdx] = {
				...current,
				...request,
				createdAt: current.createdAt,
			};
			return;
		}

		queue.push({
			...request,
			createdAt: new Date().toISOString(),
		});
	}

	private removePendingJoin(room: RoomRecord, userId: string): boolean {
		const queue = this.ensurePendingJoinList(room);
		const before = queue.length;
		room.pendingJoins = queue.filter((item) => item.userId !== userId);
		return room.pendingJoins.length !== before;
	}

	private createHumanParticipantFromPending(
		seatId: number,
		request: PendingJoinRequest,
	): PlayerState {
		return {
			seatId,
			playerId: request.userId,
			userId: request.userId,
			roleType: ParticipantType.HUMAN,
			displayName: request.displayName,
			stackAmount: Math.max(0, Math.floor(request.stackAmount)),
			currentBetAmount: 0,
			folded: false,
			allIn: false,
			connected: true,
			timeoutStrikeCount: 0,
			sittingOut: false,
			avatarInfo: request.avatarInfo,
			holeCards: [],
		};
	}

	private pickPendingJoinSeat(room: RoomRecord, preferredSeatId?: number) {
		if (preferredSeatId) {
			const preferredSeat = room.seats.find((seat) => seat.seatId === preferredSeatId);
			if (preferredSeat && !preferredSeat.participant) {
				return preferredSeat;
			}
		}

		return room.seats.find((seat) => !seat.participant) ?? null;
	}

	private processPendingJoins(room: RoomRecord): boolean {
		if (!this.isRoomEditableStatus(room.status)) {
			return false;
		}

		const queue = this.ensurePendingJoinList(room);
		if (queue.length === 0) {
			return false;
		}

		let changed = false;
		const nextQueue: PendingJoinRequest[] = [];

		for (const request of queue) {
			const seated = room.seats.find(
				(seat) => seat.participant?.userId === request.userId,
			)?.participant;
			if (seated) {
				if (seated.sittingOut) {
					seated.sittingOut = false;
					seated.folded = false;
					seated.allIn = false;
					seated.holeCards = [];
					changed = true;
				}
				continue;
			}

			const seat = this.pickPendingJoinSeat(room, request.preferredSeatId);
			if (!seat) {
				nextQueue.push(request);
				continue;
			}

			seat.participant = this.createHumanParticipantFromPending(seat.seatId, request);
			changed = true;
		}

		room.pendingJoins = nextQueue;
		if (changed) {
			this.setReadyState(room);
		}

		return changed;
	}

	private shouldDeleteRoomWithoutHumans(room: RoomRecord): boolean {
		if (this.countHumanParticipants(room) > 0) {
			return false;
		}
		return this.ensurePendingJoinList(room).length === 0;
	}

	private shouldDeleteStalePublicWaitingRoom(room: RoomRecord): boolean {
		if (room.isPrivate) {
			return false;
		}
		if (room.status !== RoomStatus.WAITING_SETUP) {
			return false;
		}
		if (room.gameState) {
			return false;
		}

		const createdAtMs = Date.parse(room.createdAt);
		if (!Number.isFinite(createdAtMs)) {
			return false;
		}

		return Date.now() - createdAtMs >= STALE_PUBLIC_ROOM_DELETE_MS;
	}

	private isSyntheticNickname(nickname: string): boolean {
		const normalized = this.normalizeNickname(nickname);
		return (
			normalized === 'free_user' ||
			normalized === 'pro_user' ||
			normalized.startsWith('seatcheck_') ||
			normalized.startsWith('viewer_')
		);
	}

	private shouldAutoAdvanceRoom(room: RoomRecord): boolean {
		if (room.status === RoomStatus.CLOSED) {
			return false;
		}

		if (room.isPrivate && room.type !== RoomType.AI_BOT) {
			return false;
		}

		return true;
	}

	private autoAdvanceRoom(room: RoomRecord): boolean {
		if (!this.shouldAutoAdvanceRoom(room)) {
			return false;
		}

		let changed = false;
		if (this.processPendingJoins(room)) {
			changed = true;
		}
		const isPrivateAiBotRoom = room.isPrivate && room.type === RoomType.AI_BOT;

		if (room.status === RoomStatus.HAND_ENDED) {
			if (isPrivateAiBotRoom) {
				const endedAt = room.gameState?.actions.at(-1)?.createdAt;
				const endedAtMs = endedAt ? Date.parse(endedAt) : NaN;
				if (
					Number.isFinite(endedAtMs) &&
					Date.now() - endedAtMs < PRIVATE_AI_BOT_NEXT_HAND_DELAY_MS
				) {
					return changed;
				}
			}

			room.gameState = null;
			room.seats.forEach((seat) => {
				if (!seat.participant) return;
				seat.participant.currentBetAmount = 0;
				seat.participant.holeCards = [];
				seat.participant.folded = false;
				seat.participant.allIn = false;
			});
			room.status = RoomStatus.WAITING_SETUP;
			this.setReadyState(room);
			changed = true;

			if (isPrivateAiBotRoom) {
				const seated = room.seats.filter(
					(seat) => seat.participant && !seat.participant.sittingOut,
				);
				if (seated.length >= 2) {
					room.status = RoomStatus.DEALING;
					room.gameState = this.createInitialGameState(
						room,
						seated.map((seat) => seat.seatId),
					);
					room.status = RoomStatus.IN_HAND;
					return true;
				}
			}
		}

		if (
			!isPrivateAiBotRoom &&
			(room.status === RoomStatus.READY || room.status === RoomStatus.WAITING_SETUP) &&
			!room.gameState
		) {
			const seated = room.seats.filter(
				(seat) => seat.participant && !seat.participant.sittingOut,
			);
			if (seated.length >= 2) {
				room.status = RoomStatus.DEALING;
				room.gameState = this.createInitialGameState(
					room,
					seated.map((seat) => seat.seatId),
				);
				room.status = RoomStatus.IN_HAND;
				changed = true;
			}
		}

		return changed;
	}

	private roomToSummary(room: RoomRecord): TableSummary {
		const currentPlayers = this.countParticipants(room);
		const humanPlayers = this.countHumanParticipants(room);
		return {
			id: room.id,
			code: room.code,
			name: room.name,
			type: room.type,
			status: room.status,
			hostUserId: room.hostUserId,
			blindSmall: room.blindSmall,
			blindBig: room.blindBig,
			currentPlayers,
			humanPlayers,
			maxPlayers: room.maxSeats,
			isPrivate: room.isPrivate,
			hasBeenPublic: room.hasBeenPublic,
			canJoin:
				room.status !== RoomStatus.CLOSED &&
				currentPlayers < room.maxSeats,
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
		if (!this.isRoomEditableStatus(room.status)) {
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
		const players = this.countActiveParticipants(room);
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
		blindSmall?: number;
		blindBig?: number;
		hostUserId: string;
		hostDisplayName: string;
		hostAvatar: AvatarConfig | null;
		hostStackAmount: number;
	}): RoomRecord {
		const maxSeats = Math.min(Math.max(params.maxSeats, 2), 9);
		const blindSmall = Math.max(1, Math.floor(params.blindSmall ?? 50));
		const blindBig = Math.max(
			blindSmall,
			Math.floor(params.blindBig ?? blindSmall * 2),
		);

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
			blindSmall,
			blindBig,
			seats: this.createEmptySeats(maxSeats),
			pendingJoins: [],
			gameState: null,
			lastDealerSeatId: null,
			createdAt: new Date().toISOString(),
		};

		room.seats[0].participant = {
			seatId: 1,
			playerId: params.hostUserId,
			userId: params.hostUserId,
			roleType: ParticipantType.HUMAN,
			displayName: params.hostDisplayName,
			stackAmount: Math.max(0, Math.floor(params.hostStackAmount)),
			currentBetAmount: 0,
			folded: false,
			allIn: false,
			connected: true,
			timeoutStrikeCount: 0,
			sittingOut: false,
			avatarInfo: params.hostAvatar,
			holeCards: [],
		};

		this.rooms.set(room.id, room);
		this.setReadyState(room);
		this.markDirty();

		return room;
	}

	listRoomSummaries(type?: RoomType): TableSummary[] {
		return Array.from(this.rooms.values())
			.filter((room) => room.hostUserId !== 'system-host')
			.filter((room) => {
				const host = this.users.get(room.hostUserId);
				if (!host) return true;
				return !this.isSyntheticNickname(host.nickname);
			})
			.filter((room) => (type ? room.type === type : true))
			.map((room) => this.roomToSummary(room));
	}

	listLeaderboard(): LeaderboardEntry[] {
		return Array.from(this.users.values())
			.map((user) => ({
				id: user.id,
				nickname: user.nickname,
				role: user.role,
				balanceAmount: user.balanceAmount,
			}))
			.filter((user) => user.role !== UserRole.GUEST)
			.filter((user) => !this.isSyntheticNickname(user.nickname))
			.sort((a, b) => b.balanceAmount - a.balanceAmount || a.nickname.localeCompare(b.nickname));
	}

	getRoomDetail(roomId: string): RoomRecord {
		return this.ensureRoom(roomId);
	}

	private ensureUser(userId: string): UserRecord {
		const user = this.users.get(userId);
		if (!user) {
			throw new NotFoundException('사용자를 찾을 수 없습니다.');
		}
		return user;
	}

	private ensureFriendLink(a: UserRecord, b: UserRecord) {
		a.friendIds = Array.from(new Set(a.friendIds ?? []));
		b.friendIds = Array.from(new Set(b.friendIds ?? []));
		if (!a.friendIds.includes(b.id)) {
			a.friendIds.push(b.id);
		}
		if (!b.friendIds.includes(a.id)) {
			b.friendIds.push(a.id);
		}
	}

	searchUsersByNickname(query: string, requesterUserId: string) {
		const requester = this.ensureUser(requesterUserId);
		const normalized = this.normalizeNickname(query);
		if (!normalized) {
			return [];
		}

		return Array.from(this.users.values())
			.filter((user) => user.id !== requester.id)
			.filter((user) => this.normalizeNickname(user.nickname).includes(normalized))
			.slice(0, 20)
			.map((user) => ({
				id: user.id,
				nickname: user.nickname,
				role: user.role,
				isFriend: requester.friendIds.includes(user.id),
			}));
	}

	listFriends(userId: string) {
		const user = this.ensureUser(userId);
		return user.friendIds
			.map((friendId) => this.users.get(friendId))
			.filter((friend): friend is UserRecord => !!friend)
			.map((friend) => ({
				id: friend.id,
				nickname: friend.nickname,
				role: friend.role,
			}));
	}

	listIncomingFriendRequests(userId: string) {
		this.ensureUser(userId);
		return Array.from(this.friendRequests.values())
			.filter((request) => request.status === 'pending')
			.filter((request) => request.targetUserId === userId)
			.map((request) => {
				const requester = this.users.get(request.requesterUserId);
				return {
					id: request.id,
					requesterUserId: request.requesterUserId,
					requesterNickname: requester?.nickname ?? 'Unknown',
					createdAt: request.createdAt,
				};
			});
	}

	listOutgoingFriendRequests(userId: string) {
		this.ensureUser(userId);
		return Array.from(this.friendRequests.values())
			.filter((request) => request.status === 'pending')
			.filter((request) => request.requesterUserId === userId)
			.map((request) => {
				const target = this.users.get(request.targetUserId);
				return {
					id: request.id,
					targetUserId: request.targetUserId,
					targetNickname: target?.nickname ?? 'Unknown',
					createdAt: request.createdAt,
				};
			});
	}

	createFriendRequestByNickname(requesterUserId: string, targetNickname: string) {
		const requester = this.ensureUser(requesterUserId);
		const target = this.findUserByNickname(targetNickname);
		if (!target) {
			throw new NotFoundException('대상 사용자를 찾을 수 없습니다.');
		}
		if (target.id === requester.id) {
			throw new BadRequestException('본인에게 친구 요청을 보낼 수 없습니다.');
		}
		if (requester.friendIds.includes(target.id)) {
			throw new BadRequestException('이미 친구로 등록된 사용자입니다.');
		}

		const existingPending = Array.from(this.friendRequests.values()).find(
			(request) =>
				request.status === 'pending' &&
				((request.requesterUserId === requester.id &&
					request.targetUserId === target.id) ||
					(request.requesterUserId === target.id &&
						request.targetUserId === requester.id)),
		);
		if (existingPending) {
			throw new BadRequestException('이미 처리 대기 중인 친구 요청이 있습니다.');
		}

		const next: FriendRequestRecord = {
			id: randomUUID(),
			requesterUserId: requester.id,
			targetUserId: target.id,
			status: 'pending',
			createdAt: new Date().toISOString(),
		};

		this.friendRequests.set(next.id, next);
		this.markDirty();
		return next;
	}

	respondFriendRequest(targetUserId: string, requestId: string, accept: boolean) {
		const target = this.ensureUser(targetUserId);
		const request = this.friendRequests.get(requestId);
		if (!request) {
			throw new NotFoundException('친구 요청을 찾을 수 없습니다.');
		}
		if (request.targetUserId !== target.id) {
			throw new BadRequestException('본인에게 온 친구 요청만 처리할 수 있습니다.');
		}
		if (request.status !== 'pending') {
			throw new BadRequestException('이미 처리된 친구 요청입니다.');
		}

		if (accept) {
			const requester = this.ensureUser(request.requesterUserId);
			this.ensureFriendLink(requester, target);
			request.status = 'accepted';
		} else {
			request.status = 'declined';
		}
		request.respondedAt = new Date().toISOString();
		this.friendRequests.set(request.id, request);
		this.markDirty();
		return request;
	}

	private expireRoomInvites() {
		let dirty = false;
		const now = Date.now();

		for (const invite of this.roomInvites.values()) {
			if (invite.status !== 'pending') continue;

			const createdAtMs = Date.parse(invite.createdAt);
			const room = this.rooms.get(invite.roomId);
			const shouldExpireByTime =
				Number.isFinite(createdAtMs) && now - createdAtMs > ROOM_INVITE_EXPIRE_MS;
			const shouldExpireByRoom =
				!room || room.status === RoomStatus.CLOSED || !room.isPrivate;

			if (!shouldExpireByTime && !shouldExpireByRoom) {
				continue;
			}

			invite.status = 'expired';
			invite.respondedAt = new Date().toISOString();
			this.roomInvites.set(invite.id, invite);
			dirty = true;
		}

		if (dirty) {
			this.markDirty();
		}
	}

	listRoomInvites(userId: string) {
		this.ensureUser(userId);
		this.expireRoomInvites();

		return Array.from(this.roomInvites.values())
			.filter((invite) => invite.status === 'pending')
			.filter((invite) => invite.inviteeUserId === userId)
			.map((invite) => {
				const inviter = this.users.get(invite.inviterUserId);
				const room = this.rooms.get(invite.roomId);
				return {
					id: invite.id,
					roomId: invite.roomId,
					roomName: room?.name ?? 'Unknown Room',
					roomType: room?.type ?? RoomType.CASH,
					inviterUserId: invite.inviterUserId,
					inviterNickname: inviter?.nickname ?? 'Unknown',
					createdAt: invite.createdAt,
				};
			});
	}

	sendRoomInvite(inviterUserId: string, roomId: string, inviteeUserId: string) {
		const inviter = this.ensureUser(inviterUserId);
		const invitee = this.ensureUser(inviteeUserId);
		if (inviter.id === invitee.id) {
			throw new BadRequestException('본인에게는 초대할 수 없습니다.');
		}
		if (!inviter.friendIds.includes(invitee.id)) {
			throw new BadRequestException('친구 관계인 사용자만 초대할 수 있습니다.');
		}

		const room = this.ensureRoom(roomId);
		if (!room.isPrivate || room.status === RoomStatus.CLOSED) {
			throw new BadRequestException('비공개 룸에서만 초대를 보낼 수 있습니다.');
		}

		const inviterSeated = room.seats.some(
			(seat) => seat.participant?.userId === inviter.id,
		);
		if (!inviterSeated) {
			throw new BadRequestException('해당 룸에 착석한 사용자만 초대할 수 있습니다.');
		}

		const inviteeSeated = room.seats.some(
			(seat) => seat.participant?.userId === invitee.id,
		);
		if (inviteeSeated) {
			throw new BadRequestException('이미 해당 룸에 입장한 사용자입니다.');
		}

		this.expireRoomInvites();
		const existing = Array.from(this.roomInvites.values()).find(
			(invite) =>
				invite.status === 'pending' &&
				invite.roomId === room.id &&
				invite.inviteeUserId === invitee.id,
		);
		if (existing) {
			throw new BadRequestException('이미 처리 대기 중인 룸 초대가 있습니다.');
		}

		const invite: RoomInviteRecord = {
			id: randomUUID(),
			roomId: room.id,
			inviterUserId: inviter.id,
			inviteeUserId: invitee.id,
			status: 'pending',
			createdAt: new Date().toISOString(),
		};
		this.roomInvites.set(invite.id, invite);
		this.markDirty();
		return invite;
	}

	respondRoomInvite(inviteeUserId: string, inviteId: string, accept: boolean) {
		const invitee = this.ensureUser(inviteeUserId);
		this.expireRoomInvites();

		const invite = this.roomInvites.get(inviteId);
		if (!invite) {
			throw new NotFoundException('룸 초대를 찾을 수 없습니다.');
		}
		if (invite.inviteeUserId !== invitee.id) {
			throw new BadRequestException('본인에게 온 룸 초대만 처리할 수 있습니다.');
		}
		if (invite.status !== 'pending') {
			throw new BadRequestException('이미 처리된 룸 초대입니다.');
		}

		if (!accept) {
			invite.status = 'declined';
			invite.respondedAt = new Date().toISOString();
			this.roomInvites.set(invite.id, invite);
			this.markDirty();
			return this.ensureRoom(invite.roomId);
		}

		const room = this.ensureRoom(invite.roomId);
		if (!room.isPrivate || room.status === RoomStatus.CLOSED) {
			throw new BadRequestException('유효하지 않은 비공개 룸 초대입니다.');
		}

		const joined = this.joinRoomFirstEmptySeat({
			roomId: room.id,
			userId: invitee.id,
			displayName: invitee.nickname,
			avatar: invitee.avatar,
			stackAmount: invitee.balanceAmount,
		});

		invite.status = 'accepted';
		invite.respondedAt = new Date().toISOString();
		this.roomInvites.set(invite.id, invite);
		this.markDirty();

		return joined;
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
		stackAmount: number;
	}): RoomRecord {
		const room = this.ensureRoom(params.roomId);
		if (room.status === RoomStatus.CLOSED) {
			throw new BadRequestException('이미 종료된 룸입니다.');
		}

		const alreadySeated = room.seats.find(
			(seat) => seat.participant?.userId === params.userId,
		)?.participant;
		if (alreadySeated) {
			if (alreadySeated.sittingOut) {
				if (this.isRoomEditableStatus(room.status)) {
					alreadySeated.sittingOut = false;
					alreadySeated.folded = false;
					alreadySeated.allIn = false;
					alreadySeated.holeCards = [];
					this.removePendingJoin(room, params.userId);
					this.setReadyState(room);
				} else {
					this.queuePendingJoin(room, {
						userId: params.userId,
						displayName: params.displayName,
						avatarInfo: params.avatar,
						stackAmount: alreadySeated.stackAmount,
						preferredSeatId: alreadySeated.seatId,
					});
				}
				this.markDirty();
			}

			if (this.removePendingJoin(room, params.userId)) {
				this.markDirty();
			}
			return room;
		}

		const seat = room.seats.find((item) => !item.participant);
		if (!seat) {
			throw new BadRequestException('빈 좌석이 없습니다.');
		}

		if (this.isRoomEditableStatus(room.status)) {
			seat.participant = this.createHumanParticipantFromPending(seat.seatId, {
				userId: params.userId,
				displayName: params.displayName,
				avatarInfo: params.avatar,
				stackAmount: params.stackAmount,
				preferredSeatId: seat.seatId,
				createdAt: new Date().toISOString(),
			});
			this.removePendingJoin(room, params.userId);
			this.setReadyState(room);
		} else {
			this.queuePendingJoin(room, {
				userId: params.userId,
				displayName: params.displayName,
				avatarInfo: params.avatar,
				stackAmount: params.stackAmount,
				preferredSeatId: seat.seatId,
			});
		}

		this.markDirty();
		return room;
	}

	takeSeat(params: {
		roomId: string;
		seatId: number;
		userId: string;
		displayName: string;
		avatar: AvatarConfig | null;
		stackAmount: number;
	}): RoomRecord {
		const room = this.ensureRoom(params.roomId);
		const existing = room.seats.find(
			(seat) => seat.participant?.userId === params.userId,
		);
		if (existing) {
			if (existing.seatId !== params.seatId) {
				throw new BadRequestException('이미 다른 좌석에 착석 중입니다.');
			}

			const participant = existing.participant;
			if (!participant) {
				throw new BadRequestException('좌석 상태를 확인할 수 없습니다.');
			}

			if (!participant.sittingOut) {
				if (this.removePendingJoin(room, params.userId)) {
					this.markDirty();
				}
				return room;
			}

			if (this.isRoomEditableStatus(room.status)) {
				participant.sittingOut = false;
				participant.folded = false;
				participant.allIn = false;
				participant.holeCards = [];
				this.removePendingJoin(room, params.userId);
				this.setReadyState(room);
			} else {
				this.queuePendingJoin(room, {
					userId: params.userId,
					displayName: params.displayName,
					avatarInfo: params.avatar,
					stackAmount: participant.stackAmount,
					preferredSeatId: params.seatId,
				});
			}

			this.markDirty();
			return room;
		}

		const targetSeat = this.ensureSeat(room, params.seatId);
		if (targetSeat.participant) {
			throw new ConflictException('이미 사용 중인 좌석입니다.');
		}

		if (this.isRoomEditableStatus(room.status)) {
			targetSeat.participant = this.createHumanParticipantFromPending(params.seatId, {
				userId: params.userId,
				displayName: params.displayName,
				avatarInfo: params.avatar,
				stackAmount: params.stackAmount,
				preferredSeatId: params.seatId,
				createdAt: new Date().toISOString(),
			});
			this.removePendingJoin(room, params.userId);
			this.setReadyState(room);
		} else {
			this.queuePendingJoin(room, {
				userId: params.userId,
				displayName: params.displayName,
				avatarInfo: params.avatar,
				stackAmount: params.stackAmount,
				preferredSeatId: params.seatId,
			});
		}

		this.markDirty();
		return room;
	}

	leaveSeat(roomId: string, seatId: number, actorUserId: string): RoomRecord {
		const room = this.ensureRoom(roomId);
		const leaveDuringHand = room.status === RoomStatus.IN_HAND;
		if (!leaveDuringHand) {
			this.assertRoomEditable(room);
		}

		const seat = this.ensureSeat(room, seatId);
		if (!seat.participant) {
			throw new BadRequestException('비어있는 좌석입니다.');
		}

		const participant = seat.participant;
		if (participant.roleType === ParticipantType.HUMAN) {
			const selfLeave = participant.userId === actorUserId;
			const privateHostControl = room.isPrivate && room.hostUserId === actorUserId;
			if (!selfLeave && !privateHostControl) {
				throw new BadRequestException('본인 좌석 또는 방장만 좌석 이탈이 가능합니다.');
			}
		} else {
			this.assertHostControlAllowed(room, actorUserId);
		}

		if (leaveDuringHand) {
			this.foldSeatBeforeLeave(room, seatId);
		}

		if (participant.roleType === ParticipantType.HUMAN && participant.userId) {
			this.removePendingJoin(room, participant.userId);
		}

		seat.participant = null;
		if (
			this.countHumanParticipants(room) === 0 &&
			this.ensurePendingJoinList(room).length === 0
		) {
			this.rooms.delete(room.id);
			this.markDirty();
			return room;
		}

		if (!leaveDuringHand) {
			if (!this.processPendingJoins(room)) {
				this.setReadyState(room);
			}
		}
		this.markDirty();
		return room;
	}

	setSeatSittingOut(
		roomId: string,
		seatId: number,
		actorUserId: string,
		sittingOut: boolean,
	): RoomRecord {
		const room = this.ensureRoom(roomId);
		const seat = this.ensureSeat(room, seatId);
		const participant = seat.participant;
		if (!participant || participant.roleType !== ParticipantType.HUMAN) {
			throw new BadRequestException('사람 플레이어가 착석 중인 좌석만 변경할 수 있습니다.');
		}

		const selfControl = participant.userId === actorUserId;
		const privateHostControl = room.isPrivate && room.hostUserId === actorUserId;
		if (!selfControl && !privateHostControl) {
			throw new BadRequestException('본인 좌석 또는 방장만 상태를 변경할 수 있습니다.');
		}

		if (sittingOut) {
			if (participant.sittingOut) {
				return room;
			}

			if (room.status === RoomStatus.IN_HAND) {
				this.foldSeatBeforeLeave(room, seatId);
			}

			participant.sittingOut = true;
			participant.folded = true;
			participant.allIn = false;
			participant.holeCards = [];
			this.removePendingJoin(room, participant.userId!);

			if (room.status !== RoomStatus.IN_HAND) {
				this.setReadyState(room);
			}

			this.markDirty();
			return room;
		}

		if (!participant.sittingOut) {
			return room;
		}

		if (this.isRoomEditableStatus(room.status)) {
			participant.sittingOut = false;
			participant.folded = false;
			participant.allIn = false;
			participant.holeCards = [];
			this.removePendingJoin(room, participant.userId!);
			this.setReadyState(room);
		} else {
			this.queuePendingJoin(room, {
				userId: participant.userId!,
				displayName: participant.displayName,
				avatarInfo: participant.avatarInfo ?? null,
				stackAmount: participant.stackAmount,
				preferredSeatId: seatId,
			});
		}

		this.markDirty();
		return room;
	}

	cancelPendingJoin(roomId: string, userId: string): RoomRecord {
		const room = this.ensureRoom(roomId);
		const removed = this.removePendingJoin(room, userId);
		if (!removed) {
			throw new BadRequestException('현재 입장 대기 상태가 아닙니다.');
		}

		this.markDirty();
		return room;
	}

	private foldSeatBeforeLeave(room: RoomRecord, seatId: number) {
		const state = room.gameState;
		const seat = this.ensureSeat(room, seatId);
		const participant = seat.participant;
		if (!state || !participant) return;

		if (
			state.currentTurnSeatId === participant.seatId &&
			!participant.folded &&
			!participant.allIn
		) {
			this.applyPlayerAction({
				roomId: room.id,
				actorSeatId: participant.seatId,
				action: ActionType.FOLD,
			});
			return;
		}

		if (!participant.folded) {
			participant.folded = true;
			if (!state.actedSeatIds.includes(participant.seatId)) {
				state.actedSeatIds.push(participant.seatId);
			}

			state.actions.push({
				handId: state.handId,
				order: state.actions.length + 1,
				seatId: participant.seatId,
				playerId: participant.playerId,
				action: ActionType.FOLD,
				amount: 0,
				potAfter: state.potAmount,
				street: state.street,
				createdAt: new Date().toISOString(),
			});
		}

		const remaining = this.activePlayers(room);
		if (remaining.length === 1) {
			this.completeHand(room, [remaining[0]]);
			return;
		}

		if (remaining.length === 0) {
			room.status = RoomStatus.HAND_ENDED;
			state.street = HandStreet.RESULT;
			state.currentTurnSeatId = null;
			state.actionTimerDeadline = null;
			this.processPendingJoins(room);
			this.markDirty();
			return;
		}

		if (state.currentTurnSeatId === participant.seatId) {
			const nextSeatId = this.nextTurnSeatId(room, participant.seatId);
			state.currentTurnSeatId = nextSeatId;
			state.actionTimerDeadline = nextSeatId
				? new Date(Date.now() + this.turnTimeoutSec * 1000).toISOString()
				: null;
		}

		if (this.isStreetDone(room)) {
			this.moveStreet(room);
		}

		this.markDirty();
	}

	addBot(params: {
		roomId: string;
		seatId: number;
		actorUserId: string;
		config: NonNullable<PlayerState['botConfig']>;
	}): RoomRecord {
		const room = this.ensureRoom(params.roomId);
		if (room.type !== RoomType.AI_BOT) {
			throw new BadRequestException('AI Bot 타입 룸에서만 봇을 추가할 수 있습니다.');
		}
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
			timeoutStrikeCount: 0,
			sittingOut: false,
			avatarInfo: this.createRandomBotAvatar(),
			holeCards: [],
			botConfig: params.config,
		};

		this.setReadyState(room);
		this.markDirty();
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
		this.markDirty();
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
		if (!this.processPendingJoins(room)) {
			this.setReadyState(room);
		}
		this.markDirty();
		return room;
	}

	updateRoomBlinds(params: {
		roomId: string;
		actorUserId: string;
		blindSmall: number;
		blindBig: number;
	}): RoomRecord {
		const room = this.ensureRoom(params.roomId);
		this.assertHostControlAllowed(room, params.actorUserId);
		this.assertRoomEditable(room);

		const blindSmall = Math.floor(params.blindSmall);
		const blindBig = Math.floor(params.blindBig);
		if (!Number.isFinite(blindSmall) || blindSmall < 1) {
			throw new BadRequestException('Small blind는 1 이상 정수여야 합니다.');
		}
		if (!Number.isFinite(blindBig) || blindBig < blindSmall) {
			throw new BadRequestException(
				'Big blind는 Small blind 이상 정수여야 합니다.',
			);
		}

		room.blindSmall = blindSmall;
		room.blindBig = blindBig;
		this.markDirty();
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
		room.createdAt = new Date().toISOString();
		this.markDirty();
		return room;
	}

	closeRoom(roomId: string, actorUserId: string): RoomRecord {
		const room = this.ensureRoom(roomId);
		if (!room.isPrivate) {
			throw new BadRequestException('공개 룸은 수동 종료할 수 없습니다.');
		}
		if (room.hostUserId !== actorUserId) {
			throw new BadRequestException('방장만 룸을 종료할 수 있습니다.');
		}
		room.status = RoomStatus.CLOSED;
		room.gameState = null;
		this.markDirty();
		return room;
	}

	startGame(roomId: string, actorUserId: string): RoomRecord {
		const room = this.ensureRoom(roomId);
		if (!room.isPrivate) {
			throw new BadRequestException('공개 룸은 자동으로 핸드를 시작합니다.');
		}
		this.assertHostControlAllowed(room, actorUserId);
		this.processPendingJoins(room);

		if (
			room.status !== RoomStatus.WAITING_SETUP &&
			room.status !== RoomStatus.READY &&
			room.status !== RoomStatus.HAND_ENDED
		) {
			throw new BadRequestException('현재 상태에서는 게임을 시작할 수 없습니다.');
		}

		const seated = room.seats.filter(
			(seat) => seat.participant && !seat.participant.sittingOut,
		);
		if (seated.length < 2) {
			throw new BadRequestException('최소 2명 이상 착석해야 시작할 수 있습니다.');
		}

		room.status = RoomStatus.DEALING;
		room.gameState = this.createInitialGameState(room, seated.map((s) => s.seatId));
		room.status = RoomStatus.IN_HAND;
		this.markDirty();

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

	autoResolveTimeout(roomId: string): RoomRecord {
		const room = this.ensureRoom(roomId);
		const state = room.gameState;

		if (!state || room.status !== RoomStatus.IN_HAND) {
			return room;
		}

		if (!state.currentTurnSeatId || !state.actionTimerDeadline) {
			return room;
		}

		const deadlineMs = Date.parse(state.actionTimerDeadline);
		if (!Number.isFinite(deadlineMs) || deadlineMs > Date.now()) {
			return room;
		}

		const actingSeat = this.ensureSeat(room, state.currentTurnSeatId);
		const actor = actingSeat.participant;
		if (!actor || actor.sittingOut || actor.folded || actor.allIn) {
			const nextSeatId = this.nextTurnSeatId(room, state.currentTurnSeatId);
			state.currentTurnSeatId = nextSeatId;
			state.actionTimerDeadline = nextSeatId
				? new Date(Date.now() + this.turnTimeoutSec * 1000).toISOString()
				: null;
			this.markDirty();
			return room;
		}

		const toCall = Math.max(state.maxBetAmount - actor.currentBetAmount, 0);
		const autoAction = toCall > 0 ? ActionType.FOLD : ActionType.CHECK;

			const resolved = this.applyPlayerAction({
			roomId,
			actorSeatId: actor.seatId,
			action: autoAction,
				isAutoTimeout: true,
		});

			const timeoutSeat = resolved.seats.find((seat) => seat.seatId === actor.seatId);
			const timeoutActor = timeoutSeat?.participant;
			if (
				timeoutActor &&
				timeoutActor.roleType === ParticipantType.HUMAN &&
				timeoutActor.userId &&
				(timeoutActor.timeoutStrikeCount ?? 0) >= MAX_TIMEOUT_STRIKES_BEFORE_AUTO_LEAVE
			) {
				return this.leaveSeat(roomId, timeoutActor.seatId, timeoutActor.userId);
			}

			return resolved;
	}

	private activePlayers(room: RoomRecord): PlayerState[] {
		return room.seats
			.map((seat) => seat.participant)
			.filter((participant): participant is PlayerState => !!participant)
			.filter((participant) => !participant.sittingOut)
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
			if (participant.sittingOut) continue;
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
	}

	private shouldStartAllInRunout(room: RoomRecord): boolean {
		const state = room.gameState;
		if (!state || room.status !== RoomStatus.IN_HAND) return false;
		if (state.runoutMode) return false;
		if (state.street === HandStreet.SHOWDOWN || state.street === HandStreet.RESULT) {
			return false;
		}

		const active = room.seats
			.map((seat) => seat.participant)
			.filter((participant): participant is PlayerState => !!participant)
			.filter((participant) => !participant.sittingOut)
			.filter((participant) => !participant.folded);
		if (active.length <= 1) return false;

		const actionable = active.filter((participant) => !participant.allIn);
		return actionable.length <= 1;
	}

	private beginAllInRunout(room: RoomRecord) {
		const state = room.gameState;
		if (!state) return;

		state.runoutMode = true;
		state.runoutNextAtMs = Date.now() + 450;
		state.currentTurnSeatId = null;
		state.actionTimerDeadline = null;
	}

	private advanceAllInRunout(room: RoomRecord): boolean {
		const state = room.gameState;
		if (!state || room.status !== RoomStatus.IN_HAND || !state.runoutMode) {
			return false;
		}

		const dueAt = state.runoutNextAtMs ?? 0;
		if (Date.now() < dueAt) {
			return false;
		}

		this.moveStreet(room);
		if (!room.gameState || room.status !== RoomStatus.IN_HAND) {
			return true;
		}

		room.gameState.runoutMode = true;
		room.gameState.runoutNextAtMs = Date.now() + 700;
		room.gameState.currentTurnSeatId = null;
		room.gameState.actionTimerDeadline = null;
		return true;
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

	private parseRank(rankToken: string): number {
		if (rankToken === 'A') return 14;
		if (rankToken === 'K') return 13;
		if (rankToken === 'Q') return 12;
		if (rankToken === 'J') return 11;
		if (rankToken === 'T') return 10;
		const value = Number.parseInt(rankToken, 10);
		if (!Number.isFinite(value) || value < 2 || value > 9) {
			throw new BadRequestException(`유효하지 않은 카드 랭크입니다: ${rankToken}`);
		}
		return value;
	}

	private parseCard(card: string): { rank: number; suit: string } {
		if (card.length < 2) {
			throw new BadRequestException(`유효하지 않은 카드입니다: ${card}`);
		}
		const suit = card.slice(-1);
		const rankToken = card.slice(0, -1);
		return {
			rank: this.parseRank(rankToken),
			suit,
		};
	}

	private straightHigh(ranks: number[]): number | null {
		const unique = Array.from(new Set(ranks)).sort((a, b) => b - a);
		if (unique.includes(14)) {
			unique.push(1);
		}
		for (let i = 0; i <= unique.length - 5; i += 1) {
			const start = unique[i];
			let ok = true;
			for (let step = 1; step < 5; step += 1) {
				if (!unique.includes(start - step)) {
					ok = false;
					break;
				}
			}
			if (ok) {
				return start === 1 ? 5 : start;
			}
		}
		return null;
	}

	private evaluateFiveCards(cards: string[]): { category: number; values: number[] } {
		const parsed = cards.map((card) => this.parseCard(card));
		const ranks = parsed.map((card) => card.rank).sort((a, b) => b - a);
		const suits = parsed.map((card) => card.suit);
		const flush = suits.every((suit) => suit === suits[0]);
		const straight = this.straightHigh(ranks);

		const rankCounts = new Map<number, number>();
		for (const rank of ranks) {
			rankCounts.set(rank, (rankCounts.get(rank) ?? 0) + 1);
		}

		const groups = Array.from(rankCounts.entries()).sort((a, b) => {
			if (b[1] !== a[1]) return b[1] - a[1];
			return b[0] - a[0];
		});

		if (flush && straight) {
			return { category: 8, values: [straight] };
		}

		if (groups[0]?.[1] === 4) {
			const four = groups[0][0];
			const kicker = groups[1][0];
			return { category: 7, values: [four, kicker] };
		}

		if (groups[0]?.[1] === 3 && groups[1]?.[1] === 2) {
			return { category: 6, values: [groups[0][0], groups[1][0]] };
		}

		if (flush) {
			return { category: 5, values: [...ranks] };
		}

		if (straight) {
			return { category: 4, values: [straight] };
		}

		if (groups[0]?.[1] === 3) {
			const trips = groups[0][0];
			const kickers = groups
				.filter((group) => group[1] === 1)
				.map((group) => group[0])
				.sort((a, b) => b - a);
			return { category: 3, values: [trips, ...kickers] };
		}

		if (groups[0]?.[1] === 2 && groups[1]?.[1] === 2) {
			const highPair = Math.max(groups[0][0], groups[1][0]);
			const lowPair = Math.min(groups[0][0], groups[1][0]);
			const kicker = groups.find((group) => group[1] === 1)?.[0] ?? 0;
			return { category: 2, values: [highPair, lowPair, kicker] };
		}

		if (groups[0]?.[1] === 2) {
			const pair = groups[0][0];
			const kickers = groups
				.filter((group) => group[1] === 1)
				.map((group) => group[0])
				.sort((a, b) => b - a);
			return { category: 1, values: [pair, ...kickers] };
		}

		return { category: 0, values: [...ranks] };
	}

	private compareEvaluatedHand(
		a: { category: number; values: number[] },
		b: { category: number; values: number[] },
	): number {
		if (a.category !== b.category) {
			return a.category - b.category;
		}

		const length = Math.max(a.values.length, b.values.length);
		for (let idx = 0; idx < length; idx += 1) {
			const av = a.values[idx] ?? 0;
			const bv = b.values[idx] ?? 0;
			if (av !== bv) {
				return av - bv;
			}
		}

		return 0;
	}

	private chooseFiveFrom(cards: string[]): string[][] {
		const combinations: string[][] = [];
		for (let a = 0; a < cards.length - 4; a += 1) {
			for (let b = a + 1; b < cards.length - 3; b += 1) {
				for (let c = b + 1; c < cards.length - 2; c += 1) {
					for (let d = c + 1; d < cards.length - 1; d += 1) {
						for (let e = d + 1; e < cards.length; e += 1) {
							combinations.push([cards[a], cards[b], cards[c], cards[d], cards[e]]);
						}
					}
				}
			}
		}
		return combinations;
	}

	private evaluateBestHand(cards: string[]): { category: number; values: number[] } {
		const combinations = this.chooseFiveFrom(cards);
		let best = this.evaluateFiveCards(combinations[0]);

		for (let idx = 1; idx < combinations.length; idx += 1) {
			const current = this.evaluateFiveCards(combinations[idx]);
			if (this.compareEvaluatedHand(current, best) > 0) {
				best = current;
			}
		}

		return best;
	}

	private determineShowdownWinners(room: RoomRecord): PlayerState[] {
		const state = room.gameState;
		if (!state) {
			throw new BadRequestException('진행 중인 핸드가 없습니다.');
		}

		const candidates = this.activePlayers(room);
		if (candidates.length === 0) {
			throw new BadRequestException('승자를 결정할 플레이어가 없습니다.');
		}

		if (candidates.length === 1) {
			return [candidates[0]];
		}

		let bestScore: { category: number; values: number[] } | null = null;
		let winners: PlayerState[] = [];

		for (const candidate of candidates) {
			const allCards = [...candidate.holeCards, ...state.boardCards];
			if (allCards.length < 5) {
				continue;
			}

			const score = this.evaluateBestHand(allCards);
			if (!bestScore) {
				bestScore = score;
				winners = [candidate];
				continue;
			}

			const compared = this.compareEvaluatedHand(score, bestScore);
			if (compared > 0) {
				bestScore = score;
				winners = [candidate];
			} else if (compared === 0) {
				winners.push(candidate);
			}
		}

		if (winners.length === 0) {
			return [candidates[0]];
		}

		return winners;
	}

	private completeHand(room: RoomRecord, winners: PlayerState[]) {
		const state = room.gameState;
		if (!state) return;
		if (winners.length === 0) {
			throw new BadRequestException('승자 정보가 없습니다.');
		}

		const pot = state.potAmount;
		const orderedWinners = [...winners].sort((a, b) => a.seatId - b.seatId);
		state.winnerPlayerIds = orderedWinners.map((winner) => winner.playerId);
		const share = Math.floor(pot / orderedWinners.length);
		const remain = pot % orderedWinners.length;

		orderedWinners.forEach((winner, idx) => {
			const gained = share + (idx < remain ? 1 : 0);
			winner.stackAmount += gained;

			const winnerUser = winner.userId ? this.findUserById(winner.userId) : null;
			if (winnerUser) {
				winnerUser.stats.winHands += 1;
				winnerUser.stats.biggestPot = Math.max(winnerUser.stats.biggestPot, gained);
				winnerUser.stats.totalProfit += gained;
			}
		});

		room.seats.forEach((seat) => {
			const participant = seat.participant;
			if (!participant?.userId) return;
			const user = this.findUserById(participant.userId);
			if (!user) return;
			user.stats.playedHands += 1;
			if (room.type !== RoomType.AI_BOT) {
				user.balanceAmount = participant.stackAmount;
			}
		});

		const review: HandReviewRecord = {
			handId: state.handId,
			roomId: room.id,
			participantIds: room.seats
				.map((seat) => seat.participant?.userId)
				.filter((item): item is string => !!item),
			participants: room.seats.flatMap((seat): HandReviewParticipant[] => {
				const participant = seat.participant;
				if (!participant) return [];
				return [
					{
						seatId: participant.seatId,
						playerId: participant.playerId,
						roleType: participant.roleType,
						userId: participant.userId,
						displayName: participant.displayName,
						holeCards: [...participant.holeCards],
					},
				];
			}),
			positions: { ...state.positions },
			blindSmall: room.blindSmall,
			blindBig: room.blindBig,
			boardCards: [...state.boardCards],
			actions: [...state.actions],
			winnerPlayerId: orderedWinners[0].playerId,
			resultPot: pot,
			analyses: [],
			favoriteUserIds: [],
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
		});

		if (room.type === RoomType.AI_BOT) {
			room.seats.forEach((seat) => {
				const participant = seat.participant;
				if (!participant) return;
				if (participant.stackAmount <= 0) {
					seat.participant = null;
				}
			});
		}

		this.processPendingJoins(room);

		this.markDirty();
	}

	private isStreetDone(room: RoomRecord): boolean {
		const state = room.gameState;
		if (!state) return false;

		const actives = room.seats
			.map((seat) => seat.participant)
			.filter((p): p is PlayerState => !!p)
			.filter((p) => !p.sittingOut && !p.folded && !p.allIn);

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
			const winners = this.determineShowdownWinners(room);
			this.completeHand(room, winners);
			return;
		}

		if (state.runoutMode) {
			state.currentTurnSeatId = null;
			state.actionTimerDeadline = null;
			return;
		}

		const activeAggressorSeat = state.lastAggressiveSeatId
			? room.seats.find(
					(seat) =>
						seat.participant?.seatId === state.lastAggressiveSeatId &&
						!seat.participant.sittingOut &&
						!seat.participant.folded &&
						!seat.participant.allIn,
				)
			: null;

		const next = activeAggressorSeat
			? activeAggressorSeat.seatId
			: state.lastAggressiveSeatId
				? this.nextTurnSeatId(room, state.lastAggressiveSeatId) ?? state.dealerSeatId
				: this.nextTurnSeatId(room, state.dealerSeatId) ?? state.dealerSeatId;
		state.currentTurnSeatId = next;
		state.actionTimerDeadline = new Date(
			Date.now() + this.turnTimeoutSec * 1000,
		).toISOString();
	}

	applyPlayerAction(params: {
		roomId: string;
		actorUserId?: string;
		actorSeatId?: number;
		action: ActionType;
		amount?: number;
		isAutoTimeout?: boolean;
	}): RoomRecord {
		const room = this.getRoomWithGame(params.roomId);
		const state = room.gameState!;

		if (room.status !== RoomStatus.IN_HAND) {
			throw new BadRequestException('현재 핸드 액션을 처리할 수 없는 상태입니다.');
		}

		let actingSeat = null as RoomRecord['seats'][number] | null;
		if (typeof params.actorSeatId === 'number') {
			actingSeat = room.seats.find((seat) => seat.seatId === params.actorSeatId) ?? null;
		} else if (params.actorUserId) {
			actingSeat = room.seats.find(
				(seat) => seat.participant?.userId === params.actorUserId,
			) ?? null;
		}
		if (!actingSeat?.participant) {
			throw new BadRequestException('현재 룸에 착석 중인 플레이어가 아닙니다.');
		}

		const actor = actingSeat.participant;
		if (state.currentTurnSeatId !== actor.seatId) {
			throw new BadRequestException('현재 턴 플레이어가 아닙니다.');
		}
		if (actor.sittingOut || actor.folded || actor.allIn) {
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

		if (actor.roleType === ParticipantType.HUMAN) {
			if (params.isAutoTimeout) {
				actor.timeoutStrikeCount = (actor.timeoutStrikeCount ?? 0) + 1;
			} else {
				actor.timeoutStrikeCount = 0;
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
			this.completeHand(room, [remaining[0]]);
			return room;
		}

		if (this.shouldStartAllInRunout(room)) {
			this.beginAllInRunout(room);
			this.markDirty();
			return room;
		}

		if (this.isStreetDone(room)) {
			this.moveStreet(room);
			this.markDirty();
			return room;
		}

		const nextSeatId = this.nextTurnSeatId(room, actor.seatId);
		state.currentTurnSeatId = nextSeatId;
		state.actionTimerDeadline = nextSeatId
			? new Date(Date.now() + this.turnTimeoutSec * 1000).toISOString()
			: null;
		this.markDirty();

		return room;
	}

	syncTimer(roomId: string): { remainingMs: number; currentTurnSeatId: number | null } {
		const room = this.ensureRoom(roomId);
		if (!room.gameState) {
			return {
				remainingMs: 0,
				currentTurnSeatId: null,
			};
		}

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
		if (!this.processPendingJoins(room)) {
			this.setReadyState(room);
		}
		this.markDirty();
		return room;
	}

	listHandReviews(userId: string): HandReviewRecord[] {
		return Array.from(this.handReviews.values())
			.filter((review) => review.participantIds.includes(userId))
			.map((review) => ({
				...review,
				analyses: review.analyses ?? [],
				favoriteUserIds: review.favoriteUserIds ?? [],
				analyzeJob: review.analyzeJob,
			}));
	}

	listFavoriteHandReviews(userId: string): HandReviewRecord[] {
		return this.listHandReviews(userId).filter((review) =>
			(review.favoriteUserIds ?? []).includes(userId),
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
		return {
			...review,
			analyses: review.analyses ?? [],
			favoriteUserIds: review.favoriteUserIds ?? [],
			analyzeJob: review.analyzeJob,
		};
	}

	setHandReviewFavorite(handId: string, userId: string, favorite: boolean): HandReviewRecord {
		const review = this.handReviews.get(handId);
		if (!review) {
			throw new NotFoundException('핸드 리뷰를 찾을 수 없습니다.');
		}
		if (!review.participantIds.includes(userId)) {
			throw new BadRequestException('해당 핸드에 대한 접근 권한이 없습니다.');
		}

		const current = new Set(review.favoriteUserIds ?? []);
		if (favorite) {
			current.add(userId);
		} else {
			current.delete(userId);
		}

		review.favoriteUserIds = Array.from(current);
		this.handReviews.set(handId, review);
		this.markDirty();
		return review;
	}

	addHandActionAnalysis(params: {
		handId: string;
		userId: string;
		actionOrder: number;
		provider: LlmProvider;
		model: string;
		analysis: string;
		evBb?: number;
		heroEquity?: number;
		gtoMix?: GtoActionMix;
	}): HandActionAnalysis {
		const review = this.handReviews.get(params.handId);
		if (!review) {
			throw new NotFoundException('핸드 리뷰를 찾을 수 없습니다.');
		}
		if (!review.participantIds.includes(params.userId)) {
			throw new BadRequestException('해당 핸드에 대한 접근 권한이 없습니다.');
		}

		const targetAction = review.actions.find(
			(action) => action.order === params.actionOrder,
		);
		if (!targetAction) {
			throw new NotFoundException('분석할 액션 로그를 찾을 수 없습니다.');
		}

		const record: HandActionAnalysis = {
			id: randomUUID(),
			handId: params.handId,
			actionOrder: targetAction.order,
			seatId: targetAction.seatId,
			playerId: targetAction.playerId,
			street: targetAction.street,
			provider: params.provider,
			model: params.model,
			analysis: params.analysis,
			evBb: params.evBb,
			heroEquity: params.heroEquity,
			gtoMix: params.gtoMix,
			createdByUserId: params.userId,
			createdAt: new Date().toISOString(),
		};

		const analyses = review.analyses ?? [];
		analyses.push(record);
		review.analyses = analyses;
		this.handReviews.set(params.handId, review);
		this.markDirty();
		return record;
	}

	getHandReviewAnalyzeJob(handId: string, userId: string): HandReviewAnalyzeJob | null {
		const review = this.getHandReview(handId, userId);
		return review.analyzeJob ?? null;
	}

	setHandReviewAnalyzeJob(params: {
		handId: string;
		userId: string;
		job: HandReviewAnalyzeJob;
	}): HandReviewRecord {
		const review = this.handReviews.get(params.handId);
		if (!review) {
			throw new NotFoundException('핸드 리뷰를 찾을 수 없습니다.');
		}
		if (!review.participantIds.includes(params.userId)) {
			throw new BadRequestException('해당 핸드에 대한 접근 권한이 없습니다.');
		}

		review.analyzeJob = params.job;
		this.handReviews.set(params.handId, review);
		this.markDirty();
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

		const labels: PositionLabel[] = ['BTN', 'SB', 'BB'];
		for (let idx = 3; idx < count; idx += 1) {
			const utgOffset = idx - 3;
			if (utgOffset === 0) {
				labels.push('UTG');
			} else if (utgOffset === 1) {
				labels.push('UTG+1');
			} else if (utgOffset === 2) {
				labels.push('UTG+2');
			} else if (utgOffset === 3) {
				labels.push('UTG+3');
			} else if (utgOffset === 4) {
				labels.push('UTG+4');
			} else {
				labels.push('UTG+5');
			}
		}

		return labels;
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
			map[seatId] = labels[idx] ?? 'UTG';
		});
		return map;
	}

	private createInitialGameState(room: RoomRecord, seatedSeatIds: number[]): GameState {
		const deck = this.createDeck();
		const sorted = [...seatedSeatIds].sort((a, b) => a - b);

		const prevDealer = room.lastDealerSeatId ?? room.gameState?.dealerSeatId;
		const dealerSeatId = prevDealer
			? this.nextSeatFromList(sorted, prevDealer)
			: sorted[0];
		room.lastDealerSeatId = dealerSeatId;

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
			runoutMode: false,
			runoutNextAtMs: 0,
			winnerPlayerIds: [],
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
				pendingJoins: [],
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
					timeoutStrikeCount: 0,
					sittingOut: false,
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
		this.markDirty();
	}
}
