import { PartialType } from '@nestjs/swagger';
import { AddBotDto } from './add-bot.dto';

export class UpdateBotDto extends PartialType(AddBotDto) {}
