import { Module } from '@nestjs/common';

import { UserRepository } from './domain/user.repository';
import { PrismaUserRepository } from './infrastructure/prisma-user.repository';
import { CreateUserUseCase } from './application/use-cases/create-user.use-case';
import { DeleteUserUseCase } from './application/use-cases/delete-user.use-case';
import { GetUserUseCase } from './application/use-cases/get-user.use-case';
import { ListUsersUseCase } from './application/use-cases/list-users.use-case';
import { UpdateUserUseCase } from './application/use-cases/update-user.use-case';
import { UsersController } from './users.controller';

/**
 * Wires the Users vertical slice together. The key line is the **port → adapter
 * binding**: use cases depend on the abstract `UserRepository`, which is
 * fulfilled at runtime by `PrismaUserRepository`. Swap that one provider (e.g.
 * for an in-memory fake in tests) without touching any business logic.
 */
@Module({
  controllers: [UsersController],
  providers: [
    { provide: UserRepository, useClass: PrismaUserRepository },
    CreateUserUseCase,
    GetUserUseCase,
    ListUsersUseCase,
    UpdateUserUseCase,
    DeleteUserUseCase,
  ],
})
export class UsersModule {}
