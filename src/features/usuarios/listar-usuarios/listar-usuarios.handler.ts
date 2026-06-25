import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';

import { PrismaService } from '@app/database';
import type { ApiEnvelope } from '@app/common';
import { Roles, buildPaginationMeta, type PaginationMeta } from '@app/common';

import {
  ListarUsuariosQueryDto,
  type UsuarioData,
} from './listar-usuarios.dto';

/** Columnas de ordenamiento permitidas (allowlist de seguridad contra inyección). */
const SORTABLE_FIELDS = new Set([
  'email',
  'name',
  'createdAt',
  'updatedAt',
  'isActive',
]);

@ApiTags('Usuarios')
@ApiBearerAuth('bearer')
@Controller('usuarios')
export class ListarUsuariosHandler {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Roles('Admin', 'UserManager')
  @ApiOperation({
    summary: 'Listar usuarios (paginado)',
    operationId: 'listarUsuarios',
  })
  async listar(@Query() query: ListarUsuariosQueryDto): Promise<
    ApiEnvelope<UsuarioData[]> & {
      meta: PaginationMeta & { timestamp: string };
    }
  > {
    const { page, limit, sortBy, sortOrder, search, isActive } = query;

    const where: Prisma.UserWhereInput = {};
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
      ];
    }
    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    const orderBy: Prisma.UserOrderByWithRelationInput =
      sortBy && SORTABLE_FIELDS.has(sortBy)
        ? { [sortBy]: sortOrder }
        : { createdAt: 'desc' };

    const skip = (page - 1) * limit;
    const [usuarios, total] = await Promise.all([
      this.prisma.user.findMany({ where, orderBy, skip, take: limit }),
      this.prisma.user.count({ where }),
    ]);

    const paginationMeta = buildPaginationMeta(total, { page, limit });

    return {
      success: true,
      data: usuarios.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        roles: JSON.parse(u.roles) as string[],
        isActive: u.isActive,
        createdAt: u.createdAt.toISOString(),
        updatedAt: u.updatedAt.toISOString(),
      })),
      message: 'Usuarios obtenidos exitosamente',
      meta: { ...paginationMeta, timestamp: new Date().toISOString() },
    };
  }
}
