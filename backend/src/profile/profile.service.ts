import { Injectable } from '@nestjs/common';
import {
	BadRequestException,
	ForbiddenException,
	NotFoundException,
	UnauthorizedException,
} from '@nestjs/common';
import { compare, hash } from 'bcrypt';
import { ChangePasswordDto } from '../auth/dto/change-password.dto';
import { JwtUserPayload } from '../common/domain.types';
import { UserRole } from '../common/enums/role.enum';
import { UsersService } from '../users/users.service';
import { BuyChipsDto } from './dto/buy-chips.dto';
import { SubscribeProDto } from './dto/subscribe-pro.dto';
import { UpdateAvatarDto } from './dto/update-avatar.dto';

const CHIP_PACKAGES: Record<string, { chips: number; priceLabel: string }> = {
	'chips-50k': { chips: 50_000, priceLabel: '$4.99' },
	'chips-150k': { chips: 150_000, priceLabel: '$9.99' },
	'chips-500k': { chips: 500_000, priceLabel: '$19.99' },
	'chips-2000k': { chips: 2_000_000, priceLabel: '$49.99' },
};

@Injectable()
export class ProfileService {
	constructor(private readonly usersService: UsersService) {}

	private ensureAccountUser(user: JwtUserPayload) {
		if (user.guest) {
			throw new ForbiddenException('Guest는 저장형 프로필 기능을 사용할 수 없습니다.');
		}

		const account = this.usersService.findById(user.sub);
		if (!account) {
			throw new NotFoundException('사용자를 찾을 수 없습니다.');
		}
		return account;
	}

	getProfile(user: JwtUserPayload) {
		const account = this.ensureAccountUser(user);
		return {
			id: account.id,
			nickname: account.nickname,
			role: account.role,
			balanceAmount: account.balanceAmount,
			avatar: account.avatar,
			subscriptionActive: account.subscriptionActive,
			createdAt: account.createdAt,
		};
	}

	getStats(user: JwtUserPayload) {
		const account = this.ensureAccountUser(user);
		const winRate =
			account.stats.playedHands > 0
				? (account.stats.winHands / account.stats.playedHands) * 100
				: 0;

		return {
			...account.stats,
			winRate: Number(winRate.toFixed(2)),
		};
	}

	updateAvatar(user: JwtUserPayload, dto: UpdateAvatarDto) {
		this.ensureAccountUser(user);
		const updated = this.usersService.updateAvatar(user.sub, dto);
		return {
			id: updated.id,
			nickname: updated.nickname,
			avatar: updated.avatar,
		};
	}

	async updatePassword(user: JwtUserPayload, dto: ChangePasswordDto) {
		const account = this.ensureAccountUser(user);
		const valid = await compare(dto.currentPassword, account.passwordHash);
		if (!valid) {
			throw new UnauthorizedException('현재 비밀번호가 일치하지 않습니다.');
		}

		const nextHash = await hash(dto.newPassword, 10);
		this.usersService.updatePassword(account.id, nextHash);
		return { success: true };
	}

	buyChips(user: JwtUserPayload, dto: BuyChipsDto) {
		const account = this.ensureAccountUser(user);
		const pkg = CHIP_PACKAGES[dto.packageId];
		if (!pkg) {
			throw new BadRequestException('지원하지 않는 결제 패키지입니다.');
		}

		const updated = this.usersService.addBalance(account.id, pkg.chips);
		return {
			success: true,
			packageId: dto.packageId,
			addedAmount: pkg.chips,
			priceLabel: pkg.priceLabel,
			balanceAmount: updated.balanceAmount,
			role: updated.role,
			subscriptionActive: updated.subscriptionActive,
		};
	}

	subscribePro(user: JwtUserPayload, dto: SubscribeProDto) {
		const account = this.ensureAccountUser(user);
		if (account.role === UserRole.PRO) {
			return {
				success: true,
				alreadySubscribed: true,
				plan: dto.plan ?? 'monthly',
				role: account.role,
				subscriptionActive: account.subscriptionActive,
				balanceAmount: account.balanceAmount,
			};
		}

		const updated = this.usersService.upgradeToPro(account.id);
		return {
			success: true,
			alreadySubscribed: false,
			plan: dto.plan ?? 'monthly',
			role: updated.role,
			subscriptionActive: updated.subscriptionActive,
			balanceAmount: updated.balanceAmount,
		};
	}
}
