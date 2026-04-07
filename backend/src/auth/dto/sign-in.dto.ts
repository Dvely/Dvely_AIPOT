import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class SignInDto {
  @ApiProperty({ example: 'player_one' })
  @IsString()
  @Length(3, 24)
  nickname!: string;

  @ApiProperty({ example: 'aipot1234' })
  @IsString()
  @Length(4, 64)
  password!: string;
}
