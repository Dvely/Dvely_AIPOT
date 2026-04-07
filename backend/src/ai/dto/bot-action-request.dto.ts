import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { BotModelTier, LlmProvider } from '../../common/enums/room.enum';

class BotActionContextDto {
  @ApiProperty({ description: '현재 게임 스냅샷(JSON)' })
  @IsObject()
  gameState!: Record<string, unknown>;

  @ApiProperty({ description: '현재 핸드까지 누적 액션/상태(JSON)' })
  @IsObject()
  accumulatedState!: Record<string, unknown>;
}

export class BotActionRequestDto {
  @ApiProperty()
  @IsString()
  roomId!: string;

  @ApiProperty()
  @IsString()
  handId!: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  seatId!: number;

  @ApiPropertyOptional({ enum: BotModelTier, default: BotModelTier.FREE })
  @IsOptional()
  @IsEnum(BotModelTier)
  modelTier?: BotModelTier;

  @ApiPropertyOptional({ enum: LlmProvider, default: LlmProvider.LOCAL })
  @IsOptional()
  @IsEnum(LlmProvider)
  provider?: LlmProvider;

  @ApiPropertyOptional({ example: 'gpt-4.1-mini' })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional({ enum: ['balanced', 'aggressive', 'tight', 'random'] })
  @IsOptional()
  @IsIn(['balanced', 'aggressive', 'tight', 'random'])
  playStyle?: 'balanced' | 'aggressive' | 'tight' | 'random';

  @ApiProperty({ type: BotActionContextDto })
  @ValidateNested()
  @Type(() => BotActionContextDto)
  context!: BotActionContextDto;
}
