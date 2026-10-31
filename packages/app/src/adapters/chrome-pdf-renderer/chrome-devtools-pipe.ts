import { type ChildProcess, spawn } from 'node:child_process';
import type { Readable, Writable } from 'node:stream';

type Params = Record<string, unknown>;
type Listener = (params: Params, sessionId: string | undefined) => void;

interface Pending {
  readonly resolve: (result: Params) => void;
  readonly reject: (error: Error) => void;
}

/**
 * A minimal Chrome DevTools Protocol client over --remote-debugging-pipe (ADR-0008): Chrome reads commands
 * from file descriptor 3 and writes replies and events to descriptor 4, each a JSON message ended by a NUL.
 * No WebSocket, no open port.
 */
export class ChromeDevToolsPipe {
  private readonly child: ChildProcess;
  private readonly input: Writable;
  private readonly pending = new Map<number, Pending>();
  private readonly listeners = new Map<string, Set<Listener>>();
  private nextId = 1;
  private buffer = '';
  private exitError: Error | null = null;

  /** Starts Chrome with the given arguments; --remote-debugging-pipe is added here. */
  constructor(chromePath: string, args: readonly string[]) {
    this.child = spawn(chromePath, [...args, '--remote-debugging-pipe'], {
      stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'],
    });
    this.input = this.child.stdio[3] as Writable;
    const output = this.child.stdio[4] as Readable;
    let stderr = '';
    this.child.stderr?.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-2000);
    });
    output.on('data', (chunk: Buffer) => this.receive(chunk.toString('utf8')));
    this.child.on('error', (error) => this.fail(error));
    this.child.on('exit', (code, signal) => {
      this.fail(new Error(`Chrome exited (${signal ?? `code ${String(code)}`}). ${stderr.trim()}`.trim()));
    });
  }

  /** Sends a command, to the browser or (with sessionId) to an attached page; resolves with its result. */
  send(method: string, params: Params = {}, sessionId?: string): Promise<Params> {
    if (this.exitError) return Promise.reject(this.exitError);
    const id = this.nextId++;
    const message = JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params });
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.input.write(`${message}\0`);
    });
  }

  /** Calls the listener for every event with this method; returns a function that stops it. */
  on(method: string, listener: Listener): () => void {
    const set = this.listeners.get(method) ?? new Set();
    set.add(listener);
    this.listeners.set(method, set);
    return () => set.delete(listener);
  }

  /** Resolves with the first event of this method in the given session. */
  once(method: string, sessionId?: string): Promise<Params> {
    return new Promise((resolve) => {
      const stop = this.on(method, (params, eventSession) => {
        if (eventSession !== sessionId) return;
        stop();
        resolve(params);
      });
    });
  }

  /** Asks Chrome to quit, and kills it if it does not within a moment. */
  async close(): Promise<void> {
    if (this.exitError) return;
    const exited = new Promise<void>((resolve) => this.child.once('exit', () => resolve()));
    const timer = setTimeout(() => this.child.kill('SIGKILL'), 2_000);
    await this.send('Browser.close').catch(() => this.child.kill('SIGKILL'));
    await exited;
    clearTimeout(timer);
  }

  private receive(text: string) {
    this.buffer += text;
    let end: number;
    while ((end = this.buffer.indexOf('\0')) !== -1) {
      const raw = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 1);
      this.dispatch(JSON.parse(raw) as Message);
    }
  }

  private dispatch(message: Message) {
    if (message.id !== undefined) {
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) pending?.reject(new Error(`CDP ${message.error.message}`));
      else pending?.resolve(message.result ?? {});
      return;
    }
    if (message.method) {
      for (const listener of this.listeners.get(message.method) ?? []) {
        listener(message.params ?? {}, message.sessionId);
      }
    }
  }

  private fail(error: Error) {
    this.exitError ??= error;
    for (const pending of this.pending.values()) pending.reject(this.exitError);
    this.pending.clear();
  }
}

interface Message {
  readonly id?: number;
  readonly method?: string;
  readonly params?: Params;
  readonly result?: Params;
  readonly error?: { readonly message: string };
  readonly sessionId?: string;
}
