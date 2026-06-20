import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { PrismaClient } from '@prisma/client';

import { AppConfigService } from '@app/config';

/**
 * Prisma data-access service.
 *
 * Extends the generated {@link PrismaClient} and manages its lifecycle within
 * Nest's DI container. In Prisma 7 the (now pure-TypeScript) client connects
 * through a **driver adapter** — here `@prisma/adapter-mssql`, fed the JDBC-style
 * `DATABASE_URL`. Swapping databases is a matter of changing the adapter and the
 * datasource `provider` (the `init` CLI automates the PostgreSQL variant).
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: AppConfigService) {
    super({
      adapter: new PrismaMssql(config.get('DATABASE_URL')),
      log: config.isDevelopment ? ['warn', 'error'] : ['error'],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log(
      'Database connection established (Prisma + mssql adapter).',
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Lightweight liveness probe used by the readiness health check. */
  async isHealthy(): Promise<boolean> {
    await this.$queryRaw`SELECT 1`;
    return true;
  }
}
