import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class SendRoomInviteDto {
	@ApiProperty({ example: 'room-id' })
	@IsString()
	@MinLength(1)
	roomId!: string;

	@ApiProperty({ example: 'invitee-user-id' })
	@IsString()
	@MinLength(1)
	inviteeUserId!: string;
}
