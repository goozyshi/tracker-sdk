export type EventBusHandler<T> = (data: T) => void;

export class EventBus<T = unknown> {
  private map = new Map<string, Set<EventBusHandler<T>>>();

  on(key: string, handler: EventBusHandler<T>): () => void {
    let set = this.map.get(key);
    if (!set) {
      set = new Set();
      this.map.set(key, set);
    }
    set.add(handler);
    return () => set?.delete(handler);
  }

  emit(key: string, data: T): void {
    const set = this.map.get(key);
    if (!set) return;
    for (const h of set) {
      try {
        h(data);
      } catch {
        // 隔离
      }
    }
  }

  destroy(): void {
    this.map.clear();
  }
}
