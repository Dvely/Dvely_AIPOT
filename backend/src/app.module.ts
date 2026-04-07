import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { LobbyModule } from './lobby/lobby.module';
import { RoomsModule } from './rooms/rooms.module';
import { GameModule } from './game/game.module';
import { ProfileModule } from './profile/profile.module';
import { HandReviewModule } from './hand-review/hand-review.module';
import { AiModule } from './ai/ai.module';
import { CommonModule } from './common/common.module';
import { UsersModule } from './users/users.module';
import { StoreModule } from './store/store.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    LobbyModule,
    RoomsModule,
    GameModule,
    ProfileModule,
    HandReviewModule,
    AiModule,
    CommonModule,
    UsersModule,
    StoreModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
