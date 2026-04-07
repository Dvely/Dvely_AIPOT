import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StoreService } from './store.service';
import { StateSnapshotEntity } from './entities/state-snapshot.entity';

@Module({
  imports: [TypeOrmModule.forFeature([StateSnapshotEntity])],
  providers: [StoreService],
  exports: [StoreService],
})
export class StoreModule {}
