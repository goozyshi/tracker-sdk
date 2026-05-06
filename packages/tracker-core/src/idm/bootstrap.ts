import type { JSONObject } from "@goozyshi/tracker-shared";
import type { ResolvedIDMConfig, TrackerErrorHandler } from "../types/config";
import type { IDM } from "./idm";

export interface BootstrapDeps {
  idm: IDM;
  idmConfig: ResolvedIDMConfig;
  register: (props: JSONObject) => void;
  onError: TrackerErrorHandler;
}

export async function bootstrapIDM(deps: BootstrapDeps): Promise<void> {
  const { idm, idmConfig, register, onError } = deps;
  const tasks: Promise<void>[] = [];

  if (idmConfig.userIdProvider) {
    const provider = idmConfig.userIdProvider;
    tasks.push(
      raceWithTimeout(
        Promise.resolve().then(() => provider()),
        idmConfig.providerTimeout,
        "userIdProvider"
      )
        .then((result) => {
          idm.identify(result?.userId ?? null, "identify");
          idm.lockByProvider();
        })
        .catch((err: Error) => {
          onError(err, "provider_failed", { provider: "userIdProvider" });
        })
    );
  }

  if (idmConfig.superPropertiesProvider) {
    const provider = idmConfig.superPropertiesProvider;
    tasks.push(
      raceWithTimeout(
        Promise.resolve().then(() => provider()),
        idmConfig.providerTimeout,
        "superPropertiesProvider"
      )
        .then((props) => {
          if (props && typeof props === "object") register(props);
        })
        .catch((err: Error) => {
          onError(err, "provider_failed", {
            provider: "superPropertiesProvider",
          });
        })
    );
  }

  await Promise.allSettled(tasks);
}

function raceWithTimeout<T>(
  p: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timeout after ${ms}ms`)),
      ms
    );
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}
