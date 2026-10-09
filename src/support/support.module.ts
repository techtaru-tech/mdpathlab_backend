import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module.js';
import { SupportController } from './support.controller.js';

@Module({
  imports: [SettingsModule],
  controllers: [SupportController],
})
export class SupportModule {}
