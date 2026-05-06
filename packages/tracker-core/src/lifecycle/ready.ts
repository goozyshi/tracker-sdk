export type ReadyCallback = () => void;

export class Lifecycle {
  private ready = false;
  private callbacks: ReadyCallback[] = [];

  isReady(): boolean {
    return this.ready;
  }

  onReady(cb: ReadyCallback): void {
    if (this.ready) {
      try {
        cb();
      } catch {
        // 隔离
      }
      return;
    }
    this.callbacks.push(cb);
  }

  markReady(): void {
    if (this.ready) return;
    this.ready = true;
    const queue = this.callbacks.splice(0);
    for (const cb of queue) {
      try {
        cb();
      } catch {
        // 隔离
      }
    }
  }
}
