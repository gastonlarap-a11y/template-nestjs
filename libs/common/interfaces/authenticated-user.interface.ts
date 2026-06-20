/**
 * Normalised authenticated principal attached to `request.user` after a token
 * is validated by the JWT strategy.
 *
 * The shape is intentionally provider-agnostic: whether the token came from
 * Azure AD (Entra ID) or the local mock signer, downstream code sees the same
 * fields. The strategy is responsible for the mapping.
 */
export interface AuthenticatedUser {
  /** Subject — the stable user id (`sub` claim). */
  userId: string;
  /** User email / UPN, when present. */
  email?: string;
  /** Display name, when present. */
  name?: string;
  /** Application roles used for RBAC (`roles` claim). */
  roles: string[];
}
