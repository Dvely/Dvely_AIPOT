import { Injectable } from '@nestjs/common';
import { JwtUserPayload } from '../common/domain.types';
import { StoreService } from '../store/store.service';
import { ActDto } from './dto/act.dto';

@Injectable()
export class GameService {
	constructor(private readonly store: StoreService) {}

	getState(roomId: string) {
		const room = this.store.getRoomWithGame(roomId);
		return {
			roomId: room.id,
			roomStatus: room.status,
			seats: room.seats,
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
		return this.store.syncTimer(roomId);
	}

	nextHand(user: JwtUserPayload, roomId: string) {
		return this.store.prepareNextHand(roomId, user.sub);
	}
}
