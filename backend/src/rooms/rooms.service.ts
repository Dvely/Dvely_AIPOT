import {
	BadRequestException,
	ForbiddenException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { JwtUserPayload } from '../common/domain.types';
import { UserRole } from '../common/enums/role.enum';
import {
	LlmProvider,
	RoomType,
	BotModelTier,
	RoomStatus,
} from '../common/enums/room.enum';
import { StoreService } from '../store/store.service';
import { UsersService } from '../users/users.service';
import { AddBotDto } from './dto/add-bot.dto';
import { CreateRoomDto } from './dto/create-room.dto';
import { JoinRoomByCodeDto } from './dto/join-room-by-code.dto';
import { UpdateRoomBlindsDto } from './dto/update-room-blinds.dto';
import { UpdateBotDto } from './dto/update-bot.dto';

@Injectable()
export class RoomsService {
	constructor(
		private readonly store: StoreService,
		private readonly usersService: UsersService,
	) {}

	private getUserProfile(user: JwtUserPayload) {
		if (user.guest) {
			return { displayName: user.nickname, avatar: null, stackAmount: 1000 };
		}

		const account = this.usersService.findById(user.sub);
		if (!account) {
			throw new NotFoundException('사용자 계정을 찾을 수 없습니다.');
		}

		return {
			displayName: account.nickname,
			avatar: account.avatar,
			stackAmount: account.balanceAmount,
		};
	}

	createRoom(user: JwtUserPayload, dto: CreateRoomDto) {
		if (user.role === UserRole.GUEST) {
			throw new ForbiddenException('Guest는 Create Table을 사용할 수 없습니다.');
		}

		const profile = this.getUserProfile(user);

		return this.store.createRoom({
			name: dto.name,
			type: dto.type,
			maxSeats: dto.maxSeats,
			blindSmall: dto.blindSmall,
			blindBig: dto.blindBig,
			hostUserId: user.sub,
			hostDisplayName: profile.displayName,
			hostAvatar: profile.avatar,
			hostStackAmount: profile.stackAmount,
		});
	}

	getRoom(user: JwtUserPayload, roomId: string) {
		this.store.autoResolveTimeout(roomId);
		const room = this.store.getRoomDetail(roomId);
		const isHost = room.hostUserId === user.sub;
		const isAlreadySeated = room.seats.some(
			(seat) => seat.participant?.userId === user.sub,
		);
		const participantCount = room.seats.filter((seat) => seat.participant).length;
		const isSeatableStatus =
			room.status === RoomStatus.WAITING_SETUP ||
			room.status === RoomStatus.READY ||
			room.status === RoomStatus.HAND_ENDED;
		const createdAtMs = Date.parse(room.createdAt);
		const isFreshPrivateRoom =
			Number.isFinite(createdAtMs) && Date.now() - createdAtMs < 5 * 60 * 1000;
		const shouldRecoverHostSeat =
			isFreshPrivateRoom &&
			room.status === RoomStatus.WAITING_SETUP &&
			participantCount === 0;

		if (
			!isHost ||
			isAlreadySeated ||
			!room.isPrivate ||
			!isSeatableStatus ||
			!shouldRecoverHostSeat
		) {
			return room;
		}

		const profile = this.getUserProfile(user);
		try {
			const preferredSeat = room.seats.find(
				(seat) => seat.seatId === 1 && !seat.participant,
			);
			if (preferredSeat) {
				return this.store.takeSeat({
					roomId,
					seatId: 1,
					userId: user.sub,
					displayName: profile.displayName,
					avatar: profile.avatar,
					stackAmount: profile.stackAmount,
				});
			}

			return this.store.joinRoomFirstEmptySeat({
				roomId,
				userId: user.sub,
				displayName: profile.displayName,
				avatar: profile.avatar,
				stackAmount: profile.stackAmount,
			});
		} catch {
			return this.store.getRoomDetail(roomId);
		}
	}

	joinByCode(user: JwtUserPayload, dto: JoinRoomByCodeDto) {
		const room = this.store.findRoomByCode(dto.code);
		if (user.role === UserRole.GUEST && room.type === RoomType.TOURNAMENT) {
			throw new ForbiddenException('Guest는 Tournament 참가가 불가합니다.');
		}

		const profile = this.getUserProfile(user);
		return this.store.joinRoomFirstEmptySeat({
			roomId: room.id,
			userId: user.sub,
			displayName: profile.displayName,
			avatar: profile.avatar,
			stackAmount: profile.stackAmount,
		});
	}

	joinPublicRoom(user: JwtUserPayload, roomId: string) {
		const room = this.store.getRoomDetail(roomId);
		if (room.isPrivate) {
			throw new BadRequestException('비공개 룸은 코드 입장만 가능합니다.');
		}
		if (user.role === UserRole.GUEST && room.type === RoomType.TOURNAMENT) {
			throw new ForbiddenException('Guest는 Tournament 참가가 불가합니다.');
		}

		const profile = this.getUserProfile(user);
		return this.store.joinRoomFirstEmptySeat({
			roomId,
			userId: user.sub,
			displayName: profile.displayName,
			avatar: profile.avatar,
			stackAmount: profile.stackAmount,
		});
	}

	convertToPublic(user: JwtUserPayload, roomId: string) {
		return this.store.convertPrivateToPublic(roomId, user.sub);
	}

	startGame(user: JwtUserPayload, roomId: string) {
		return this.store.startGame(roomId, user.sub);
	}

	leaveRoom(user: JwtUserPayload, roomId: string) {
		const room = this.store.getRoomDetail(roomId);
		const seated = room.seats.find((seat) => seat.participant?.userId === user.sub);
		if (!seated) return room;
		return this.store.leaveSeat(roomId, seated.seatId, user.sub);
	}

	closeRoom(user: JwtUserPayload, roomId: string) {
		return this.store.closeRoom(roomId, user.sub);
	}

	takeSeat(user: JwtUserPayload, roomId: string, seatId: number) {
		const room = this.store.getRoomDetail(roomId);
		if (user.role === UserRole.GUEST && room.type === RoomType.TOURNAMENT) {
			throw new ForbiddenException('Guest는 Tournament 참가가 불가합니다.');
		}
		const profile = this.getUserProfile(user);
		return this.store.takeSeat({
			roomId,
			seatId,
			userId: user.sub,
			displayName: profile.displayName,
			avatar: profile.avatar,
			stackAmount: profile.stackAmount,
		});
	}

	leaveSeat(user: JwtUserPayload, roomId: string, seatId: number) {
		return this.store.leaveSeat(roomId, seatId, user.sub);
	}

	addBot(user: JwtUserPayload, roomId: string, seatId: number, dto: AddBotDto) {
		if (dto.modelTier === 'paid' && user.role !== UserRole.PRO) {
			throw new ForbiddenException('PRO 권한만 유료 AI 모델을 사용할 수 있습니다.');
		}
		return this.store.addBot({
			roomId,
			seatId,
			actorUserId: user.sub,
			config: {
				modelTier: dto.modelTier,
				provider: dto.provider,
				style: dto.style,
				model: dto.model,
			},
		});
	}

	updateBot(user: JwtUserPayload, roomId: string, seatId: number, dto: UpdateBotDto) {
		const room = this.store.getRoomDetail(roomId);
		const currentBot = room.seats.find((seat) => seat.seatId === seatId)?.participant?.botConfig;
		const nextModelTier =
			dto.modelTier ?? currentBot?.modelTier ?? BotModelTier.FREE;
		if (nextModelTier === 'paid' && user.role !== UserRole.PRO) {
			throw new ForbiddenException('PRO 권한만 유료 AI 모델을 사용할 수 있습니다.');
		}

		return this.store.updateBotConfig({
			roomId,
			seatId,
			actorUserId: user.sub,
			config: {
				modelTier: nextModelTier,
				provider: dto.provider ?? currentBot?.provider ?? LlmProvider.LOCAL,
				style: dto.style ?? currentBot?.style ?? 'balanced',
				model: dto.model ?? currentBot?.model,
			},
		});
	}

	removeBot(user: JwtUserPayload, roomId: string, seatId: number) {
		return this.store.removeBot(roomId, seatId, user.sub);
	}

	updateBlinds(user: JwtUserPayload, roomId: string, dto: UpdateRoomBlindsDto) {
		return this.store.updateRoomBlinds({
			roomId,
			actorUserId: user.sub,
			blindSmall: dto.blindSmall,
			blindBig: dto.blindBig,
		});
	}
}
