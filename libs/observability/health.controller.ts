import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicatorResult,
  HealthIndicatorService,
} from '@nestjs/terminus';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public, SkipResponseEnvelope } from '@app/common';
import { PrismaService } from '@app/database';

/**
 * Kubernetes / Azure-style probes.
 *
 *  - `GET /health`        — **liveness**: the process is up. Cheap, no I/O.
 *  - `GET /health/ready`  — **readiness**: dependencies (the database) are
 *    reachable. Used to gate traffic during rollouts.
 *
 * Both are `@Public()` so orchestrators can probe without credentials, and
 * `@SkipResponseEnvelope()` so the raw Terminus `{ status, info, details }`
 * contract is preserved (orchestrators parse it directly).
 */
@ApiTags('Health')
@Controller('health')
@SkipResponseEnvelope()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly indicator: HealthIndicatorService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Liveness probe — process is running.' })
  liveness() {
    return this.health.check([]);
  }

  @Public()
  @Get('ready')
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness probe — dependencies are reachable.' })
  readiness() {
    return this.health.check([() => this.checkDatabase()]);
  }

  private async checkDatabase(): Promise<HealthIndicatorResult> {
    const indicator = this.indicator.check('database');
    try {
      await this.prisma.isHealthy();
      return indicator.up();
    } catch (error) {
      return indicator.down({
        message: error instanceof Error ? error.message : 'unreachable',
      });
    }
  }
}
