import { Injectable } from '@nestjs/common';
import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { compare, hash } from 'bcrypt';
import { ChangePasswordDto } from '../auth/dto/change-password.dto';
import { JwtUserPayload } from '../common/domain.types';
import { UsersService } from '../users/users.service';
import { UpdateAvatarDto } from './dto/update-avatar.dto';

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
}
