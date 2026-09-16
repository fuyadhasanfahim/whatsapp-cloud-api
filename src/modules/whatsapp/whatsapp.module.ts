import { Module } from '@nestjs/common';
import { MetaWhatsappClient } from './clients/meta-whatsapp.client.js';
import { WhatsappService } from './services/whatsapp/whatsapp.service.js';
import { WhatsAppWebhookController } from './controllers/whatsapp-webhook/whatsapp-webhook.controller.js';
import { SendMessageController } from './controllers/send-message.controller.js';

@Module({
  controllers: [WhatsAppWebhookController, SendMessageController],
  providers: [MetaWhatsappClient, WhatsappService],
  exports: [WhatsappService],
})
export class WhatsappModule {}
