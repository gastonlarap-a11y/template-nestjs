import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import {
  ApiEnvelopedResponse,
  type AuthenticatedUser,
  CurrentUser,
  Roles,
} from '@app/common';

import { CreateUserDto } from './application/dto/create-user.dto';
import { ListUsersQueryDto } from './application/dto/list-users-query.dto';
import { UpdateUserDto } from './application/dto/update-user.dto';
import {
  PaginatedUsersDto,
  UserResponseDto,
} from './application/dto/user-response.dto';
import { CreateUserUseCase } from './application/use-cases/create-user.use-case';
import { DeleteUserUseCase } from './application/use-cases/delete-user.use-case';
import { GetUserUseCase } from './application/use-cases/get-user.use-case';
import { ListUsersUseCase } from './application/use-cases/list-users.use-case';
import { UpdateUserUseCase } from './application/use-cases/update-user.use-case';

/**
 * Users REST API.
 *
 * The controller is a thin **transport adapter**: it validates input (Zod
 * DTOs), enforces RBAC (`@Roles`) and delegates to single-responsibility use
 * cases. `@ApiBearerAuth('bearer')` ties every operation to the Swagger Bearer
 * security scheme so endpoints are testable from `/docs`.
 */
@ApiTags('Users')
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token.' })
@ApiForbiddenResponse({
  description: 'Authenticated but lacking the required role.',
})
@Controller('users')
export class UsersController {
  constructor(
    private readonly createUser: CreateUserUseCase,
    private readonly getUser: GetUserUseCase,
    private readonly listUsers: ListUsersUseCase,
    private readonly updateUser: UpdateUserUseCase,
    private readonly deleteUser: DeleteUserUseCase,
  ) {}

  @Post()
  @Roles('Admin')
  @ApiOperation({ summary: 'Create a new user', operationId: 'createUser' })
  @ApiEnvelopedResponse(UserResponseDto, {
    status: HttpStatus.CREATED,
    description: 'The created user.',
  })
  create(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    return this.createUser.execute(dto);
  }

  @Get()
  @Roles('Admin', 'UserManager')
  @ApiOperation({ summary: 'List users (paginated)', operationId: 'listUsers' })
  @ApiEnvelopedResponse(UserResponseDto, {
    paginated: true,
    description: 'A page of users with pagination metadata.',
  })
  list(@Query() query: ListUsersQueryDto): Promise<PaginatedUsersDto> {
    return this.listUsers.execute(query);
  }

  @Get('me')
  @ApiOperation({
    summary: 'Get the current authenticated principal',
    operationId: 'getCurrentUser',
  })
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }

  @Get(':id')
  @Roles('Admin', 'UserManager')
  @ApiOperation({ summary: 'Get a user by id', operationId: 'getUser' })
  @ApiEnvelopedResponse(UserResponseDto, { description: 'The requested user.' })
  @ApiNotFoundResponse({ description: 'User not found.' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<UserResponseDto> {
    return this.getUser.execute(id);
  }

  @Patch(':id')
  @Roles('Admin')
  @ApiOperation({ summary: 'Update a user', operationId: 'updateUser' })
  @ApiEnvelopedResponse(UserResponseDto, { description: 'The updated user.' })
  @ApiNotFoundResponse({ description: 'User not found.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    return this.updateUser.execute(id, dto);
  }

  @Delete(':id')
  @Roles('Admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a user', operationId: 'deleteUser' })
  @ApiNoContentResponse({ description: 'User deleted.' })
  @ApiNotFoundResponse({ description: 'User not found.' })
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.deleteUser.execute(id);
  }
}
