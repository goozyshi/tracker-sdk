import { uuidV4 } from "@goozyshi/tracker-shared";
import type { KVStorage } from "../storage/index";

export type IdentityChangeReason =
  | "init"
  | "identify"
  | "reset"
  | "storage_sync";

export interface IdentitySnapshot {
  anonymousId: string;
  userId: string | null;
}

export interface IdentityChangeEvent extends IdentitySnapshot {
  previous: IdentitySnapshot;
  reason: IdentityChangeReason;
}

export type IdentityChangeHandler = (event: IdentityChangeEvent) => void;

export interface IDMOptions {
  storage: KVStorage;
  storageKeyPrefix: string;
}

export class IDM {
  private storage: KVStorage;
  private anonKey: string;
  private userKey: string;
  private anonymousId: string;
  private userId: string | null;
  private locked = false;
  private listeners = new Set<IdentityChangeHandler>();
  private offStorageChange: (() => void) | null = null;

  constructor(options: IDMOptions) {
    this.storage = options.storage;
    this.anonKey = `${options.storageKeyPrefix}:idm:anonymous_id`;
    this.userKey = `${options.storageKeyPrefix}:idm:user_id`;
    this.anonymousId = this.loadOrCreateAnonymousId();
    this.userId = this.loadUserId();

    if (this.storage.onChange) {
      this.offStorageChange = this.storage.onChange((key, value) => {
        if (key === this.anonKey && value && value !== this.anonymousId) {
          this.replace(
            { anonymousId: value, userId: this.userId },
            "storage_sync"
          );
        } else if (key === this.userKey && value !== this.userId) {
          this.replace(
            { anonymousId: this.anonymousId, userId: value },
            "storage_sync"
          );
        }
      });
    }
  }

  getAnonymousId(): string {
    return this.anonymousId;
  }

  getUserId(): string | null {
    return this.userId;
  }

  snapshot(): IdentitySnapshot {
    return { anonymousId: this.anonymousId, userId: this.userId };
  }

  isLockedByProvider(): boolean {
    return this.locked;
  }

  lockByProvider(): void {
    this.locked = true;
  }

  identify(
    userId: string | null,
    reason: IdentityChangeReason = "identify"
  ): boolean {
    if (this.locked && reason === "identify") return false;
    if (this.userId === userId) return false;
    const previous = this.snapshot();
    this.userId = userId;
    this.persistUserId();
    this.emit({ ...this.snapshot(), previous, reason });
    return true;
  }

  reset(): void {
    if (this.userId == null) return;
    const previous = this.snapshot();
    this.userId = null;
    this.persistUserId();
    this.emit({ ...this.snapshot(), previous, reason: "reset" });
  }

  onChange(handler: IdentityChangeHandler): () => void {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  destroy(): void {
    this.listeners.clear();
    this.offStorageChange?.();
    this.offStorageChange = null;
  }

  private loadOrCreateAnonymousId(): string {
    const existing = this.storage.get(this.anonKey);
    if (existing) return existing;
    const id = uuidV4();
    this.storage.set(this.anonKey, id);
    return id;
  }

  private loadUserId(): string | null {
    return this.storage.get(this.userKey);
  }

  private persistUserId(): void {
    if (this.userId == null) this.storage.remove(this.userKey);
    else this.storage.set(this.userKey, this.userId);
  }

  private replace(next: IdentitySnapshot, reason: IdentityChangeReason): void {
    const previous = this.snapshot();
    this.anonymousId = next.anonymousId;
    this.userId = next.userId;
    this.emit({ ...this.snapshot(), previous, reason });
  }

  private emit(event: IdentityChangeEvent): void {
    this.listeners.forEach((cb) => {
      try {
        cb(event);
      } catch {
        // 隔离，避免阻断其他订阅者
      }
    });
  }
}
