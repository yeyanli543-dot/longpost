import { Global, Module, Logger } from '@nestjs/common';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

import { initDatabaseSchema } from './init-schema';

export const DRIZZLE_DATABASE = 'DRIZZLE_DATABASE';
export type { PostgresJsDatabase };

@Global()
@Module({
  providers: [
    {
      provide: DRIZZLE_DATABASE,
      useFactory: () => {
        const logger = new Logger('DatabaseModule');
        const connectionString =
          process.env.DATABASE_URL ||
          process.env.SUDA_DATABASE_URL ||
          'postgres://postgres:postgres@localhost:5432/longpost';

        const client = postgres(connectionString, {
          ssl: process.env.POSTGRES_SSL === 'true' ? 'require' : false,
          max: Number(process.env.DB_MAX_CONNECTIONS || 20),
          idle_timeout: 20,
          connect_timeout: 10,
        });

        // 自动确保全新 PostgreSQL 实例中存在自定义复合类型与全部 25 张业务表
        initDatabaseSchema(client).catch((err) => {
          logger.warn('数据库模式自检/初始化提示：' + String((err && err.message) || err));
        });

        logger.log('已建立原生 Drizzle ORM (PostgreSQL) 数据库连接');
        return drizzle(client, { schema });
      },
    },
  ],
  exports: [DRIZZLE_DATABASE],
})
export class DatabaseModule {}
