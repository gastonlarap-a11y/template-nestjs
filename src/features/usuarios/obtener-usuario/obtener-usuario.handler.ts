import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { PrismaService } from '@app/database';
import type { ApiEnvelope } from '@app/common';
import { Roles } from '@app/common';

import type { UsuarioData } from './obtener-usuario.dto';

@ApiTags('Usuarios')
@ApiBearerAuth('bearer')
@Controller('usuarios')
export class ObtenerUsuarioHandler {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':id')
  @Roles('Admin', 'UserManager')
  @ApiOperation({
    summary: 'Obtener usuario por ID',
    operationId: 'obtenerUsuario',
  })
  async obtener(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ApiEnvelope<UsuarioData>> {
    const usuario = await this.prisma.user.findUnique({ where: { id } });
    if (!usuario) {
      throw new NotFoundException(`No se encontró el usuario con id "${id}"`);
    }

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
      message: 'Usuario obtenido exitosamente',
      meta: { timestamp: new Date().toISOString() },
    };
  }
}
