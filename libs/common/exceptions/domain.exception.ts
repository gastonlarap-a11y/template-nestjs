import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Base class for **domain / application** errors.
 *
 * Domain code throws these framework-light exceptions (they extend
 * {@link HttpException} only so Nest can map them to a status) to keep the
 * application layer free of transport concerns while still producing correct
 * HTTP responses via {@link AllExceptionsFilter}.
 *
 * Each exception carries a stable, machine-readable `code` (e.g.
 * `USER_NOT_FOUND`) that clients can branch on without parsing messages.
 */
export abstract class DomainException extends HttpException {
  abstract readonly code: string;

  protected constructor(message: string, status: HttpStatus) {
    super(message, status);
  }
}

/** Resource does not exist — maps to HTTP 404. */
export class EntityNotFoundException extends DomainException {
  readonly code: string;

  constructor(entity: string, id?: string | number) {
    super(
      id !== undefined
        ? `${entity} with id "${id}" was not found.`
        : `${entity} was not found.`,
      HttpStatus.NOT_FOUND,
    );
    this.code = `${entity.toUpperCase()}_NOT_FOUND`;
  }
}

/** Uniqueness / state conflict — maps to HTTP 409. */
export class EntityConflictException extends DomainException {
  readonly code: string;

  constructor(entity: string, reason: string) {
    super(`${entity} conflict: ${reason}`, HttpStatus.CONFLICT);
    this.code = `${entity.toUpperCase()}_CONFLICT`;
  }
}

/** Business-rule violation — maps to HTTP 422. */
export class BusinessRuleException extends DomainException {
  readonly code: string;

  constructor(message: string, code = 'BUSINESS_RULE_VIOLATION') {
    super(message, HttpStatus.UNPROCESSABLE_ENTITY);
    this.code = code;
  }
}
