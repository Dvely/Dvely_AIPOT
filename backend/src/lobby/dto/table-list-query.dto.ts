import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { RoomType } from '../../common/enums/room.enum';

export class TableListQueryDto {
  @ApiPropertyOptional({ enum: RoomType })
  @IsOptional()
  @IsEnum(RoomType)
  roomType?: RoomType;
}
