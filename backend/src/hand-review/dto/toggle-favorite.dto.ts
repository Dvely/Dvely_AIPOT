import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class ToggleFavoriteDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  favorite!: boolean;
}
