import { Injectable } from '@nestjs/common';
import { AvatarConfig, UserRecord } from '../common/domain.types';
import { PreferredLanguage } from '../common/enums/language.enum';
import { UserRole } from '../common/enums/role.enum';
import { StoreService } from '../store/store.service';

@Injectable()
export class UsersService {
	constructor(private readonly store: StoreService) {}

	findByNickname(nickname: string): UserRecord | null {
		return this.store.findUserByNickname(nickname);
	}

	findById(userId: string): UserRecord | null {
		return this.store.findUserById(userId);
	}

	createUser(params: {
		nickname: string;
		passwordHash: string;
		role?: UserRole;
	}): UserRecord {
		return this.store.createUser({
			nickname: params.nickname,
			passwordHash: params.passwordHash,
			role: params.role ?? UserRole.FREE,
		});
	}

	updatePassword(userId: string, passwordHash: string): UserRecord {
		return this.store.updateUserPassword(userId, passwordHash);
	}

	updateAvatar(userId: string, avatar: AvatarConfig): UserRecord {
		return this.store.updateUserAvatar(userId, avatar);
	}

	updatePreferredLanguage(
		userId: string,
		preferredLanguage: PreferredLanguage,
	): UserRecord {
		return this.store.updateUserPreferredLanguage(userId, preferredLanguage);
	}

	addBalance(userId: string, amount: number): UserRecord {
		return this.store.addUserBalance(userId, amount);
	}

	upgradeToPro(userId: string): UserRecord {
		return this.store.upgradeUserToPro(userId);
	}
}
