import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	ParseIntPipe,
	Patch,
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
import { RoomsService } from './rooms.service';
import { AddBotDto } from './dto/add-bot.dto';
import { CreateRoomDto } from './dto/create-room.dto';
import { JoinRoomByCodeDto } from './dto/join-room-by-code.dto';
import { UpdateBotDto } from './dto/update-bot.dto';

@ApiTags('rooms')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('rooms')
export class RoomsController {
	constructor(private readonly roomsService: RoomsService) {}

	@Post()
	@ApiOperation({ summary: '룸 생성 (최초 비공개, 자동 시작 금지)' })
	createRoom(@CurrentUser() user: JwtUserPayload, @Body() dto: CreateRoomDto) {
		return this.roomsService.createRoom(user, dto);
	}

	@Get(':roomId')
	@ApiOperation({ summary: '룸 상세 조회' })
	getRoom(@Param('roomId') roomId: string) {
		return this.roomsService.getRoom(roomId);
	}

	@Post('join/code')
	@ApiOperation({ summary: '룸 코드로 입장' })
	joinByCode(@CurrentUser() user: JwtUserPayload, @Body() dto: JoinRoomByCodeDto) {
		return this.roomsService.joinByCode(user, dto);
	}

	@Post(':roomId/join-public')
	@ApiOperation({ summary: '공개 룸 입장' })
	joinPublic(@CurrentUser() user: JwtUserPayload, @Param('roomId') roomId: string) {
		return this.roomsService.joinPublicRoom(user, roomId);
	}

	@Post(':roomId/convert-public')
	@ApiOperation({ summary: '비공개 룸을 공개로 전환 (1회성)' })
	convertPublic(
		@CurrentUser() user: JwtUserPayload,
		@Param('roomId') roomId: string,
	) {
		return this.roomsService.convertToPublic(user, roomId);
	}

	@Post(':roomId/start-game')
	@ApiOperation({ summary: 'START GAME 수동 실행' })
	startGame(@CurrentUser() user: JwtUserPayload, @Param('roomId') roomId: string) {
		return this.roomsService.startGame(user, roomId);
	}

	@Post(':roomId/leave-room')
	@ApiOperation({ summary: '현재 룸에서 이탈' })
	leaveRoom(@CurrentUser() user: JwtUserPayload, @Param('roomId') roomId: string) {
		return this.roomsService.leaveRoom(user, roomId);
	}

	@Post(':roomId/close')
	@ApiOperation({ summary: '룸 종료' })
	closeRoom(@CurrentUser() user: JwtUserPayload, @Param('roomId') roomId: string) {
		return this.roomsService.closeRoom(user, roomId);
	}

	@Post(':roomId/seats/:seatId/take')
	@ApiOperation({ summary: '좌석 착석' })
	takeSeat(
		@CurrentUser() user: JwtUserPayload,
		@Param('roomId') roomId: string,
		@Param('seatId', ParseIntPipe) seatId: number,
	) {
		return this.roomsService.takeSeat(user, roomId, seatId);
	}

	@Post(':roomId/seats/:seatId/leave')
	@ApiOperation({ summary: '좌석 이탈' })
	leaveSeat(
		@CurrentUser() user: JwtUserPayload,
		@Param('roomId') roomId: string,
		@Param('seatId', ParseIntPipe) seatId: number,
	) {
		return this.roomsService.leaveSeat(user, roomId, seatId);
	}

	@Post(':roomId/seats/:seatId/bot')
	@ApiOperation({ summary: '빈 좌석에 봇 추가' })
	addBot(
		@CurrentUser() user: JwtUserPayload,
		@Param('roomId') roomId: string,
		@Param('seatId', ParseIntPipe) seatId: number,
		@Body() dto: AddBotDto,
	) {
		return this.roomsService.addBot(user, roomId, seatId, dto);
	}

	@Patch(':roomId/seats/:seatId/bot')
	@ApiOperation({ summary: '봇 설정 업데이트' })
	updateBot(
		@CurrentUser() user: JwtUserPayload,
		@Param('roomId') roomId: string,
		@Param('seatId', ParseIntPipe) seatId: number,
		@Body() dto: UpdateBotDto,
	) {
		return this.roomsService.updateBot(user, roomId, seatId, dto);
	}

	@Delete(':roomId/seats/:seatId/bot')
	@ApiOperation({ summary: '봇 제거' })
	removeBot(
		@CurrentUser() user: JwtUserPayload,
		@Param('roomId') roomId: string,
		@Param('seatId', ParseIntPipe) seatId: number,
	) {
		return this.roomsService.removeBot(user, roomId, seatId);
	}
}
