import { sleep } from "@goozyshi/tracker-shared";

export interface RetryOptions {
  max: number;
  baseDelay: number;
}

const NON_RETRIABLE_TOKENS = ["too large", "too long", "unsupported"];

export function isNetworkRetriable(err: Error): boolean {
  const msg = err.message.toLowerCase();
  if (NON_RETRIABLE_TOKENS.some((t) => msg.includes(t))) return false;
  if (/\b4\d{2}\b/.test(msg)) return false;
  return true;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
  isRetriable: (err: Error) => boolean = isNetworkRetriable
): Promise<T> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < options.max; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err as Error;
      if (!isRetriable(lastErr)) throw lastErr;
      if (attempt < options.max - 1) {
        await sleep(options.baseDelay * 2 ** attempt);
      }
    }
  }
  throw lastErr ?? new Error("retry exhausted");
}
