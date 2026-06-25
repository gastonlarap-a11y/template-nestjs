import {
  Controller,
  Delete,
  NotFoundException,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { PrismaService } from '@app/database';
import type { ApiEnvelope } from '@app/common';
import { Roles } from '@app/common';

@ApiTags('Usuarios')
@ApiBearerAuth('bearer')
@Controller('usuarios')
export class EliminarUsuarioHandler {
  constructor(private readonly prisma: PrismaService) {}

  @Delete(':id')
  @Roles('Admin')
  @ApiOperation({ summary: 'Eliminar usuario', operationId: 'eliminarUsuario' })
  async eliminar(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ApiEnvelope<null>> {
    const existe = await this.prisma.user.findUnique({ where: { id } });
    if (!existe) {
      throw new NotFoundException(`No se encontró el usuario con id "${id}"`);
    }

    await this.prisma.user.delete({ where: { id } });

    return {
      success: true,
      data: null,
      message: 'Usuario eliminado exitosamente',
      meta: { timestamp: new Date().toISOString() },
    };
  }
}
