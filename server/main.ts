import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
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

  // 启用全局 DTO 参数校验与自动类型转换
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // 基础中间件与跨域配置（支持通过 CORS_ORIGIN 限制生产环境受信源）
  const corsOrigin = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean)
    : process.env.NODE_ENV === 'production'
      ? false
      : true;
  app.enableCors({
    origin: corsOrigin,
    credentials: true,
  });
  app.use(json({ limit: '25mb' }));
  app.use(urlencoded({ extended: true, limit: '25mb' }));
  // 用户上传的文件落在磁盘上，由本站直接托管
  mkdirSync(uploadConfig.dir, { recursive: true });
  app.useStaticAssets(uploadConfig.dir, { prefix: `${uploadConfig.urlPrefix}/` });
  // 第三方前端静态资源（echarts 等），公开阅读页要靠它渲染图表
  app.useStaticAssets(vendorConfig.dir, { prefix: `${vendorConfig.urlPrefix}/` });
  // 托管构建后的前端静态资源（/assets/*、/sw.js、/manifest.json 等），index: false 避免抢占 ViewController 的 SSR 注入
  const clientDistDir = join(process.cwd(), 'dist/client');
  mkdirSync(clientDistDir, { recursive: true });
  app.useStaticAssets(clientDistDir, { index: false });

  const logger = new Logger('Bootstrap');
  const host = process.env.SERVER_HOST || 'localhost';
  const port = Number(process.env.SERVER_PORT || '3000');

  // 注册视图引擎, 渲染 client 目录下的 html 文件
  app.setBaseViewsDir(clientDistDir);
  app.setViewEngine('html');
  app.engine('html', hbsExpressEngine);

  await app.listen(port, host);
  logger.log(`Server running on ${host}:${port}`);
  logger.log(`API endpoints ready at http://${host}:${port}/api`);
}

bootstrap();
