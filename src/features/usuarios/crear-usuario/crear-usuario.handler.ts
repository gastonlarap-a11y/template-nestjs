import {
  Body,
  ConflictException,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { PrismaService } from '@app/database';
import type { ApiEnvelope } from '@app/common';

import { Roles } from '@app/common';
import { CreateUsuarioDto, type UsuarioData } from './crear-usuario.dto';

@ApiTags('Usuarios')
@ApiBearerAuth('bearer')
@Controller('usuarios')
export class CrearUsuarioHandler {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('Admin')
  @ApiOperation({ summary: 'Crear un usuario', operationId: 'crearUsuario' })
  async crear(
    @Body() dto: CreateUsuarioDto,
  ): Promise<ApiEnvelope<UsuarioData>> {
    const existente = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existente) {
      throw new ConflictException(`El email "${dto.email}" ya está en uso`);
    }

    const usuario = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        roles: JSON.stringify(dto.roles),
      },
    });

    return {
      success: true,
      data: {
        id: usuario.id,
        email: usuario.email,
        name: usuario.name,
        roles: JSON.parse(usuario.roles) as string[],
        isActive: usuario.isActive,
        createdAt: usuario.createdAt.toISOString(),
        updatedAt: usuario.updatedAt.toISOString(),
      },
      message: 'Usuario creado exitosamente',
      meta: { timestamp: new Date().toISOString() },
    };
  }
}
