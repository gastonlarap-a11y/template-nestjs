// IMPORTANT: instrumentation must be the very first import so OpenTelemetry can
// patch Node's libraries before any of them are loaded. Do not move it.
import '@app/observability/instrumentation';

import helmet from '@fastify/helmet';
import { RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { Logger } from 'nestjs-pino';

import { AppConfigService } from '@app/config';

import { AppModule } from './app.module';

/** Named Swagger security scheme; referenced by `@ApiBearerAuth('bearer')`. */
const BEARER_SCHEME = 'bearer';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    // `trustProxy` so client IPs / protocol are correct behind Azure's reverse
    // proxy. `bufferLogs` holds early logs until the pino logger is attached.
    new FastifyAdapter({
      trustProxy: true,
      // Cap request bodies at 1 MiB to blunt oversized-payload abuse.
      bodyLimit: 1_048_576,
      // Let nestjs-pino own request/response logging (no duplicate Fastify logs).
      disableRequestLogging: true,
    }),
    { bufferLogs: true },
  );

  const config = app.get(AppConfigService);

  // Route framework logging through pino (structured JSON in production).
  app.useLogger(app.get(Logger));

  // Security headers (Fastify-native helmet). Relax CSP so Swagger UI loads.
  await app.register(helmet, { contentSecurityPolicy: false });

  app.enableCors({ origin: true, credentials: true });

  // Versioned base path, but keep health probes at the root for orchestrators.
  app.setGlobalPrefix(config.get('API_PREFIX'), {
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
    ],
  });

  // Validation is handled globally by the Zod pipe (registered in AppModule);
  // no class-validator ValidationPipe is needed.

  // Graceful shutdown (drains connections on SIGTERM — important for rollouts).
  app.enableShutdownHooks();

  if (config.get('SWAGGER_ENABLED')) {
    setupSwagger(app);
  }

  const port = config.get('PORT');
  const host = config.get('HOST');
  await app.listen(port, host);

  const url = await app.getUrl();
  app.get(Logger).log(`🚀 Application ready at ${url}`, 'Bootstrap');
}

/** Configures OpenAPI/Swagger with Bearer auth and Zod-aware schema cleanup. */
function setupSwagger(app: NestFastifyApplication): void {
  const builder = new DocumentBuilder()
    .setTitle('NestJS Enterprise Template')
    .setDescription(
      'Cloud-native, Azure-ready NestJS microservice. Use the **Authorize** ' +
        'button with a Bearer token (run `pnpm run auth:token` locally) to call ' +
        'RBAC-protected endpoints.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      BEARER_SCHEME,
    );

  const document = SwaggerModule.createDocument(app, builder.build());

  // `cleanupOpenApiDoc` (nestjs-zod v5) finalises Zod-generated schemas.
  SwaggerModule.setup('docs', app, cleanupOpenApiDoc(document), {
    swaggerOptions: { persistAuthorization: true },
  });

  app.get(Logger).log(`📖 Swagger UI available at /docs`, 'Bootstrap');
}

void bootstrap();
