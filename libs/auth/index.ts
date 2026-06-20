/**
 * `@app/auth` — dual-mode JWT authentication (Azure AD JWKS / local secret)
 * and global RBAC guards.
 */
export * from './jwt.strategy';
export * from './guards/jwt-auth.guard';
export * from './guards/roles.guard';
export * from './auth.module';
