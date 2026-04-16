import { tracker } from './tracker';
import type { SendEventOptions, EventName } from './types';

export function sendEvent(
  event: EventName,
  data?: Record<string, any>,
  options?: SendEventOptions
): void {
  const finalData = options?.reporters 
    ? { ...data, _reporters: options.reporters }
    : data;
  tracker.track(event, finalData);
}
