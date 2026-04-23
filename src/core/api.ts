import { tracker } from './tracker';
import type { EventName, SendEventOptions } from './types';

export function sendEvent(
  event: EventName,
  data?: Record<string, any>,
  options?: SendEventOptions
): void {
  tracker.track(event, data, options);
}
