import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsString, Max, Min } from 'class-validator';
import { RoomType } from '../../common/enums/room.enum';

export class CreateRoomDto {
  @ApiProperty({ example: 'Friday Night Poker' })
  @IsString()
  name!: string;

  @ApiProperty({ enum: RoomType, example: RoomType.AI_BOT })
  @IsEnum(RoomType)
  type!: RoomType;

  @ApiProperty({ minimum: 2, maximum: 9, example: 8 })
  @IsInt()
  @Min(2)
  @Max(9)
  maxSeats!: number;
}
