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

import type {
  ApiEnvelope,
  EnvelopeError,
} from '../interfaces/api-envelope.interface';

/** Minimal, deterministic mapping from Prisma error codes to HTTP semantics. */
const PRISMA_ERROR_MAP: Record<string, number> = {
  P2025: HttpStatus.NOT_FOUND,
  P2002: HttpStatus.CONFLICT,
  P2003: HttpStatus.CONFLICT,
  P2000: HttpStatus.BAD_REQUEST,
};

/** Smallest 5xx status — anything ≥ this is a server error (logged at `error`). */
const SERVER_ERROR_MIN: number = HttpStatus.INTERNAL_SERVER_ERROR;

/**
 * Global, Fastify-aware exception filter that normalises every thrown error
 * into the uniform {@link ApiEnvelope} shape (`{ success, data, message, meta, errors? }`).
 *
 * Handles Zod validation errors, NestJS HttpExceptions (NotFoundException,
 * ConflictException, etc.), known Prisma constraint errors, and unexpected
 * programmer errors — always logging with the pino structured logger before
 * sending the response.
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

    const { status, envelope } = this.toEnvelope(exception);

    const logPayload = {
      err: exception,
      req: { method: request.method, url: request.url },
      statusCode: status,
    };
    if (status >= SERVER_ERROR_MIN) {
      this.logger.error(logPayload, `Unhandled error: ${envelope.message}`);
    } else {
      this.logger.warn(logPayload, `Request error: ${envelope.message}`);
    }

    void reply.status(status).send(envelope);
  }

  private toEnvelope(exception: unknown): {
    status: number;
    envelope: ApiEnvelope<null>;
  } {
    const timestamp = new Date().toISOString();

    // 1) Zod validation failures (from the global ZodValidationPipe).
    if (exception instanceof ZodValidationException) {
      const zodError = exception.getZodError();
      const errors: EnvelopeError[] =
        zodError instanceof ZodError
          ? zodError.issues.map((i) => ({
              path: i.path.join('.'),
              message: i.message,
              code: i.code,
            }))
          : [];

      return {
        status: HttpStatus.BAD_REQUEST,
        envelope: {
          success: false,
          data: null,
          message: 'Error de validación',
          meta: { timestamp },
          errors,
        },
      };
    }

    // 2) Known Prisma errors — map to sensible HTTP semantics without leaking SQL.
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const status = PRISMA_ERROR_MAP[exception.code] ?? HttpStatus.BAD_REQUEST;
      const message =
        status >= SERVER_ERROR_MIN
          ? 'Ocurrió un error de base de datos.'
          : `Violación de restricción de base de datos (${exception.code}).`;

      return {
        status,
        envelope: {
          success: false,
          data: null,
          message,
          meta: { timestamp },
          errors: [],
        },
      };
    }

    // 3) Any NestJS HttpException (NotFoundException, ConflictException, etc.).
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      const raw =
        typeof res === 'string'
          ? res
          : ((res as { message?: string | string[] }).message ??
            exception.message);
      const message = Array.isArray(raw) ? raw.join(', ') : raw;

      return {
        status,
        envelope: {
          success: false,
          data: null,
          message,
          meta: { timestamp },
          errors: [],
        },
      };
    }

    // 4) Unknown / programmer errors — never leak internal details.
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      envelope: {
        success: false,
        data: null,
        message: 'Ocurrió un error inesperado.',
        meta: { timestamp },
        errors: [],
      },
    };
  }
}
