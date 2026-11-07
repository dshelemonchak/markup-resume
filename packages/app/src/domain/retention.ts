const DAY = 24 * 60 * 60 * 1000;

/**
 * Ended sessions, codes and tokens are kept this long before they are deleted: long enough to look into what
 * happened, short enough that the tables do not grow without end (ADR-0028).
 */
export const ENDED_RECORD_RETENTION_MS = 7 * DAY;
