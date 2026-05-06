export type TransportChannel = 'beacon' | 'fetch' | 'image' | 'xhr';

export interface TransportRequest {
  url: string;
  body: unknown;
  headers?: Record<string, string>;
  credentials?: RequestCredentials;
  timeout?: number;
  method?: 'POST' | 'GET';
}

const BEACON_MAX = 60 * 1024;
const FETCH_KEEPALIVE_MAX = 64 * 1024;
const IMAGE_URL_MAX = 2000;

function serialize(body: unknown): string {
  if (typeof body === 'string') return body;
  return JSON.stringify(body ?? {});
}

function sendByBeacon(req: TransportRequest): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') {
      return reject(new Error('beacon unsupported'));
    }
    const payload = serialize(req.body);
    if (payload.length > BEACON_MAX) return reject(new Error('beacon payload too large'));

    const blob = new Blob([payload], { type: 'application/json' });
    const ok = navigator.sendBeacon(req.url, blob);
    return ok ? resolve() : reject(new Error('beacon enqueue failed'));
  });
}

async function sendByFetch(req: TransportRequest): Promise<void> {
  if (typeof fetch !== 'function') throw new Error('fetch unsupported');

  const payload = serialize(req.body);
  const keepalive = payload.length <= FETCH_KEEPALIVE_MAX;

  const controller =
    typeof AbortController !== 'undefined' && req.timeout ? new AbortController() : null;
  const timer =
    controller && req.timeout ? setTimeout(() => controller.abort(), req.timeout) : null;

  try {
    const res = await fetch(req.url, {
      method: req.method ?? 'POST',
      headers: { 'Content-Type': 'application/json', ...req.headers },
      body: payload,
      credentials: req.credentials,
      keepalive,
      signal: controller?.signal,
    });
    if (!res.ok) throw new Error(`fetch ${res.status}`);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function sendByImage(req: TransportRequest): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof Image === 'undefined') return reject(new Error('image unsupported'));

    const payload = serialize(req.body);
    const sep = req.url.includes('?') ? '&' : '?';
    const url = `${req.url}${sep}d=${encodeURIComponent(payload)}`;
    if (url.length > IMAGE_URL_MAX) return reject(new Error('image url too long'));

    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('image load failed'));
    img.src = url;
  });
}

function sendByXhr(req: TransportRequest): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof XMLHttpRequest === 'undefined') return reject(new Error('xhr unsupported'));

    const xhr = new XMLHttpRequest();
    xhr.open(req.method ?? 'POST', req.url, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    if (req.headers) {
      for (const [k, v] of Object.entries(req.headers)) xhr.setRequestHeader(k, v);
    }
    if (req.credentials === 'include') xhr.withCredentials = true;
    if (req.timeout) xhr.timeout = req.timeout;

    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`xhr ${xhr.status}`));
    xhr.onerror = () => reject(new Error('xhr error'));
    xhr.ontimeout = () => reject(new Error('xhr timeout'));
    xhr.send(serialize(req.body));
  });
}

const SYNC_ORDER: TransportChannel[] = ['beacon', 'fetch', 'image'];
const ASYNC_ORDER: TransportChannel[] = ['fetch', 'beacon', 'image', 'xhr'];

function resolveOrder(enabled: TransportChannel[], sync: boolean): TransportChannel[] {
  const pref = sync ? SYNC_ORDER : ASYNC_ORDER;
  const set = new Set(enabled);
  return pref.filter((c) => set.has(c));
}

export type TransportRequestInput =
  | TransportRequest
  | ((channel: TransportChannel) => TransportRequest);

export async function transport(
  input: TransportRequestInput,
  channels: TransportChannel[],
  sync: boolean
): Promise<TransportChannel> {
  const order = resolveOrder(channels, sync);
  const getReq = typeof input === 'function' ? input : () => input;
  let lastErr: Error | null = null;

  for (const ch of order) {
    try {
      const req = getReq(ch);
      if (ch === 'beacon') await sendByBeacon(req);
      else if (ch === 'fetch') await sendByFetch(req);
      else if (ch === 'image') await sendByImage(req);
      else await sendByXhr(req);
      return ch;
    } catch (err) {
      lastErr = err as Error;
    }
  }
  throw lastErr ?? new Error('all transports failed');
}
