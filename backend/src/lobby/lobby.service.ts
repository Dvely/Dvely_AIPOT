import { ForbiddenException, Injectable } from '@nestjs/common';
import { StoreService } from '../store/store.service';
import { RoomType } from '../common/enums/room.enum';
import { JwtUserPayload } from '../common/domain.types';
import { QuickPlayDto } from './dto/quick-play.dto';
import { UsersService } from '../users/users.service';

@Injectable()
export class LobbyService {
	constructor(
		private readonly store: StoreService,
		private readonly usersService: UsersService,
	) {}

	listTables(roomType?: RoomType) {
		return this.store.listRoomSummaries(roomType);
	}

	listTournaments() {
		return this.store.listRoomSummaries(RoomType.TOURNAMENT);
	}

	quickPlay(user: JwtUserPayload, dto: QuickPlayDto) {
		const targetType = dto.roomType ?? RoomType.AI_BOT;

		if (user.role === 'guest' && targetType === RoomType.TOURNAMENT) {
			throw new ForbiddenException('Guest는 Tournament에 참가할 수 없습니다.');
		}

		const candidate = this.store
			.listRoomSummaries(targetType)
			.find((summary) => summary.canJoin && !summary.isPrivate);

		if (!candidate) {
			return {
				matched: false,
				reason: '참가 가능한 공개 테이블이 없습니다.',
			};
		}

		const userEntity = user.guest ? null : this.usersService.findById(user.sub);
		this.store.joinRoomFirstEmptySeat({
			roomId: candidate.id,
			userId: user.sub,
			displayName: user.nickname,
			avatar: userEntity?.avatar ?? null,
			stackAmount: user.guest ? 1000 : (userEntity?.balanceAmount ?? 10000),
		});

		return {
			matched: true,
			roomId: candidate.id,
		};
	}
}
