import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateAvatarDto {
  @ApiProperty({ example: 'shortHairShortFlat' })
  @IsString()
  hairStyle!: string;

  @ApiProperty({ example: 'ffdbb4' })
  @IsString()
  skinTone!: string;

  @ApiProperty({ example: 'black' })
  @IsString()
  hairColor!: string;

  @ApiProperty({ example: 'default' })
  @IsString()
  faceType!: string;

  @ApiProperty({ example: 'default' })
  @IsString()
  eyeType!: string;

  @ApiProperty({ example: 'smile' })
  @IsString()
  mouthType!: string;

  @ApiProperty({ example: 'hoodie' })
  @IsString()
  outfit!: string;

  @ApiPropertyOptional({ example: 'glasses' })
  @IsOptional()
  @IsString()
  accessory?: string;
}
