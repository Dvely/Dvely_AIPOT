import { Module } from '@nestjs/common';
import { GameController } from './game.controller';
import { GameService } from './game.service';
import { StoreModule } from '../store/store.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [StoreModule, AiModule],
  controllers: [GameController],
  providers: [GameService],
})
export class GameModule {}
