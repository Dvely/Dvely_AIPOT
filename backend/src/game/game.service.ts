import { Injectable } from '@nestjs/common';
import { JwtUserPayload } from '../common/domain.types';
import { RoomStatus } from '../common/enums/room.enum';
import { StoreService } from '../store/store.service';
import { ActDto } from './dto/act.dto';

@Injectable()
export class GameService {
	constructor(private readonly store: StoreService) {}

	getState(user: JwtUserPayload, roomId: string) {
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

	act(user: JwtUserPayload, roomId: string, dto: ActDto) {
		return this.store.applyPlayerAction({
			roomId,
			actorUserId: user.sub,
			action: dto.action,
			amount: dto.amount,
		});
	}

	timerSync(roomId: string) {
		this.store.autoResolveTimeout(roomId);
		return this.store.syncTimer(roomId);
	}

	nextHand(user: JwtUserPayload, roomId: string) {
		return this.store.prepareNextHand(roomId, user.sub);
	}
}
