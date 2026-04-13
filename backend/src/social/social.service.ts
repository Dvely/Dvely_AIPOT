import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { JwtUserPayload } from '../common/domain.types';
import { StoreService } from '../store/store.service';
import { UsersService } from '../users/users.service';
import { CreateFriendRequestDto } from './dto/create-friend-request.dto';
import { SendRoomInviteDto } from './dto/send-room-invite.dto';

@Injectable()
export class SocialService {
  constructor(
    private readonly store: StoreService,
    private readonly usersService: UsersService,
  ) {}

  private ensureAccountUser(user: JwtUserPayload) {
    if (user.guest) {
      throw new ForbiddenException('Guest는 소셜 기능을 사용할 수 없습니다.');
    }

    const account = this.usersService.findById(user.sub);
    if (!account) {
      throw new NotFoundException('사용자 계정을 찾을 수 없습니다.');
    }

    return account;
  }

  searchUsers(user: JwtUserPayload, query: string) {
    this.ensureAccountUser(user);
    return this.store.searchUsersByNickname(query, user.sub);
  }

  listFriends(user: JwtUserPayload) {
    this.ensureAccountUser(user);
    return this.store.listFriends(user.sub);
  }

  listFriendRequests(user: JwtUserPayload) {
    this.ensureAccountUser(user);
    return {
      incoming: this.store.listIncomingFriendRequests(user.sub),
      outgoing: this.store.listOutgoingFriendRequests(user.sub),
    };
  }

  sendFriendRequest(user: JwtUserPayload, dto: CreateFriendRequestDto) {
    this.ensureAccountUser(user);
    return this.store.createFriendRequestByNickname(
      user.sub,
      dto.targetNickname,
    );
  }

  acceptFriendRequest(user: JwtUserPayload, requestId: string) {
    this.ensureAccountUser(user);
    return this.store.respondFriendRequest(user.sub, requestId, true);
  }

  declineFriendRequest(user: JwtUserPayload, requestId: string) {
    this.ensureAccountUser(user);
    return this.store.respondFriendRequest(user.sub, requestId, false);
  }

  listRoomInvites(user: JwtUserPayload) {
    this.ensureAccountUser(user);
    return this.store.listRoomInvites(user.sub);
  }

  sendRoomInvite(user: JwtUserPayload, dto: SendRoomInviteDto) {
    this.ensureAccountUser(user);
    return this.store.sendRoomInvite(user.sub, dto.roomId, dto.inviteeUserId);
  }

  acceptRoomInvite(user: JwtUserPayload, inviteId: string) {
    this.ensureAccountUser(user);
    return this.store.respondRoomInvite(user.sub, inviteId, true);
  }

  declineRoomInvite(user: JwtUserPayload, inviteId: string) {
    this.ensureAccountUser(user);
    return this.store.respondRoomInvite(user.sub, inviteId, false);
  }
}
