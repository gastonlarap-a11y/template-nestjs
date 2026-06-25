import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const UpdateUsuarioSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    roles: z.array(z.string()).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Se requiere al menos un campo para actualizar',
  });

export class UpdateUsuarioDto extends createZodDto(UpdateUsuarioSchema) {}

export type UpdateUsuarioInput = z.infer<typeof UpdateUsuarioSchema>;

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
