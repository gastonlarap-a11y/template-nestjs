/** Field-level error entry returned in validation failures. */
export interface EnvelopeError {
  path: string;
  message: string;
  code: string;
}

/**
 * Uniform response envelope for all API endpoints (success and error).
 *
 * Successful handlers return `ApiEnvelope<T>` directly; the global
 * `AllExceptionsFilter` produces the same shape for every error, so clients
 * always receive a predictable contract.
 */
export interface ApiEnvelope<T = unknown> {
  success: boolean;
  data: T | null;
  message: string;
  meta: { timestamp: string };
  errors?: EnvelopeError[];
}
