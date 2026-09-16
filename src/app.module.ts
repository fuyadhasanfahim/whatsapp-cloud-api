import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { WhatsappModule } from './modules/whatsapp/whatsapp.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

@Module({
  imports: [ConfigModule, DatabaseModule, WhatsappModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
