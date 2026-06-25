import { Module } from '@nestjs/common';

import { ActualizarUsuarioHandler } from './actualizar-usuario/actualizar-usuario.handler';
import { CrearUsuarioHandler } from './crear-usuario/crear-usuario.handler';
import { EliminarUsuarioHandler } from './eliminar-usuario/eliminar-usuario.handler';
import { ListarUsuariosHandler } from './listar-usuarios/listar-usuarios.handler';
import { ObtenerUsuarioHandler } from './obtener-usuario/obtener-usuario.handler';

/**
 * Módulo del dominio Usuarios (Vertical Slice Architecture).
 *
 * Cada slice es un controller autónomo que concentra endpoint, lógica de
 * negocio y DTOs en su propia carpeta. `PrismaService` se inyecta directamente
 * en cada handler — ya está disponible globalmente vía `PrismaModule`.
 */
@Module({
  controllers: [
    CrearUsuarioHandler,
    ObtenerUsuarioHandler,
    ListarUsuariosHandler,
    ActualizarUsuarioHandler,
    EliminarUsuarioHandler,
  ],
})
export class UsuariosModule {}
