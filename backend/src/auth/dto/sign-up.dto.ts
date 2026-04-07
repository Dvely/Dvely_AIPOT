import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';

export class SignUpDto {
  @ApiProperty({ example: 'player_one' })
  @IsString()
  @Length(3, 24)
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: '닉네임은 영문, 숫자, 언더스코어만 사용할 수 있습니다.',
  })
  nickname!: string;

  @ApiProperty({ example: 'aipot1234' })
  @IsString()
  @Length(4, 64)
  password!: string;
}
