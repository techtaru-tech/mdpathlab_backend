import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MailController } from './mail.controller.js';
import { MailService } from './mail.service.js';

@Module({
  imports: [AuthModule],
  controllers: [MailController],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
