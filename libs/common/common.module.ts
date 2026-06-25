import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';

import { AllExceptionsFilter } from './filters/all-exceptions.filter';
import {
  DEFAULT_REQUEST_TIMEOUT_MS,
  TimeoutInterceptor,
} from './interceptors/timeout.interceptor';

/**
 * Cross-cutting concerns wired application-wide:
 *  - {@link AllExceptionsFilter}: uniform `ApiEnvelope` shape for every error.
 *  - {@link TimeoutInterceptor}: fail-fast on slow requests (15 s default).
 *
 * The `ZodValidationPipe` is registered in `AppModule` (must be the global pipe
 * so every Zod DTO is validated). Feature handlers own the success envelope
 * by returning `ApiEnvelope<T>` directly — no global transform interceptor.
 */
@Module({
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    {
      provide: APP_INTERCEPTOR,
      useFactory: () => new TimeoutInterceptor(DEFAULT_REQUEST_TIMEOUT_MS),
    },
  ],
})
export class CommonModule {}
