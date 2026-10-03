import { Module } from '@nestjs/common';
import { PwaController } from './pwa.controller';

@Module({
  controllers: [PwaController],
  providers: [],
})
export class PwaModule {}
