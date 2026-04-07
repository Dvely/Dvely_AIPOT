import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { PreferredLanguage } from '../../common/enums/language.enum';
import { LlmProvider } from '../../common/enums/room.enum';

export class AnalyzeHandDto {
  @ApiPropertyOptional({ enum: LlmProvider, default: LlmProvider.LOCAL })
  @IsOptional()
  @IsEnum(LlmProvider)
  provider?: LlmProvider;

  @ApiPropertyOptional({ example: 'local-default' })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  includePremiumAnalysis?: boolean;

  @ApiPropertyOptional({ enum: PreferredLanguage, default: PreferredLanguage.EN })
  @IsOptional()
  @IsEnum(PreferredLanguage)
  language?: PreferredLanguage;
}
