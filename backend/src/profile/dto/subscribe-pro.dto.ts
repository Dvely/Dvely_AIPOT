import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class SubscribeProDto {
  @ApiPropertyOptional({
    enum: ['monthly'],
    default: 'monthly',
  })
  @IsOptional()
  @IsString()
  @IsIn(['monthly'])
  plan?: 'monthly';
}
