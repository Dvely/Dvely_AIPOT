import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ example: 'oldPassword123' })
  @IsString()
  @Length(4, 64)
  currentPassword!: string;

  @ApiProperty({ example: 'newPassword123' })
  @IsString()
  @Length(4, 64)
  newPassword!: string;
}
