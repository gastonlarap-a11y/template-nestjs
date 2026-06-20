import { Injectable } from '@nestjs/common';

import { type PaginationMeta, buildPaginationMeta } from '@app/common';

import { UserRepository } from '../../domain/user.repository';
import type { ListUsersQuery } from '../dto/list-users-query.dto';
import { type UserResponse, toUserResponse } from '../dto/user-response.dto';

/** Use case: list users with filtering, sorting and pagination. */
@Injectable()
export class ListUsersUseCase {
  constructor(private readonly users: UserRepository) {}

  async execute(
    query: ListUsersQuery,
  ): Promise<{ items: UserResponse[]; meta: PaginationMeta }> {
    const { items, total } = await this.users.findMany({
      page: query.page,
      limit: query.limit,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      search: query.search,
      isActive: query.isActive,
    });

    return {
      items: items.map(toUserResponse),
      meta: buildPaginationMeta(total, query),
    };
  }
}
