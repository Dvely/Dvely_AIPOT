import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { BotModelTier, LlmProvider } from '../../common/enums/room.enum';

export class AddBotDto {
  @ApiProperty({ enum: BotModelTier, example: BotModelTier.FREE })
  @IsEnum(BotModelTier)
  modelTier!: BotModelTier;

  @ApiProperty({ enum: LlmProvider, example: LlmProvider.LOCAL })
  @IsEnum(LlmProvider)
  provider!: LlmProvider;

  @ApiProperty({ enum: ['balanced', 'aggressive', 'tight'] })
  @IsIn(['balanced', 'aggressive', 'tight'])
  style!: 'balanced' | 'aggressive' | 'tight';

  @ApiPropertyOptional({ example: 'gpt-4.1-mini' })
  @IsOptional()
  @IsString()
  model?: string;
}
