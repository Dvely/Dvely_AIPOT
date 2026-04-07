import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';

export const CHIP_PACKAGE_IDS = [
  'chips-50k',
  'chips-150k',
  'chips-500k',
  'chips-2000k',
] as const;

export type ChipPackageId = (typeof CHIP_PACKAGE_IDS)[number];

export class BuyChipsDto {
  @ApiProperty({
    enum: CHIP_PACKAGE_IDS,
    example: 'chips-150k',
  })
  @IsString()
  @IsIn(CHIP_PACKAGE_IDS)
  packageId!: ChipPackageId;
}
