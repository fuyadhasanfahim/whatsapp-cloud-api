import { Module } from '@nestjs/common';
import { WhatsappService } from './services/whatsapp/whatsapp.service.js';
import { WhatsappMediaService } from './services/whatsapp-media/whatsapp-media.service.js';
import { WhatsAppWebhookController } from './controllers/whatsapp-webhook/whatsapp-webhook.controller.js';

@Module({
  controllers: [WhatsAppWebhookController],
  providers: [WhatsappService, WhatsappMediaService],
})
export class WhatsappModule {}
