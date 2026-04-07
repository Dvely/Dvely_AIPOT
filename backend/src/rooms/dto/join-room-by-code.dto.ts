import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class JoinRoomByCodeDto {
  @ApiProperty({ example: 'AB12CD' })
  @IsString()
  @Length(6, 6)
  code!: string;
}
