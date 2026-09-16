import { Injectable } from '@nestjs/common';
import { MetaWhatsappClient } from '../../clients/meta-whatsapp.client.js';
import { SendMessageDto } from '../../dto/send-message.dto.js';

@Injectable()
export class WhatsappService {
  constructor(private readonly metaWhatsappClient: MetaWhatsappClient) {}

  async sendTextMessage(dto: SendMessageDto) {
    return this.metaWhatsappClient.sendTextMessage(dto.to, dto.message);
  }
}
