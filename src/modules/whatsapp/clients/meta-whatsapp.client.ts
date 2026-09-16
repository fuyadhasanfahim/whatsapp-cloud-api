import { Injectable, InternalServerErrorException } from '@nestjs/common';

@Injectable()
export class MetaWhatsappClient {
  private readonly accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  private readonly phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  async sendTextMessage(to: string, message: string) {
    if (!this.accessToken || !this.phoneNumberId) {
      throw new InternalServerErrorException(
        'WhatsApp credentials are not configured',
      );
    }

    const url = `https://graph.facebook.com/v23.0/${this.phoneNumberId}/messages`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: {
          preview_url: true,
          body: message,
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new InternalServerErrorException({
        message: 'Failed to send WhatsApp message',
        meta: data,
      });
    }

    return data;
  }
}
