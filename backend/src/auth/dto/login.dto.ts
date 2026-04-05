import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'player@aipot.gg' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Password!123' })
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  password: string;
}
