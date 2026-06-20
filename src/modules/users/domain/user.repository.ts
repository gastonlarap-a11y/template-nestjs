import type { User } from './user.entity';

/** Data needed to persist a brand-new user. */
export interface CreateUserData {
  email: string;
  name: string;
  roles: string[];
}

/** Partial mutation of an existing user. */
export interface UpdateUserData {
  name?: string;
  roles?: string[];
  isActive?: boolean;
}

/** Filtering / pagination options for listing users. */
export interface FindUsersOptions {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder: 'asc' | 'desc';
  search?: string;
  isActive?: boolean;
}

/**
 * **Port** (dependency-inversion boundary) for user persistence.
 *
 * The application layer depends only on this abstract class; the concrete
 * Prisma-backed implementation lives in `infrastructure/`. This keeps domain &
 * application code testable (swap a fake repo) and database-agnostic.
 *
 * Declared as an `abstract class` rather than an `interface` so it can double as
 * a runtime DI token: `{ provide: UserRepository, useClass: PrismaUserRepository }`.
 */
export abstract class UserRepository {
  abstract create(data: CreateUserData): Promise<User>;
  abstract findById(id: string): Promise<User | null>;
  abstract findByEmail(email: string): Promise<User | null>;
  abstract findMany(
    options: FindUsersOptions,
  ): Promise<{ items: User[]; total: number }>;
  abstract update(id: string, data: UpdateUserData): Promise<User>;
  abstract delete(id: string): Promise<void>;
}
