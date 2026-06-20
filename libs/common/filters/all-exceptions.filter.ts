import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { PinoLogger } from 'nestjs-pino';
import { ZodValidationException } from 'nestjs-zod';
import { ZodError } from 'zod';

import { DomainException } from '../exceptions/domain.exception';

/** Field-level validation error, surfaced as an RFC 7807 extension member. */
interface FieldError {
  path: string;
  message: string;
  code: string;
}

/**
 * RFC 7807 "Problem Details" response body.
 *
 * Core members (`type`, `title`, `status`, `detail`, `instance`) follow the spec
 * verbatim; the remaining fields are spec-sanctioned **extension members** that
 * stay backward-useful to clients:
 *  - `code`          stable, machine-readable error code to branch on.
 *  - `errors`        field-level validation failures (validation errors only).
 *  - `correlationId` request id for cross-referencing logs.
 *  - `timestamp`     ISO time the problem was produced.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc7807
 */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  code: string;
  errors?: FieldError[];
  correlationId?: string;
  timestamp: string;
}

/** Smallest 5xx status — anything ≥ this is a server error (logged at `error`). */
const SERVER_ERROR_MIN: number = HttpStatus.INTERNAL_SERVER_ERROR;

/** Minimal, deterministic mapping from Prisma error codes to HTTP semantics. */
const PRISMA_ERROR_MAP: Record<string, number> = {
  P2025: HttpStatus.NOT_FOUND, // record required but not found
  P2002: HttpStatus.CONFLICT, // unique constraint violation
  P2003: HttpStatus.CONFLICT, // foreign key constraint violation
  P2000: HttpStatus.BAD_REQUEST, // value too long for column
};

/** Human-readable title for a status code (RFC 7807 `title`). */
function reasonPhrase(status: number): string {
  const name = HttpStatus[status];
  if (typeof name !== 'string') return 'Error';
  // INTERNAL_SERVER_ERROR -> "Internal Server Error"
  return name
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Global, Fastify-aware exception filter producing **RFC 7807 Problem Details**.
 *
 * Every thrown error is normalised into a stable `application/problem+json`
 * document so clients (and Swagger consumers) get a predictable contract. It
 * distinguishes Zod validation errors, domain exceptions, known Prisma errors,
 * generic `HttpException`s and truly-unexpected errors (logged at `error` level,
 * never leaking internals to the caller).
 *
 * Before responding it logs the error — with its stack — through the structured
 * `nestjs-pino` logger (`error` for ≥500, `warn` for 4xx).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(AllExceptionsFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    const correlationId = (request as FastifyRequest & { id?: string }).id;
    const problem = this.toProblem(exception, request.url, correlationId);

    // Log with the full error (stack via pino's `err` serializer) BEFORE replying.
    const logPayload = {
      err: exception,
      req: { method: request.method, url: request.url },
      statusCode: problem.status,
      correlationId,
    };
    if (problem.status >= SERVER_ERROR_MIN) {
      this.logger.error(logPayload, `Unhandled error: ${problem.detail}`);
    } else {
      this.logger.warn(logPayload, `Request error: ${problem.detail}`);
    }

    void reply
      .status(problem.status)
      .header('content-type', 'application/problem+json')
      .send(problem);
  }

  private toProblem(
    exception: unknown,
    instance: string,
    correlationId?: string,
  ): ProblemDetails {
    const base = {
      type: 'about:blank',
      instance,
      correlationId,
      timestamp: new Date().toISOString(),
    };

    // 1) Zod validation failures (from the global ZodValidationPipe).
    if (exception instanceof ZodValidationException) {
      const zodError = exception.getZodError();
      return {
        ...base,
        status: HttpStatus.BAD_REQUEST,
        title: reasonPhrase(HttpStatus.BAD_REQUEST),
        code: 'VALIDATION_ERROR',
        detail: 'Request validation failed.',
        errors:
          zodError instanceof ZodError
            ? zodError.issues.map((i) => ({
                path: i.path.join('.'),
                message: i.message,
                code: i.code,
              }))
            : undefined,
      };
    }

    // 2) Domain exceptions carry a stable business `code`.
    if (exception instanceof DomainException) {
      const status = exception.getStatus();
      return {
        ...base,
        status,
        title: reasonPhrase(status),
        code: exception.code,
        detail: exception.message,
      };
    }

    // 3) Known Prisma errors — map to sensible HTTP semantics without leaking SQL.
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const status = PRISMA_ERROR_MAP[exception.code] ?? HttpStatus.BAD_REQUEST;
      return {
        ...base,
        status,
        title: reasonPhrase(status),
        code: `PRISMA_${exception.code}`,
        detail:
          status >= SERVER_ERROR_MIN
            ? 'A database error occurred.'
            : `Database constraint violation (${exception.code}).`,
      };
    }

    // 4) Any other Nest HttpException.
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      const message =
        typeof res === 'string'
          ? res
          : ((res as { message?: string | string[] }).message ??
            exception.message);
      return {
        ...base,
        status,
        title: reasonPhrase(status),
        code: HttpStatus[status] ?? 'HTTP_ERROR',
        detail: Array.isArray(message) ? message.join(', ') : message,
      };
    }

    // 5) Unknown / programmer errors — never leak details.
    return {
      ...base,
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      title: reasonPhrase(HttpStatus.INTERNAL_SERVER_ERROR),
      code: 'INTERNAL_SERVER_ERROR',
      detail: 'An unexpected error occurred.',
    };
  }
}
