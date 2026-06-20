import { Injectable } from '@nestjs/common';
import { Prisma, type User as UserRecord } from '@prisma/client';

import { PrismaService } from '@app/database';

import { User } from '../domain/user.entity';
import {
  type CreateUserData,
  type FindUsersOptions,
  type UpdateUserData,
  UserRepository,
} from '../domain/user.repository';

/** Columns that may be sorted on (allow-listed to avoid invalid `orderBy`). */
const SORTABLE_FIELDS = new Set(['name', 'email', 'createdAt', 'updatedAt']);

/**
 * **Adapter** implementing the {@link UserRepository} port with Prisma.
 *
 * This is the only place that knows about the database. It also handles the
 * impedance mismatch between the storage shape (roles persisted as a JSON
 * string) and the domain entity (roles as `string[]`).
 */
@Injectable()
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateUserData): Promise<User> {
    const record = await this.prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        roles: JSON.stringify(data.roles),
      },
    });
    return this.toDomain(record);
  }

  async findById(id: string): Promise<User | null> {
    const record = await this.prisma.user.findUnique({ where: { id } });
    return record ? this.toDomain(record) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const record = await this.prisma.user.findUnique({ where: { email } });
    return record ? this.toDomain(record) : null;
  }

  async findMany(
    options: FindUsersOptions,
  ): Promise<{ items: User[]; total: number }> {
    const where: Prisma.UserWhereInput = {
      ...(options.isActive !== undefined && { isActive: options.isActive }),
      ...(options.search && {
        OR: [
          { name: { contains: options.search } },
          { email: { contains: options.search } },
        ],
      }),
    };

    const sortBy =
      options.sortBy && SORTABLE_FIELDS.has(options.sortBy)
        ? options.sortBy
        : 'createdAt';

    const [records, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: { [sortBy]: options.sortOrder },
        skip: (options.page - 1) * options.limit,
        take: options.limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items: records.map((r) => this.toDomain(r)), total };
  }

  async update(id: string, data: UpdateUserData): Promise<User> {
    const record = await this.prisma.user.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(data.roles !== undefined && { roles: JSON.stringify(data.roles) }),
      },
    });
    return this.toDomain(record);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.user.delete({ where: { id } });
  }

  /** Maps a persistence record to the domain entity. */
  private toDomain(record: UserRecord): User {
    return new User(
      record.id,
      record.email,
      record.name,
      JSON.parse(record.roles) as string[],
      record.isActive,
      record.createdAt,
      record.updatedAt,
    );
  }
}
