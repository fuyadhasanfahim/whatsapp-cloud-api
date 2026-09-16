import { Body, Controller, Post } from '@nestjs/common';
import { SendMessageDto } from '../dto/send-message.dto.js';
import { WhatsappService } from '../services/whatsapp/whatsapp.service.js';

@Controller('whatsapp')
export class SendMessageController {
  constructor(private readonly whatsappService: WhatsappService) {}

  @Post('send')
  async sendMessage(@Body() dto: SendMessageDto) {
    return this.whatsappService.sendTextMessage(dto);
  }
}
