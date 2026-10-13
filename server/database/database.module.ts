import { Global, Module, Logger } from '@nestjs/common';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

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

        // 自动确保标准 PostgreSQL 实例中存在自定义复合类型（兼容非平台自建数据库）
        client`
          DO $$ BEGIN
            CREATE TYPE user_profile AS (user_id text);
          EXCEPTION WHEN duplicate_object THEN NULL; END $$;
          DO $$ BEGIN
            CREATE TYPE file_attachment AS (bucket_id text, file_path text);
          EXCEPTION WHEN duplicate_object THEN NULL; END $$;
        `.simple().catch(() => {
          // 忽略只读副本或连接尚未就绪时的预检异常
        });

        logger.log('已建立原生 Drizzle ORM (PostgreSQL) 数据库连接');
        return drizzle(client, { schema });
      },
    },
  ],
  exports: [DRIZZLE_DATABASE],
})
export class DatabaseModule {}
