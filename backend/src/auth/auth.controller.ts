import {
	Body,
	Controller,
	Get,
	HttpCode,
	HttpStatus,
	Post,
	UseGuards,
} from '@nestjs/common';
import {
	ApiBearerAuth,
	ApiOperation,
	ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtUserPayload } from '../common/domain.types';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { GuestSessionDto } from './dto/guest-session.dto';
import { SignInDto } from './dto/sign-in.dto';
import { SignUpDto } from './dto/sign-up.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
	constructor(private readonly authService: AuthService) {}

	@Post('sign-up')
	@ApiOperation({ summary: '회원가입' })
	async signUp(@Body() dto: SignUpDto) {
		return this.authService.signUp(dto);
	}

	@Post('sign-in')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'ID(닉네임)+비밀번호 로그인' })
	async signIn(@Body() dto: SignInDto) {
		return this.authService.signIn(dto);
	}

	@Post('guest-session')
	@ApiOperation({ summary: '게스트 세션 생성' })
	createGuestSession(@Body() dto: GuestSessionDto) {
		return this.authService.createGuestSession(dto);
	}

	@Post('sign-out')
	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth()
	@ApiOperation({ summary: '로그아웃 (JWT 무효화는 클라이언트에서 토큰 폐기)' })
	signOut() {
		return this.authService.signOut();
	}

	@Get('me')
	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth()
	@ApiOperation({ summary: '현재 로그인 사용자 조회' })
	me(@CurrentUser() user: JwtUserPayload) {
		return this.authService.getMe(user);
	}

	@Post('change-password')
	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth()
	@ApiOperation({ summary: '비밀번호 변경' })
	async changePassword(
		@CurrentUser() user: JwtUserPayload,
		@Body() dto: ChangePasswordDto,
	) {
		return this.authService.changePassword(user.sub, dto);
	}
}
