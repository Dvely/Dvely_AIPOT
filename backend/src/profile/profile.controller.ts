import {
	Body,
	Controller,
	Get,
	Patch,
	Post,
	UseGuards,
} from '@nestjs/common';
import {
	ApiBearerAuth,
	ApiOperation,
	ApiTags,
} from '@nestjs/swagger';
import { ChangePasswordDto } from '../auth/dto/change-password.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtUserPayload } from '../common/domain.types';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { BuyChipsDto } from './dto/buy-chips.dto';
import { SubscribeProDto } from './dto/subscribe-pro.dto';
import { UpdateAvatarDto } from './dto/update-avatar.dto';
import { ProfileService } from './profile.service';

@ApiTags('profile')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('profile')
export class ProfileController {
	constructor(private readonly profileService: ProfileService) {}

	@Get('me')
	@ApiOperation({ summary: '프로필 조회' })
	profile(@CurrentUser() user: JwtUserPayload) {
		return this.profileService.getProfile(user);
	}

	@Get('stats')
	@ApiOperation({ summary: '전적/통계 조회' })
	stats(@CurrentUser() user: JwtUserPayload) {
		return this.profileService.getStats(user);
	}

	@Patch('avatar')
	@ApiOperation({ summary: '아바타 조합형 설정 업데이트' })
	updateAvatar(@CurrentUser() user: JwtUserPayload, @Body() dto: UpdateAvatarDto) {
		return this.profileService.updateAvatar(user, dto);
	}

	@Post('password')
	@ApiOperation({ summary: '비밀번호 변경 (Settings 탭용)' })
	updatePassword(
		@CurrentUser() user: JwtUserPayload,
		@Body() dto: ChangePasswordDto,
	) {
		return this.profileService.updatePassword(user, dto);
	}

	@Post('store/chips')
	@ApiOperation({ summary: '가상결제로 칩 구매' })
	buyChips(@CurrentUser() user: JwtUserPayload, @Body() dto: BuyChipsDto) {
		return this.profileService.buyChips(user, dto);
	}

	@Post('store/subscribe-pro')
	@ApiOperation({ summary: '가상결제로 PRO 구독' })
	subscribePro(
		@CurrentUser() user: JwtUserPayload,
		@Body() dto: SubscribeProDto,
	) {
		return this.profileService.subscribePro(user, dto);
	}
}
