import { tracker } from './tracker';
import type { SendEventOptions } from './types';

export function sendEvent(
  event: string, 
  data?: Record<string, any>,
  options?: SendEventOptions
): void {
  const finalData = options?.reporters 
    ? { ...data, _reporters: options.reporters }
    : data;
  tracker.track(event, finalData);
}
