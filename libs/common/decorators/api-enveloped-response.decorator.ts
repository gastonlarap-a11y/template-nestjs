import { Type, applyDecorators } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';

import { PaginationMetaDto } from '../dto/pagination.dto';

/** Options controlling the documented envelope shape. */
export interface ApiEnvelopedResponseOptions {
  /** HTTP status to document (default `200`). */
  status?: number;
  /** Human-readable response description. */
  description?: string;
  /**
   * Paginated collection: documents `{ data: Model[], meta: PaginationMeta }`,
   * matching `TransformInterceptor`'s hoisting of `{ items, meta }`.
   */
  paginated?: boolean;
  /** Plain collection: documents `{ data: Model[] }` (no `meta`). */
  isArray?: boolean;
}

/**
 * Documents a response wrapped by the global `TransformInterceptor` envelope.
 *
 * Composes the OpenAPI schema with {@link getSchemaPath} + {@link ApiExtraModels}
 * so `/docs` matches the real `{ data, meta }` runtime output:
 *  - default            → `{ data: <Model> }`
 *  - `{ isArray: true }` → `{ data: <Model>[] }`
 *  - `{ paginated: true }` → `{ data: <Model>[], meta: <PaginationMeta> }`
 *
 * @example
 * ```ts
 * @ApiEnvelopedResponse(UserResponseDto)                    // single
 * @ApiEnvelopedResponse(UserResponseDto, { status: 201 })  // created
 * @ApiEnvelopedResponse(UserResponseDto, { paginated: true })
 * ```
 */
export function ApiEnvelopedResponse<TModel extends Type<unknown>>(
  model: TModel,
  options: ApiEnvelopedResponseOptions = {},
): MethodDecorator & ClassDecorator {
  const {
    status = 200,
    description,
    paginated = false,
    isArray = false,
  } = options;

  const dataSchema =
    paginated || isArray
      ? { type: 'array' as const, items: { $ref: getSchemaPath(model) } }
      : { $ref: getSchemaPath(model) };

  return applyDecorators(
    ApiExtraModels(...(paginated ? [model, PaginationMetaDto] : [model])),
    ApiResponse({
      status,
      description,
      schema: {
        type: 'object',
        required: paginated ? ['data', 'meta'] : ['data'],
        properties: paginated
          ? {
              data: dataSchema,
              meta: { $ref: getSchemaPath(PaginationMetaDto) },
            }
          : { data: dataSchema },
      },
    }),
  );
}
