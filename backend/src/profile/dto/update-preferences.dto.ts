import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { PreferredLanguage } from '../../common/enums/language.enum';

export class UpdatePreferencesDto {
  @ApiProperty({ enum: PreferredLanguage, default: PreferredLanguage.EN })
  @IsEnum(PreferredLanguage)
  preferredLanguage!: PreferredLanguage;
}
