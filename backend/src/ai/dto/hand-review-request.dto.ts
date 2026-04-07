import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsObject, IsOptional, IsString } from 'class-validator';
import { PreferredLanguage } from '../../common/enums/language.enum';
import { LlmProvider } from '../../common/enums/room.enum';

export class HandReviewRequestDto {
  @ApiProperty()
  @IsString()
  handId!: string;

  @ApiProperty({ description: '핸드 로그/보드/행동 타임라인 원본(JSON)' })
  @IsObject()
  handContext!: object;

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
