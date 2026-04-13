import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class CreateFriendRequestDto {
	@ApiProperty({ example: 'target_user' })
	@IsString()
	@MinLength(2)
	targetNickname!: string;
}
