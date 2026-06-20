import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { paginatedSchema } from '@app/common';

import type { User } from '../../domain/user.entity';

/** Public representation of a user (the API response contract). */
export const UserResponseSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  name: z.string(),
  roles: z.array(z.string()),
  isActive: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type UserResponse = z.infer<typeof UserResponseSchema>;

export class UserResponseDto extends createZodDto(UserResponseSchema) {}

/** Paginated list of users — `{ items, meta }`. */
export const PaginatedUsersSchema = paginatedSchema(UserResponseSchema);

export class PaginatedUsersDto extends createZodDto(PaginatedUsersSchema) {}

/** Maps a domain {@link User} to its serialisable response shape. */
export function toUserResponse(user: User): UserResponse {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    roles: user.roles,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
