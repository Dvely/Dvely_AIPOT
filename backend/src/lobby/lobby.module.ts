import { Module } from '@nestjs/common';
import { LobbyController } from './lobby.controller';
import { LobbyService } from './lobby.service';
import { StoreModule } from '../store/store.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [StoreModule, UsersModule],
  controllers: [LobbyController],
  providers: [LobbyService],
})
export class LobbyModule {}
