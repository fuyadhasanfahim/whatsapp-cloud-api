import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { type Response } from 'express';

@Controller('webhooks/whatsapp')
export class WhatsAppWebhookController {
  @Get()
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() response: Response,
  ) {
    const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

    if (mode === 'subscribe' && token === verifyToken) {
      return response.status(HttpStatus.OK).send(challenge);
    }

    return response.sendStatus(HttpStatus.FORBIDDEN);
  }

  @Post()
  receiveWebhook(@Body() payload: unknown, @Res() response: Response) {
    console.log('WhatsApp Webhook:', JSON.stringify(payload, null, 2));

    return response.sendStatus(HttpStatus.OK);
  }
}
