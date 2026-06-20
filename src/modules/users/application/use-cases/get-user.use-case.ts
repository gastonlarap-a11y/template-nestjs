import { Injectable } from '@nestjs/common';

import { EntityNotFoundException } from '@app/common';

import { UserRepository } from '../../domain/user.repository';
import { type UserResponse, toUserResponse } from '../dto/user-response.dto';

/** Use case: fetch a single user by id. */
@Injectable()
export class GetUserUseCase {
  constructor(private readonly users: UserRepository) {}

  async execute(id: string): Promise<UserResponse> {
    const user = await this.users.findById(id);
    if (!user) {
      throw new EntityNotFoundException('User', id);
    }
    return toUserResponse(user);
  }
}
