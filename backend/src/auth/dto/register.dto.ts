import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'player@aipot.gg' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'AIPOT Learner' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  nickname: string;

  @ApiProperty({ example: 'Password!123' })
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  password: string;
}
