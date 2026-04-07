import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { ActionType } from '../../common/enums/room.enum';

export class ActDto {
  @ApiProperty({ enum: ActionType })
  @IsEnum(ActionType)
  action!: ActionType;

  @ApiPropertyOptional({ description: 'bet/raise 시 금액', minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  amount?: number;
}
