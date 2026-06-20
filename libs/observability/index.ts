/**
 * `@app/observability` — health probes + Azure Monitor instrumentation.
 *
 * NOTE: do not re-export `./instrumentation` here; it must be imported on its
 * own as the first statement in `src/main.ts`.
 */
export * from './health.controller';
export * from './observability.module';
