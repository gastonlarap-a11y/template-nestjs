import { Global, Module } from '@nestjs/common';

import { AppConfigModule } from '@app/config';

import { PrismaService } from './prisma.service';

/**
 * Global database module. Exposes a single, connection-pooled
 * {@link PrismaService} to the whole application.
 */
@Global()
@Module({
  imports: [AppConfigModule],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
