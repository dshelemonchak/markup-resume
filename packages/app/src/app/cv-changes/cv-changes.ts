/** Tells listeners that a CV was written: the server-side counterpart of a Subject. */
export class CvChanges {
  private readonly listeners = new Set<(id: string) => void>();

  /** Like subscribe(); returns the unsubscribe function. */
  onChange(listener: (id: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Like next(). */
  notify(id: string): void {
    this.listeners.forEach((listener) => listener(id));
  }
}
