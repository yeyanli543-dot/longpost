import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { json, urlencoded } from 'express';
import { join } from 'path';
import { __express as hbsExpressEngine } from 'hbs';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { mkdirSync } from 'fs';
import { AppModule } from './app.module';
import { uploadConfig } from './config/upload.config';
import { vendorConfig } from './config/vendor.config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    abortOnError: process.env.NODE_ENV !== 'development',
  });
  
  // 基础中间件与跨域配置
  app.enableCors({
    origin: true,
    credentials: true,
  });
  app.use(json({ limit: '25mb' }));
  app.use(urlencoded({ extended: true, limit: '25mb' }));
  // 用户上传的文件落在磁盘上，由本站直接托管
  mkdirSync(uploadConfig.dir, { recursive: true });
  app.useStaticAssets(uploadConfig.dir, { prefix: `${uploadConfig.urlPrefix}/` });
  // 第三方前端静态资源（echarts 等），公开阅读页要靠它渲染图表
  app.useStaticAssets(vendorConfig.dir, { prefix: `${vendorConfig.urlPrefix}/` });

  const logger = new Logger('Bootstrap');
  const host = process.env.SERVER_HOST || 'localhost';
  const port = Number(process.env.SERVER_PORT || '3000');

  // 注册视图引擎, 渲染 client 目录下的 html 文件
  app.setBaseViewsDir(join(process.cwd(), 'dist/client'));
  app.setViewEngine('html');
  app.engine('html', hbsExpressEngine);

  await app.listen(port, host);
  logger.log(`Server running on ${host}:${port}`);
  logger.log(`API endpoints ready at http://${host}:${port}/api`);
}

bootstrap();
