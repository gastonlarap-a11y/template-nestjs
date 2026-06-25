import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { PaginationQuerySchema } from '@app/common';

export const ListarUsuariosQuerySchema = PaginationQuerySchema.extend({
  search: z.string().optional(),
  isActive: z.stringbool().optional(),
});

export class ListarUsuariosQueryDto extends createZodDto(
  ListarUsuariosQuerySchema,
) {}

export type ListarUsuariosQuery = z.infer<typeof ListarUsuariosQuerySchema>;

export const UsuarioSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  roles: z.array(z.string()),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type UsuarioData = z.infer<typeof UsuarioSchema>;
