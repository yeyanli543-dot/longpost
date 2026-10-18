import { Module } from '@nestjs/common';
import { SyncController } from './sync.controller';

@Module({
  controllers: [SyncController],
})
export class SyncModule {}
