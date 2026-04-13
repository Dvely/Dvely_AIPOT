import { Module } from '@nestjs/common';
import { StoreModule } from '../store/store.module';
import { UsersModule } from '../users/users.module';
import { SocialController } from './social.controller';
import { SocialService } from './social.service.js';

@Module({
	imports: [StoreModule, UsersModule],
	controllers: [SocialController],
	providers: [SocialService],
})
export class SocialModule {}
