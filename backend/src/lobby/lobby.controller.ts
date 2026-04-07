import {
	Body,
	Controller,
	Get,
	Post,
	Query,
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
import { LobbyService } from './lobby.service';
import { QuickPlayDto } from './dto/quick-play.dto';
import { TableListQueryDto } from './dto/table-list-query.dto';

@ApiTags('lobby')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('lobby')
export class LobbyController {
	constructor(private readonly lobbyService: LobbyService) {}

	@Get('tables')
	@ApiOperation({ summary: '로비 테이블 목록 조회 (AI/Cash/Tournament)' })
	tables(@CurrentUser() user: JwtUserPayload, @Query() query: TableListQueryDto) {
		return this.lobbyService.listTables(user, query.roomType);
	}

	@Get('tournaments')
	@ApiOperation({ summary: '라이브 토너먼트 목록 조회' })
	tournaments() {
		return this.lobbyService.listTournaments();
	}

	@Get('leaderboard')
	@ApiOperation({ summary: '리더보드 조회 (닉네임/보유 머니 순위)' })
	leaderboard() {
		return this.lobbyService.listLeaderboard();
	}

	@Post('quick-play')
	@ApiOperation({ summary: '퀵플레이 매칭' })
	quickPlay(@CurrentUser() user: JwtUserPayload, @Body() dto: QuickPlayDto) {
		return this.lobbyService.quickPlay(user, dto);
	}
}
