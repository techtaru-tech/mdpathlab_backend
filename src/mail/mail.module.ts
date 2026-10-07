import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MailController } from './mail.controller.js';
import { MailService } from './mail.service.js';

// Has its own JwtModule (same secret) instead of importing AuthModule, because AuthService itself sends
// the welcome email — importing AuthModule here would make the two modules depend on each other.
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({ secret: config.get<string>('JWT_SECRET') }),
    }),
  ],
  controllers: [MailController],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
