/**
 * End-to-end smoke test.
 *
 * Boots the full application graph (Fastify) with the database layer stubbed,
 * then asserts two cross-cutting behaviours:
 *  1. The public liveness probe responds without auth.
 *  2. The global JwtAuthGuard blocks unauthenticated access to a feature route.
 *
 * Env is set up for local-mock auth so the JWT strategy constructs cleanly.
 */
process.env.NODE_ENV = 'test';
process.env.USE_LOCAL_MOCK_AUTH = 'true';
process.env.LOCAL_JWT_SECRET = 'test-secret-test-secret-1234567890';
process.env.DATABASE_URL = 'sqlserver://localhost:1433;database=test';
process.env.SWAGGER_ENABLED = 'false';

import { Test, TestingModule } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';

import { PrismaService } from '@app/database';

import { AppModule } from '../src/app.module';

describe('Application (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      // Replace the real Prisma client so no database is required.
      .overrideProvider(PrismaService)
      .useValue({
        $connect: jest.fn(),
        $disconnect: jest.fn(),
        isHealthy: jest.fn().mockResolvedValue(true),
      })
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health → 200 (public liveness probe)', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok' });
  });

  it('GET /users → 401 without a bearer token', async () => {
    // The global `api` prefix is applied in `main.ts` (not in this bare test
    // app), so the route lives at `/users` here.
    const res = await app.inject({ method: 'GET', url: '/users' });
    expect(res.statusCode).toBe(401);
  });
});
