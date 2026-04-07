import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { RoomType } from '../../common/enums/room.enum';

export class QuickPlayDto {
  @ApiPropertyOptional({ enum: RoomType, default: RoomType.AI_BOT })
  @IsOptional()
  @IsEnum(RoomType)
  roomType?: RoomType;

  @ApiPropertyOptional({ minimum: 2, maximum: 9, default: 6 })
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(9)
  maxSeats?: number;
}
