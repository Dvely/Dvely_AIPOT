import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
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

  @ApiPropertyOptional({ minimum: 1, example: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  blindSmall?: number;

  @ApiPropertyOptional({ minimum: 1, example: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  blindBig?: number;
}
