import { Injectable } from '@nestjs/common';

import { EntityConflictException } from '@app/common';

import { UserRepository } from '../../domain/user.repository';
import type { CreateUserInput } from '../dto/create-user.dto';
import { type UserResponse, toUserResponse } from '../dto/user-response.dto';

/** Use case: register a new user, enforcing email uniqueness. */
@Injectable()
export class CreateUserUseCase {
  constructor(private readonly users: UserRepository) {}

  async execute(input: CreateUserInput): Promise<UserResponse> {
    const existing = await this.users.findByEmail(input.email);
    if (existing) {
      throw new EntityConflictException(
        'User',
        `email "${input.email}" is already in use`,
      );
    }

    const user = await this.users.create({
      email: input.email,
      name: input.name,
      roles: input.roles,
    });
    return toUserResponse(user);
  }
}
