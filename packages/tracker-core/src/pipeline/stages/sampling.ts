import type { PipelineState } from '../state';

export type SamplingStage = (state: PipelineState) => PipelineState | null;

export function createSamplingStage(sampleRate: number): SamplingStage {
  return (state) => {
    if (sampleRate >= 1) return state;
    if (sampleRate <= 0) return null;
    if (!state.envelope) return state;
    const seed = stableHash(`${state.envelope.identity.anonymousId}:${state.envelope.event}`);
    return seed < sampleRate ? state : null;
  };
}

function stableHash(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) / 0x7fffffff;
}
