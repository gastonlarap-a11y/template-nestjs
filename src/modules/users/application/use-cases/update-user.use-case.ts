import { Injectable } from '@nestjs/common';

import { EntityNotFoundException } from '@app/common';

import { UserRepository } from '../../domain/user.repository';
import type { UpdateUserInput } from '../dto/update-user.dto';
import { type UserResponse, toUserResponse } from '../dto/user-response.dto';

/** Use case: update a user's mutable fields. */
@Injectable()
export class UpdateUserUseCase {
  constructor(private readonly users: UserRepository) {}

  async execute(id: string, input: UpdateUserInput): Promise<UserResponse> {
    const existing = await this.users.findById(id);
    if (!existing) {
      throw new EntityNotFoundException('User', id);
    }

    const user = await this.users.update(id, input);
    return toUserResponse(user);
  }
}
