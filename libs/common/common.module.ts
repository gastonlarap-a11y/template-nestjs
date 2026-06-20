import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';

import { AllExceptionsFilter } from './filters/all-exceptions.filter';
import {
  DEFAULT_REQUEST_TIMEOUT_MS,
  TimeoutInterceptor,
} from './interceptors/timeout.interceptor';
import { TransformInterceptor } from './interceptors/transform.interceptor';

/**
 * Cross-cutting concerns wired application-wide:
 *  - {@link AllExceptionsFilter}: RFC 7807 Problem Details for every error.
 *  - {@link TransformInterceptor}: standard `{ data, meta }` success envelope.
 *  - {@link TimeoutInterceptor}: fail-fast on slow requests.
 *
 * The `ZodValidationPipe` is registered in `AppModule` (it must be the global
 * pipe so every Zod DTO is validated).
 */
@Module({
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Wraps every successful response in the standard envelope (injects Reflector
    // to honour @SkipResponseEnvelope()).
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
    {
      // Factory (not useClass): the interceptor takes a primitive `number` the
      // DI container can't resolve on its own.
      provide: APP_INTERCEPTOR,
      useFactory: () => new TimeoutInterceptor(DEFAULT_REQUEST_TIMEOUT_MS),
    },
  ],
})
export class CommonModule {}
