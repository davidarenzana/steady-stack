/**
 * The domain errors the HTTP layer knows how to translate into a status
 * code. Deliberately plain classes with no dependency on `h3` or on Nitro:
 * this module is loaded by services and by the route layer alike, and the
 * services run under Vitest and under `tsx`, where auto-imports do not
 * exist.
 */

/** The request body or query failed validation. Maps to an HTTP 400. */
export class ValidationError extends Error {
  readonly statusCode = 400
}

/** The requested resource does not exist. Maps to an HTTP 404. */
export class NotFoundError extends Error {
  readonly statusCode = 404
}

/** The request conflicts with the current state of the data. Maps to an HTTP 409. */
export class ConflictError extends Error {
  readonly statusCode = 409
}
