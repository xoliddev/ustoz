/** Domain errors: a stable code the API maps to an HTTP status and the UI maps to a localized message. */
export const ERROR_CODES = [
  'VALIDATION',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'SCHEDULE_CONFLICT',
  'INVALID_TRANSITION',
  'PAYMENT_ERROR',
  'RATE_LIMITED',
  'INTERNAL',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly details: Record<string, unknown>;
  constructor(code: ErrorCode, message?: string, details: Record<string, unknown> = {}) {
    super(message ?? code);
    this.name = 'DomainError';
    this.code = code;
    this.details = details;
  }
}

export const isDomainError = (e: unknown): e is DomainError =>
  e instanceof DomainError || (typeof e === 'object' && e !== null && (e as { name?: string }).name === 'DomainError');

export function httpStatusFor(code: ErrorCode | string): number {
  switch (code) {
    case 'VALIDATION':
      return 400;
    case 'UNAUTHENTICATED':
      return 401;
    case 'FORBIDDEN':
      return 403;
    case 'NOT_FOUND':
      return 404;
    case 'CONFLICT':
    case 'SCHEDULE_CONFLICT':
    case 'INVALID_TRANSITION':
      return 409;
    case 'PAYMENT_ERROR':
      return 402;
    case 'RATE_LIMITED':
      return 429;
    default:
      return 500;
  }
}
