import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
	ApiBearerAuth,
	ApiOperation,
	ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtUserPayload } from '../common/domain.types';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { GameService } from './game.service';
import { ActDto } from './dto/act.dto';

@ApiTags('game')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('game')
export class GameController {
	constructor(private readonly gameService: GameService) {}

	@Get('rooms/:roomId/state')
	@ApiOperation({ summary: '게임 상태 구독용 스냅샷 조회' })
	getState(@CurrentUser() user: JwtUserPayload, @Param('roomId') roomId: string) {
		return this.gameService.getState(user, roomId);
	}

	@Post('rooms/:roomId/act')
	@ApiOperation({ summary: '플레이어 액션 처리(fold/check/call/bet/raise/all-in)' })
	act(
		@CurrentUser() user: JwtUserPayload,
		@Param('roomId') roomId: string,
		@Body() dto: ActDto,
	) {
		return this.gameService.act(user, roomId, dto);
	}

	@Get('rooms/:roomId/timer-sync')
	@ApiOperation({ summary: '액션 타이머 동기화' })
	timerSync(@Param('roomId') roomId: string) {
		return this.gameService.timerSync(roomId);
	}

	@Post('rooms/:roomId/next-hand')
	@ApiOperation({ summary: '다음 핸드 준비 (핸드 종료 후)' })
	nextHand(@CurrentUser() user: JwtUserPayload, @Param('roomId') roomId: string) {
		return this.gameService.nextHand(user, roomId);
	}
}
