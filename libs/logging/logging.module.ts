import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

import { AppConfigModule, AppConfigService } from '@app/config';

/** Header used to propagate a correlation id across service boundaries. */
export const CORRELATION_ID_HEADER = 'x-correlation-id';

/**
 * Structured logging module (nestjs-pino).
 *
 * - **Production:** single-line JSON logs (ingestible by Azure Monitor / Log
 *   Analytics, Loki, Datadog, etc.).
 * - **Development:** human-friendly, colourised output via `pino-pretty`.
 *
 * Every request is tagged with a correlation id (honouring an inbound
 * `x-correlation-id` header, otherwise generated) which is echoed back on the
 * response and attached to all logs emitted during that request.
 */
@Module({
  imports: [
    LoggerModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL'),
          // Pretty-print only in development; raw JSON everywhere else.
          transport: config.isProduction
            ? undefined
            : {
                target: 'pino-pretty',
                options: {
                  singleLine: true,
                  colorize: true,
                  translateTime: 'SYS:standard',
                  ignore: 'pid,hostname',
                },
              },
          // Correlation id: reuse inbound header or mint a new one.
          genReqId: (req: IncomingMessage, res: ServerResponse) => {
            const existing = req.headers[CORRELATION_ID_HEADER];
            const id =
              (Array.isArray(existing) ? existing[0] : existing) ??
              randomUUID();
            res.setHeader(CORRELATION_ID_HEADER, id);
            return id;
          },
          customProps: (req) => ({
            correlationId: (req as IncomingMessage & { id?: string }).id,
          }),
          // Never leak secrets into logs.
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.body.password',
              'req.body.token',
              'res.headers["set-cookie"]',
            ],
            censor: '[REDACTED]',
          },
          // Quieten health-probe noise.
          autoLogging: {
            ignore: (req: IncomingMessage) =>
              req.url === '/health' || req.url === '/health/ready',
          },
          serializers: {
            req: (
              req: IncomingMessage & { method?: string; url?: string },
            ) => ({
              method: req.method,
              url: req.url,
            }),
          },
        },
      }),
    }),
  ],
})
export class AppLoggingModule {}
