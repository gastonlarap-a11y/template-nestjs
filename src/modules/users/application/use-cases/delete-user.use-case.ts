import { Injectable } from '@nestjs/common';

import { EntityNotFoundException } from '@app/common';

import { UserRepository } from '../../domain/user.repository';

/** Use case: permanently remove a user. */
@Injectable()
export class DeleteUserUseCase {
  constructor(private readonly users: UserRepository) {}

  async execute(id: string): Promise<void> {
    const existing = await this.users.findById(id);
    if (!existing) {
      throw new EntityNotFoundException('User', id);
    }
    await this.users.delete(id);
  }
}
