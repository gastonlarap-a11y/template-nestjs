import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';

import { HealthController } from './health.controller';

/**
 * Health & observability surface. Bundles the Terminus-based liveness/readiness
 * probes. (Tracing/metrics are initialised separately and earlier — see
 * `instrumentation.ts`.)
 */
@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
})
export class ObservabilityModule {}
