import { SetMetadata } from '@nestjs/common';

/** Reflector metadata key flagging a handler that must not be enveloped. */
export const SKIP_RESPONSE_ENVELOPE = 'skipResponseEnvelope';

/**
 * Opt a route out of the global {@link TransformInterceptor} `{ data, meta }`
 * envelope, returning its raw payload instead.
 *
 * Use sparingly — primarily for responses with a fixed external contract that
 * must not be wrapped, e.g. Terminus health probes (`{ status, info, details }`)
 * consumed by orchestrators.
 */
export const SkipResponseEnvelope = () =>
  SetMetadata(SKIP_RESPONSE_ENVELOPE, true);
