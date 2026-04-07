import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, Matches } from 'class-validator';

export class GuestSessionDto {
  @ApiPropertyOptional({ example: 'Guest_1092' })
  @IsOptional()
  @IsString()
  @Length(3, 24)
  @Matches(/^[a-zA-Z0-9_]+$/)
  displayName?: string;
}
