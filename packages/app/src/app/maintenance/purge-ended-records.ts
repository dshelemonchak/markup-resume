import {
  ENDED_RECORD_RETENTION_MS,
  type OAuthGrantRepository,
  type SessionRepository,
  sessionIdleCutoff,
} from '../../domain/index.ts';

export interface PurgeEndedRecordsDependencies {
  readonly sessions: Pick<SessionRepository, 'deleteEnded'>;
  readonly grants: Pick<OAuthGrantRepository, 'deleteExpired'>;
  /** The current time; tests pass a fixed clock. */
  readonly now: () => Date;
}

/**
 * Deletes sessions, authorisation codes and tokens that ended more than the retention period ago. Run regularly by
 * the composition root; returns how many rows of each went.
 */
export async function purgeEndedRecords(
  dependencies: PurgeEndedRecordsDependencies,
): Promise<{ readonly sessions: number; readonly grants: number }> {
  const now = dependencies.now();
  const before = (moment: Date) => new Date(moment.getTime() - ENDED_RECORD_RETENTION_MS);
  const sessions = await dependencies.sessions.deleteEnded({
    expiredBefore: before(now),
    idleBefore: before(sessionIdleCutoff(now)),
  });
  const grants = await dependencies.grants.deleteExpired(before(now));
  return { sessions, grants };
}
