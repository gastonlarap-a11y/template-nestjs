import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * Input schema for creating a user (Zod v4).
 *
 * Note the v4 top-level format helpers (`z.email()`), which replace the old
 * `z.string().email()` chain. `.meta()` annotations surface as descriptions and
 * examples in the generated OpenAPI document.
 */
export const CreateUserSchema = z.object({
  email: z.email().max(320).meta({
    description: 'Unique email address',
    example: 'jane.doe@example.com',
  }),
  name: z
    .string()
    .min(1)
    .max(200)
    .meta({ description: 'Full display name', example: 'Jane Doe' }),
  roles: z
    .array(z.string())
    .default([])
    .meta({ description: 'Application roles', example: ['Admin'] }),
});

export type CreateUserInput = z.infer<typeof CreateUserSchema>;

/** Request body DTO — validated by the global `ZodValidationPipe`. */
export class CreateUserDto extends createZodDto(CreateUserSchema) {}
