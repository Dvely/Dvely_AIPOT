import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtUserPayload } from '../common/domain.types';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CreateFriendRequestDto } from './dto/create-friend-request.dto';
import { SendRoomInviteDto } from './dto/send-room-invite.dto';
import { SocialService } from './social.service.js';

@ApiTags('social')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('social')
export class SocialController {
  constructor(private readonly socialService: SocialService) {}

  @Get('users')
  @ApiOperation({ summary: '닉네임으로 사용자 검색' })
  searchUsers(@CurrentUser() user: JwtUserPayload, @Query('q') query?: string) {
    return this.socialService.searchUsers(user, query?.trim() ?? '');
  }

  @Get('friends')
  @ApiOperation({ summary: '친구 목록 조회' })
  listFriends(@CurrentUser() user: JwtUserPayload) {
    return this.socialService.listFriends(user);
  }

  @Get('friend-requests')
  @ApiOperation({ summary: '친구 요청 목록 조회' })
  listFriendRequests(@CurrentUser() user: JwtUserPayload) {
    return this.socialService.listFriendRequests(user);
  }

  @Post('friend-requests')
  @ApiOperation({ summary: '친구 요청 보내기' })
  sendFriendRequest(
    @CurrentUser() user: JwtUserPayload,
    @Body() dto: CreateFriendRequestDto,
  ) {
    return this.socialService.sendFriendRequest(user, dto);
  }

  @Post('friend-requests/:requestId/accept')
  @ApiOperation({ summary: '친구 요청 수락' })
  acceptFriendRequest(
    @CurrentUser() user: JwtUserPayload,
    @Param('requestId') requestId: string,
  ) {
    return this.socialService.acceptFriendRequest(user, requestId);
  }

  @Post('friend-requests/:requestId/decline')
  @ApiOperation({ summary: '친구 요청 거절' })
  declineFriendRequest(
    @CurrentUser() user: JwtUserPayload,
    @Param('requestId') requestId: string,
  ) {
    return this.socialService.declineFriendRequest(user, requestId);
  }

  @Get('room-invites')
  @ApiOperation({ summary: '룸 초대 목록 조회' })
  listRoomInvites(@CurrentUser() user: JwtUserPayload) {
    return this.socialService.listRoomInvites(user);
  }

  @Post('room-invites')
  @ApiOperation({ summary: '비공개 룸 초대 보내기' })
  sendRoomInvite(
    @CurrentUser() user: JwtUserPayload,
    @Body() dto: SendRoomInviteDto,
  ) {
    return this.socialService.sendRoomInvite(user, dto);
  }

  @Post('room-invites/:inviteId/accept')
  @ApiOperation({ summary: '룸 초대 수락' })
  acceptRoomInvite(
    @CurrentUser() user: JwtUserPayload,
    @Param('inviteId') inviteId: string,
  ) {
    return this.socialService.acceptRoomInvite(user, inviteId);
  }

  @Post('room-invites/:inviteId/decline')
  @ApiOperation({ summary: '룸 초대 거절' })
  declineRoomInvite(
    @CurrentUser() user: JwtUserPayload,
    @Param('inviteId') inviteId: string,
  ) {
    return this.socialService.declineRoomInvite(user, inviteId);
  }
}
