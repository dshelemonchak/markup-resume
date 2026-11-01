/** Tells listeners that a CV was written: the server-side counterpart of a Subject. */
export class ResumeChanges {
  private readonly listeners = new Set<(slug: string) => void>();

  /** Like subscribe(); returns the unsubscribe function. */
  onChange(listener: (slug: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Like next(). */
  notify(slug: string): void {
    this.listeners.forEach((listener) => listener(slug));
  }
}
