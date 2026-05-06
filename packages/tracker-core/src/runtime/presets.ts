import type { SystemContext } from '../types/event';
import { detectRuntime, type RuntimeKind } from './detect';

export interface PresetsReader {
  read(): SystemContext;
}

export function createPresetsReader(): PresetsReader {
  const runtime: RuntimeKind = detectRuntime();
  const staticPart = collectStatic(runtime);

  return {
    read() {
      return { ...staticPart, ...collectDynamic() };
    },
  };
}

function collectStatic(runtime: RuntimeKind): SystemContext {
  const out: SystemContext = { runtime };

  if (typeof screen !== 'undefined') {
    out.screenWidth = screen.width;
    out.screenHeight = screen.height;
  }
  out.timezoneOffset = new Date().getTimezoneOffset();

  return out;
}

function collectDynamic(): SystemContext {
  const out: SystemContext = {};

  if (typeof window !== 'undefined') {
    out.viewportWidth = window.innerWidth;
    out.viewportHeight = window.innerHeight;
  }
  if (typeof location !== 'undefined') {
    out.url = location.href;
  }
  if (typeof document !== 'undefined') {
    out.referrer = document.referrer;
    out.title = document.title;
  }
  if (typeof navigator !== 'undefined') {
    out.ua = navigator.userAgent;
  }

  return out;
}
