/**
 * Domain entity — the User aggregate.
 *
 * This is the heart of the Clean-Architecture slice: a framework-agnostic class
 * with **no** dependency on NestJS, Prisma, HTTP or Zod. It owns identity and
 * the small invariants that are always true of a user, regardless of how the
 * user is stored or transported.
 */
export class User {
  constructor(
    public readonly id: string,
    public email: string,
    public name: string,
    public roles: string[],
    public isActive: boolean,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  /** Whether the user holds a given application role. */
  hasRole(role: string): boolean {
    return this.roles.includes(role);
  }

  /** Soft-disable the account (business operation, not a DB concern). */
  deactivate(): void {
    this.isActive = false;
  }
}
