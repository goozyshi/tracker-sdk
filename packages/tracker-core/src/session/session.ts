import { uuidV4 } from "@goozyshi/tracker-shared";
import type { KVStorage } from "../storage/index";

export type SessionRotateReason =
  | "init"
  | "timeout"
  | "cross_day"
  | "identity_change"
  | "manual";

export interface SessionChangeEvent {
  sessionId: string;
  previous: string | null;
  reason: SessionRotateReason;
}

export type SessionChangeHandler = (event: SessionChangeEvent) => void;

export interface SessionManagerOptions {
  storage: KVStorage;
  storageKeyPrefix: string;
  sessionTimeout: number;
}

export class SessionManager {
  private storage: KVStorage;
  private idKey: string;
  private lastActiveKey: string;
  private timeout: number;
  private sessionId: string;
  private lastActive: number;
  private listeners = new Set<SessionChangeHandler>();
  private offStorageChange: (() => void) | null = null;

  constructor(options: SessionManagerOptions) {
    this.storage = options.storage;
    this.idKey = `${options.storageKeyPrefix}:session:id`;
    this.lastActiveKey = `${options.storageKeyPrefix}:session:last_active`;
    this.timeout = options.sessionTimeout;

    const loaded = this.loadOrCreate();
    this.sessionId = loaded.sessionId;
    this.lastActive = loaded.lastActive;

    if (this.storage.onChange) {
      this.offStorageChange = this.storage.onChange((key, value) => {
        if (key === this.idKey && value && value !== this.sessionId) {
          const previous = this.sessionId;
          this.sessionId = value;
          this.emit({ sessionId: value, previous, reason: "manual" });
        } else if (key === this.lastActiveKey && value) {
          const ts = Number(value);
          if (Number.isFinite(ts)) this.lastActive = ts;
        }
      });
    }
  }

  getSessionId(): string {
    return this.sessionId;
  }

  touch(now: number = Date.now()): void {
    if (this.shouldRotate(now)) {
      this.rotate(
        now < this.lastActive ? "manual" : this.detectReason(now),
        now
      );
      return;
    }
    this.lastActive = now;
    this.persistLastActive();
  }

  rotate(reason: SessionRotateReason, now: number = Date.now()): void {
    const previous = this.sessionId;
    this.sessionId = uuidV4();
    this.lastActive = now;
    this.persistAll();
    this.emit({ sessionId: this.sessionId, previous, reason });
  }

  subscribe(handler: SessionChangeHandler): () => void {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  destroy(): void {
    this.listeners.clear();
    this.offStorageChange?.();
    this.offStorageChange = null;
  }

  private shouldRotate(now: number): boolean {
    if (now - this.lastActive >= this.timeout) return true;
    return this.isCrossDay(this.lastActive, now);
  }

  private detectReason(now: number): SessionRotateReason {
    if (this.isCrossDay(this.lastActive, now)) return "cross_day";
    return "timeout";
  }

  private isCrossDay(prev: number, next: number): boolean {
    if (prev <= 0) return false;
    return new Date(prev).toDateString() !== new Date(next).toDateString();
  }

  private loadOrCreate(): { sessionId: string; lastActive: number } {
    const existingId = this.storage.get(this.idKey);
    const existingActive = Number(this.storage.get(this.lastActiveKey) ?? "");
    const now = Date.now();

    if (
      existingId &&
      Number.isFinite(existingActive) &&
      existingActive > 0 &&
      now - existingActive < this.timeout &&
      !this.isCrossDay(existingActive, now)
    ) {
      return { sessionId: existingId, lastActive: existingActive };
    }

    const id = uuidV4();
    this.storage.set(this.idKey, id);
    this.storage.set(this.lastActiveKey, String(now));
    return { sessionId: id, lastActive: now };
  }

  private persistLastActive(): void {
    this.storage.set(this.lastActiveKey, String(this.lastActive));
  }

  private persistAll(): void {
    this.storage.set(this.idKey, this.sessionId);
    this.storage.set(this.lastActiveKey, String(this.lastActive));
  }

  private emit(event: SessionChangeEvent): void {
    this.listeners.forEach((cb) => {
      try {
        cb(event);
      } catch {
        // 隔离
      }
    });
  }
}
