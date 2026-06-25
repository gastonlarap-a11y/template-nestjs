import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const CreateUsuarioSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(200),
  roles: z.array(z.string()).default([]),
});

export class CreateUsuarioDto extends createZodDto(CreateUsuarioSchema) {}

/** Zod schema del objeto usuario devuelto en las respuestas. */
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
