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

        logger.log('已建立原生 Drizzle ORM (PostgreSQL) 数据库连接');
        return drizzle(client, { schema });
      },
    },
  ],
  exports: [DRIZZLE_DATABASE],
})
export class DatabaseModule {}
