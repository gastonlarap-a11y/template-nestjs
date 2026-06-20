/**
 * `@app/common` — cross-cutting building blocks shared across every module:
 * exception types, the global error filter, interceptors, RBAC decorators and
 * pagination helpers.
 */
export * from './common.module';

export * from './exceptions/domain.exception';
export * from './filters/all-exceptions.filter';

export * from './interceptors/timeout.interceptor';
export * from './interceptors/transform.interceptor';

export * from './decorators/roles.decorator';
export * from './decorators/public.decorator';
export * from './decorators/current-user.decorator';
export * from './decorators/skip-response-envelope.decorator';
export * from './decorators/api-enveloped-response.decorator';

export * from './interfaces/authenticated-user.interface';

export * from './dto/pagination.dto';
