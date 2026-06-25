/**
 * `@app/common` — cross-cutting building blocks shared across every module:
 * envelope types, the global error filter, interceptors, RBAC decorators and
 * pagination helpers.
 */
export * from './common.module';

export * from './filters/all-exceptions.filter';

export * from './interceptors/timeout.interceptor';

export * from './decorators/roles.decorator';
export * from './decorators/public.decorator';
export * from './decorators/current-user.decorator';

export * from './interfaces/api-envelope.interface';
export * from './interfaces/authenticated-user.interface';

export * from './dto/pagination.dto';
