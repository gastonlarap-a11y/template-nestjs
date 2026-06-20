import { EntityConflictException } from '@app/common';

import { User } from '../../domain/user.entity';
import {
  type CreateUserData,
  type FindUsersOptions,
  type UpdateUserData,
  UserRepository,
} from '../../domain/user.repository';
import { CreateUserUseCase } from './create-user.use-case';

/**
 * In-memory fake of the {@link UserRepository} port. Because the use case
 * depends on the abstraction (not Prisma), it is testable with zero I/O.
 */
class InMemoryUserRepository extends UserRepository {
  private readonly store = new Map<string, User>();

  async create(data: CreateUserData): Promise<User> {
    const now = new Date();
    const user = new User(
      `id-${this.store.size + 1}`,
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
    _options: FindUsersOptions,
  ): Promise<{ items: User[]; total: number }> {
    const items = [...this.store.values()];
    return { items, total: items.length };
  }

  async update(id: string, _data: UpdateUserData): Promise<User> {
    return this.store.get(id) as User;
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
}

describe('CreateUserUseCase', () => {
  let repo: InMemoryUserRepository;
  let useCase: CreateUserUseCase;

  beforeEach(() => {
    repo = new InMemoryUserRepository();
    useCase = new CreateUserUseCase(repo);
  });

  it('creates a user and returns the response shape', async () => {
    const result = await useCase.execute({
      email: 'jane@example.com',
      name: 'Jane',
      roles: ['Admin'],
    });

    expect(result.email).toBe('jane@example.com');
    expect(result.roles).toEqual(['Admin']);
    expect(typeof result.id).toBe('string');
    expect(typeof result.createdAt).toBe('string');
  });

  it('rejects a duplicate email with a conflict', async () => {
    await useCase.execute({ email: 'dup@example.com', name: 'A', roles: [] });

    await expect(
      useCase.execute({ email: 'dup@example.com', name: 'B', roles: [] }),
    ).rejects.toBeInstanceOf(EntityConflictException);
  });
});
