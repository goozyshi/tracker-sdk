import type { JSONObject } from "@goozyshi/tracker-shared";
import type { PresetsReader } from "../runtime/presets";
import type { ResolvedPipelineConfig } from "../types/config";
import type {
  EventApp,
  EventEnvelope,
  EventIdentity,
  RawEvent,
} from "../types/event";
import { createInjectIdentityStage } from "./stages/inject-identity";
import { createInjectPresetsStage } from "./stages/inject-presets";
import { createMergeSuperPropertiesStage } from "./stages/merge-super-properties";
import { createSamplingStage } from "./stages/sampling";
import { createSanitizeStage } from "./stages/sanitize";
import { createTrimStage } from "./stages/trim";
import { createInitialState } from "./state";

export interface PipelineOptions {
  presetsReader: PresetsReader;
  superPropertiesGetter: () => JSONObject;
  identityGetter: () => EventIdentity;
  app: EventApp;
  config: ResolvedPipelineConfig;
}

export class Pipeline {
  private injectPresets;
  private mergeSuper;
  private injectIdentity;
  private sampling;
  private sanitize;
  private trim;

  constructor(options: PipelineOptions) {
    this.injectPresets = createInjectPresetsStage(options.presetsReader);
    this.mergeSuper = createMergeSuperPropertiesStage(
      options.superPropertiesGetter
    );
    this.injectIdentity = createInjectIdentityStage({
      identityGetter: options.identityGetter,
      app: options.app,
    });
    this.sampling = createSamplingStage(options.config.sampleRate);
    this.sanitize = createSanitizeStage(options.config.sanitizeFieldBlacklist);
    this.trim = createTrimStage(options.config.trim);
  }

  process(raw: RawEvent): EventEnvelope | null {
    let state = createInitialState(raw);
    state = this.injectPresets(state);
    state = this.mergeSuper(state);
    state = this.injectIdentity(state);
    const sampled = this.sampling(state);
    if (!sampled) return null;
    state = this.sanitize(sampled);
    state = this.trim(state);
    return state.envelope;
  }
}
