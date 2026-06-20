import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  RequestTimeoutException,
} from '@nestjs/common';
import { Observable, TimeoutError, throwError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';

/** Default per-request timeout (ms). Override via the constructor. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

/**
 * Fails any request that exceeds {@link DEFAULT_REQUEST_TIMEOUT_MS} with a
 * `408 Request Timeout` instead of letting connections hang. Protects upstream
 * resources (DB connections, threads) under load — important for stateless,
 * horizontally-scaled cloud deployments.
 */
@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  constructor(
    private readonly timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS,
  ) {}

  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(
      timeout(this.timeoutMs),
      catchError((err: unknown) => {
        if (err instanceof TimeoutError) {
          return throwError(() => new RequestTimeoutException());
        }
        return throwError(() => err);
      }),
    );
  }
}
