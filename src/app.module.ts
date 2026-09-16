import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { WhatsappModule } from './modules/whatsapp/whatsapp.module.js';

@Module({
  imports: [
  ConfigModule,
  DatabaseModule,
  WhatsappModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
