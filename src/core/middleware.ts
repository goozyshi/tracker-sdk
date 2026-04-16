import type { Middleware, DataProvider } from './types';

export const withGlobalData = (provider: DataProvider): Middleware =>
  (ctx, next) => {
    const extra = typeof provider === 'function' ? provider() : provider;
    Object.assign(ctx.data, extra);
    next();
  };

export const withTransformer = (fn: (data: any) => any): Middleware =>
  (ctx, next) => {
    ctx.data = fn(ctx.data);
    next();
  };

export const withFilter = (predicate: (event: string, data: any) => boolean): Middleware =>
  (ctx, next) => {
    if (predicate(ctx.event, ctx.data)) next();
  };
