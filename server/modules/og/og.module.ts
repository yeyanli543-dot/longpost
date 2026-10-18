import { Module } from '@nestjs/common';
import { OgController } from './og.controller';

@Module({
  controllers: [OgController],
})
export class OgModule {}
