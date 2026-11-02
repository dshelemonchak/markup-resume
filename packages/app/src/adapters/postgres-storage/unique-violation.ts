/** Postgres error code for a unique constraint violation. */
const UNIQUE_VIOLATION = '23505';

/** A pg error for a unique violation of the named constraint. */
export function isUniqueViolation(error: unknown, constraint: string): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    error.code === UNIQUE_VIOLATION &&
    'constraint' in error &&
    error.constraint === constraint
  );
}
