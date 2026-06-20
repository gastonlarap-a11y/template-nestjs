import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/** Reusable query schema for offset pagination + sorting. */
export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

/** DTO form for use as a controller `@Query()` parameter. */
export class PaginationQueryDto extends createZodDto(PaginationQuerySchema) {}

/** Metadata describing a page of results. */
export const PaginationMetaSchema = z.object({
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  totalPages: z.number().int().nonnegative(),
  hasNextPage: z.boolean(),
  hasPreviousPage: z.boolean(),
});

export type PaginationMeta = z.infer<typeof PaginationMetaSchema>;

/**
 * DTO form of {@link PaginationMetaSchema}. Exists so the OpenAPI `meta` member
 * of the response envelope can be `$ref`-ed (see `@ApiEnvelopedResponse`).
 */
export class PaginationMetaDto extends createZodDto(PaginationMetaSchema) {}

/**
 * Builds a `{ items, meta }` schema for a given item schema. Use in modules to
 * create strongly-typed, Swagger-documented paginated response DTOs.
 *
 * @example
 * ```ts
 * export class PaginatedUsersDto extends createZodDto(
 *   paginatedSchema(UserResponseSchema),
 * ) {}
 * ```
 */
export const paginatedSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({ items: z.array(item), meta: PaginationMetaSchema });

/** Computes pagination metadata from the raw count and the query. */
export function buildPaginationMeta(
  total: number,
  query: Pick<PaginationQuery, 'page' | 'limit'>,
): PaginationMeta {
  const totalPages = Math.ceil(total / query.limit);
  return {
    total,
    page: query.page,
    limit: query.limit,
    totalPages,
    hasNextPage: query.page < totalPages,
    hasPreviousPage: query.page > 1,
  };
}
