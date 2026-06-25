import {
  Body,
  Controller,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { PrismaService } from '@app/database';
import type { ApiEnvelope } from '@app/common';
import { Roles } from '@app/common';

import { UpdateUsuarioDto, type UsuarioData } from './actualizar-usuario.dto';

@ApiTags('Usuarios')
@ApiBearerAuth('bearer')
@Controller('usuarios')
export class ActualizarUsuarioHandler {
  constructor(private readonly prisma: PrismaService) {}

  @Patch(':id')
  @Roles('Admin')
  @ApiOperation({
    summary: 'Actualizar usuario',
    operationId: 'actualizarUsuario',
  })
  async actualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUsuarioDto,
  ): Promise<ApiEnvelope<UsuarioData>> {
    const existe = await this.prisma.user.findUnique({ where: { id } });
    if (!existe) {
      throw new NotFoundException(`No se encontró el usuario con id "${id}"`);
    }

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data['name'] = dto.name;
    if (dto.roles !== undefined) data['roles'] = JSON.stringify(dto.roles);
    if (dto.isActive !== undefined) data['isActive'] = dto.isActive;

    const usuario = await this.prisma.user.update({ where: { id }, data });

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
      message: 'Usuario actualizado exitosamente',
      meta: { timestamp: new Date().toISOString() },
    };
  }
}
