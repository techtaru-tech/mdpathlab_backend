import { Controller, Get, Header, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { MailService } from './mail.service.js';

// Public, no login — the signed token in the link is the credential.
@Controller('mail')
export class MailController {
  constructor(private readonly mail: MailService) {}

  @Get('unsubscribe')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async unsubscribe(@Query('token') token: string, @Res() res: Response) {
    const ok = token ? await this.mail.unsubscribe(token) : false;
    const body = ok
      ? '<h2>You have been unsubscribed</h2><p>You will no longer receive booking and report emails from MD Path Labs. You can turn them back on any time from your account profile.</p>'
      : '<h2>This link is not valid</h2><p>It may have expired. You can change your email preference from your account profile.</p>';
    res.status(ok ? 200 : 400).send(
      `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MD Path Labs</title></head><body style="font-family:Arial,sans-serif;max-width:480px;margin:60px auto;padding:0 20px;color:#1b2a33">${body}</body></html>`,
    );
  }
}
