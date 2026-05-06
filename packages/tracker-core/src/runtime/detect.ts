export type RuntimeKind = 'webview' | 'browser';

const WEBVIEW_UA_TOKENS = [
  'micojsbridge',
  'mico-webview',
  'bytedance',
  'jsbridge',
  'wkwebview',
  'webviewbridge',
];

export function detectRuntime(): RuntimeKind {
  if (typeof window === 'undefined') return 'browser';

  if ((window as unknown as Record<string, unknown>).JSBridge != null) return 'webview';

  const ua =
    typeof navigator !== 'undefined' && typeof navigator.userAgent === 'string'
      ? navigator.userAgent.toLowerCase()
      : '';
  if (ua && WEBVIEW_UA_TOKENS.some((token) => ua.includes(token))) return 'webview';

  return 'browser';
}
