import { Module } from '@nestjs/common';
import { HandReviewController } from './hand-review.controller';
import { HandReviewService } from './hand-review.service';
import { StoreModule } from '../store/store.module';
import { AiModule } from '../ai/ai.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [StoreModule, AiModule, UsersModule],
  controllers: [HandReviewController],
  providers: [HandReviewService],
})
export class HandReviewModule {}
