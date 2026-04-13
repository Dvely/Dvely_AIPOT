import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
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
import { SocialModule } from './social/social.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'mysql' as const,
        host: process.env.DB_HOST ?? '127.0.0.1',
        port: Number(process.env.DB_PORT ?? 3306),
        username: process.env.DB_USERNAME ?? 'root',
        password: process.env.DB_PASSWORD ?? 'root',
        database: process.env.DB_NAME ?? 'aipot',
        charset: 'utf8mb4',
        autoLoadEntities: true,
        synchronize: String(process.env.DB_SYNCHRONIZE ?? 'true') === 'true',
      }),
    }),
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
    SocialModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
