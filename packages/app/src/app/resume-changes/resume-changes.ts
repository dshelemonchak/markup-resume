/** What a use case announces a change through: it knows the resume, the notifier knows whose it is. */
export interface ResumeChangeNotifier {
  notify(slug: string): void;
}

/**
 * Tells listeners that a CV was written: the server-side counterpart of a Subject. Every change carries its owner,
 * so one user's writes are never announced to another user (ADR-0027).
 */
export class ResumeChanges {
  private readonly listeners = new Set<(ownerId: string, slug: string) => void>();

  /** Like subscribe(); returns the unsubscribe function. */
  onChange(listener: (ownerId: string, slug: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Like next(). */
  notify(ownerId: string, slug: string): void {
    this.listeners.forEach((listener) => listener(ownerId, slug));
  }

  /** The notifier for one owner's CVs, handed to the use cases of a request. */
  forOwner(ownerId: string): ResumeChangeNotifier {
    return { notify: (slug) => this.notify(ownerId, slug) };
  }
}
