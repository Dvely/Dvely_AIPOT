import { Module } from '@nestjs/common';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';
import { StoreModule } from '../store/store.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [StoreModule, UsersModule],
  controllers: [RoomsController],
  providers: [RoomsService],
  exports: [RoomsService],
})
export class RoomsModule {}
