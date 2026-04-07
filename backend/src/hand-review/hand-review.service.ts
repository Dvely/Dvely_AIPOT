import { Injectable } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { JwtUserPayload } from '../common/domain.types';
import { UserRole } from '../common/enums/role.enum';
import { StoreService } from '../store/store.service';
import { UsersService } from '../users/users.service';
import { AnalyzeHandDto } from './dto/analyze-hand.dto';

@Injectable()
export class HandReviewService {
	constructor(
		private readonly store: StoreService,
		private readonly aiService: AiService,
		private readonly usersService: UsersService,
	) {}

	private assertCanRead(user: JwtUserPayload) {
		if (user.guest || user.role === UserRole.GUEST) {
			throw new ForbiddenException('Guest는 Hand Review를 사용할 수 없습니다.');
		}

		const account = this.usersService.findById(user.sub);
		if (!account || account.role !== UserRole.PRO) {
			throw new ForbiddenException('Hand Review는 PRO 권한이 필요합니다.');
		}
	}

	listHands(user: JwtUserPayload) {
		this.assertCanRead(user);
		return this.store.listHandReviews(user.sub);
	}

	getHand(user: JwtUserPayload, handId: string) {
		this.assertCanRead(user);
		return this.store.getHandReview(handId, user.sub);
	}

	async analyze(user: JwtUserPayload, handId: string, dto: AnalyzeHandDto) {
		this.assertCanRead(user);

		const hand = this.store.getHandReview(handId, user.sub);

		return this.aiService.analyzeHandReview({
			handId,
			handContext: hand,
			provider: dto.provider,
			model: dto.model,
			includePremiumAnalysis: dto.includePremiumAnalysis ?? true,
		});
	}
}
