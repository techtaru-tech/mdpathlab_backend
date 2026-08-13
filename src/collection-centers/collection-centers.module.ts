import { Module } from '@nestjs/common';
import { CollectionCentersController } from './collection-centers.controller.js';

@Module({
  controllers: [CollectionCentersController],
})
export class CollectionCentersModule {}
