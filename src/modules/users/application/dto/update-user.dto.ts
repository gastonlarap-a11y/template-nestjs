import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { CreateUserSchema } from './create-user.dto';

/**
 * Input schema for updating a user. Email is immutable here (identity), so we
 * omit it; all remaining fields become optional, plus an `isActive` toggle.
 */
export const UpdateUserSchema = CreateUserSchema.omit({ email: true })
  .partial()
  .extend({
    isActive: z
      .boolean()
      .optional()
      .meta({ description: 'Enable/disable the account' }),
  });

export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;

export class UpdateUserDto extends createZodDto(UpdateUserSchema) {}
