import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class UpdateRoomBlindsDto {
  @ApiProperty({ minimum: 1, example: 100 })
  @IsInt()
  @Min(1)
  blindSmall!: number;

  @ApiProperty({ minimum: 1, example: 200 })
  @IsInt()
  @Min(1)
  blindBig!: number;
}
