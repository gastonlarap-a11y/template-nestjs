import { Module } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { ZodValidationPipe } from 'nestjs-zod';

import { AuthModule } from '@app/auth';
import { CommonModule } from '@app/common';
import { AppConfigModule } from '@app/config';
import { PrismaModule } from '@app/database';
import { AppLoggingModule } from '@app/logging';
import { ObservabilityModule } from '@app/observability';

import { UsersModule } from './modules/users/users.module';

/**
 * Application composition root.
 *
 * Global, cross-cutting modules (config, logging, database, auth, common,
 * observability) are wired once here; feature modules (e.g. {@link UsersModule})
 * plug in alongside them. The global {@link ZodValidationPipe} makes every
 * `createZodDto` body/query/param self-validating.
 */
@Module({
  imports: [
    // Infrastructure / cross-cutting (most are @Global()).
    AppConfigModule,
    AppLoggingModule,
    PrismaModule,
    AuthModule,
    CommonModule,
    ObservabilityModule,

    // Feature modules.
    UsersModule,
  ],
  providers: [
    // Validate & coerce every Zod DTO across the app.
    { provide: APP_PIPE, useClass: ZodValidationPipe },
  ],
})
export class AppModule {}
