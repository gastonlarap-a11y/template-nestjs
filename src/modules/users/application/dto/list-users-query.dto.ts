import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { PaginationQuerySchema } from '@app/common';

/**
 * Query parameters for listing users: shared pagination + resource-specific
 * filters. `z.stringbool()` parses the `isActive` query string into a boolean.
 */
export const ListUsersQuerySchema = PaginationQuerySchema.extend({
  search: z
    .string()
    .optional()
    .meta({ description: 'Case-insensitive match on name or email' }),
  isActive: z.stringbool().optional().meta({ description: 'Filter by status' }),
});

export type ListUsersQuery = z.infer<typeof ListUsersQuerySchema>;

export class ListUsersQueryDto extends createZodDto(ListUsersQuerySchema) {}
