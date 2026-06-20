import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { User } from '../domain/user.entity';
import {
  type CreateUserData,
  type FindUsersOptions,
  type UpdateUserData,
  UserRepository,
} from '../domain/user.repository';

/**
 * Database-free {@link UserRepository} implementation.
 *
 * Shipped as the drop-in adapter the `init` CLI selects when you opt **out** of
 * Prisma — it keeps the Users slice fully working (and is handy for tests/demos)
 * without any external database. State lives in memory and resets on restart.
 */
@Injectable()
export class InMemoryUserRepository implements UserRepository {
  private readonly store = new Map<string, User>();

  async create(data: CreateUserData): Promise<User> {
    const now = new Date();
    const user = new User(
      randomUUID(),
      data.email,
      data.name,
      data.roles,
      true,
      now,
      now,
    );
    this.store.set(user.id, user);
    return user;
  }

  async findById(id: string): Promise<User | null> {
    return this.store.get(id) ?? null;
  }

  async findByEmail(email: string): Promise<User | null> {
    return [...this.store.values()].find((u) => u.email === email) ?? null;
  }

  async findMany(
    options: FindUsersOptions,
  ): Promise<{ items: User[]; total: number }> {
    let users = [...this.store.values()];

    if (options.isActive !== undefined) {
      users = users.filter((u) => u.isActive === options.isActive);
    }
    if (options.search) {
      const q = options.search.toLowerCase();
      users = users.filter(
        (u) =>
          u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
      );
    }

    const total = users.length;
    const start = (options.page - 1) * options.limit;
    const items = users.slice(start, start + options.limit);
    return { items, total };
  }

  async update(id: string, data: UpdateUserData): Promise<User> {
    const existing = this.store.get(id);
    if (!existing) throw new Error(`User ${id} not found`);
    const updated = new User(
      existing.id,
      existing.email,
      data.name ?? existing.name,
      data.roles ?? existing.roles,
      data.isActive ?? existing.isActive,
      existing.createdAt,
      new Date(),
    );
    this.store.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
}
