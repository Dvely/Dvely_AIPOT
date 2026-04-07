import {
	Injectable,
	NotFoundException,
	UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { GuestSessionDto } from './dto/guest-session.dto';
import { SignInDto } from './dto/sign-in.dto';
import { SignUpDto } from './dto/sign-up.dto';
import { JwtUserPayload, UserRecord } from '../common/domain.types';
import { UserRole } from '../common/enums/role.enum';
import { UsersService } from '../users/users.service';

export interface AuthResult {
	accessToken: string;
	tokenType: 'Bearer';
	user: {
		id: string;
		nickname: string;
		role: UserRole;
		guest: boolean;
		balanceAmount: number;
	};
}

@Injectable()
export class AuthService {
	constructor(
		private readonly usersService: UsersService,
		private readonly jwtService: JwtService,
	) {
		this.seedDefaultUsers().catch(() => {
			// no-op
		});
	}

	private async seedDefaultUsers() {
		const freeUser = this.usersService.findByNickname('free_user');
		if (!freeUser) {
			this.usersService.createUser({
				nickname: 'free_user',
				passwordHash: await hash('free1234', 10),
				role: UserRole.FREE,
			});
		}

		const proUser = this.usersService.findByNickname('pro_user');
		if (!proUser) {
			this.usersService.createUser({
				nickname: 'pro_user',
				passwordHash: await hash('pro1234', 10),
				role: UserRole.PRO,
			});
		}
	}

	private buildPayload(user: Pick<UserRecord, 'id' | 'nickname' | 'role'>): JwtUserPayload {
		return {
			sub: user.id,
			role: user.role,
			nickname: user.nickname,
			guest: user.role === UserRole.GUEST,
		};
	}

	private signPayload(payload: JwtUserPayload): string {
		return this.jwtService.sign(payload);
	}

	private toAuthResult(payload: JwtUserPayload, balanceAmount: number): AuthResult {
		return {
			accessToken: this.signPayload(payload),
			tokenType: 'Bearer',
			user: {
				id: payload.sub,
				nickname: payload.nickname,
				role: payload.role,
				guest: payload.guest,
				balanceAmount,
			},
		};
	}

	async signUp(dto: SignUpDto): Promise<AuthResult> {
		const newUser = this.usersService.createUser({
			nickname: dto.nickname,
			passwordHash: await hash(dto.password, 10),
			role: UserRole.FREE,
		});

		return this.toAuthResult(this.buildPayload(newUser), newUser.balanceAmount);
	}

	async signIn(dto: SignInDto): Promise<AuthResult> {
		const user = this.usersService.findByNickname(dto.nickname);
		if (!user) {
			throw new UnauthorizedException('아이디 또는 비밀번호가 올바르지 않습니다.');
		}

		const valid = await compare(dto.password, user.passwordHash);
		if (!valid) {
			throw new UnauthorizedException('아이디 또는 비밀번호가 올바르지 않습니다.');
		}

		return this.toAuthResult(this.buildPayload(user), user.balanceAmount);
	}

	createGuestSession(dto: GuestSessionDto): AuthResult {
		const nickname = dto.displayName ?? `Guest_${Math.floor(Math.random() * 10000)}`;
		const guestPayload: JwtUserPayload = {
			sub: `guest-${randomUUID()}`,
			role: UserRole.GUEST,
			nickname,
			guest: true,
		};

		return this.toAuthResult(guestPayload, 1000);
	}

	getMe(payload: JwtUserPayload) {
		if (payload.guest) {
			return {
				id: payload.sub,
				nickname: payload.nickname,
				role: payload.role,
				guest: true,
				balanceAmount: 1000,
			};
		}

		const user = this.usersService.findById(payload.sub);
		if (!user) {
			throw new NotFoundException('사용자를 찾을 수 없습니다.');
		}

		return {
			id: user.id,
			nickname: user.nickname,
			role: user.role,
			guest: false,
			balanceAmount: user.balanceAmount,
			avatar: user.avatar,
			stats: user.stats,
			subscriptionActive: user.subscriptionActive,
		};
	}

	async changePassword(userId: string, dto: ChangePasswordDto) {
		const user = this.usersService.findById(userId);
		if (!user) {
			throw new NotFoundException('사용자를 찾을 수 없습니다.');
		}

		const valid = await compare(dto.currentPassword, user.passwordHash);
		if (!valid) {
			throw new UnauthorizedException('현재 비밀번호가 일치하지 않습니다.');
		}

		const newHash = await hash(dto.newPassword, 10);
		this.usersService.updatePassword(userId, newHash);
		return { success: true };
	}

	signOut() {
		return { success: true };
	}
}
