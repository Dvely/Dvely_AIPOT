import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { StoreModule } from '../store/store.module';

@Module({
  imports: [StoreModule],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
