import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, map } from 'rxjs';

import { SKIP_RESPONSE_ENVELOPE } from '../decorators/skip-response-envelope.decorator';

/**
 * Standard success envelope produced by {@link TransformInterceptor}.
 *
 * Every successful response is wrapped as `{ data, meta? }`, giving clients a
 * single, predictable shape. `meta` is present only for paginated/collection
 * responses (e.g. pagination metadata).
 */
export interface ResponseEnvelope<T = unknown> {
  data: T;
  meta?: unknown;
}

/** Shape produced by the pagination helpers (`buildPaginationMeta`). */
interface PaginatedPayload {
  items: unknown;
  meta: unknown;
}

function isPaginatedPayload(value: unknown): value is PaginatedPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    'items' in value &&
    'meta' in value
  );
}

/**
 * Global interceptor that wraps successful responses in the standard
 * {@link ResponseEnvelope}.
 *
 *  - Paginated payloads (`{ items, meta }`, produced by `buildPaginationMeta`)
 *    are hoisted to `{ data: items, meta }` so pagination metadata sits at the
 *    top level.
 *  - Everything else becomes `{ data: payload }`.
 *  - Handlers decorated with `@SkipResponseEnvelope()` pass through untouched
 *    (e.g. health probes with a fixed external contract).
 *
 * Errors never reach this interceptor — they are handled by `AllExceptionsFilter`
 * (RFC 7807 Problem Details).
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  ResponseEnvelope<T> | T
> {
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ResponseEnvelope<T> | T> {
    const skip = this.reflector.getAllAndOverride<boolean>(
      SKIP_RESPONSE_ENVELOPE,
      [context.getHandler(), context.getClass()],
    );

    if (skip) {
      return next.handle();
    }

    return next.handle().pipe(
      map((payload): ResponseEnvelope<T> => {
        if (isPaginatedPayload(payload)) {
          return { data: payload.items as T, meta: payload.meta };
        }
        return { data: payload ?? (null as T) };
      }),
    );
  }
}
