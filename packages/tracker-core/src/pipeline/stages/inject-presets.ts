import type { PresetsReader } from '../../runtime/presets';
import type { PipelineState } from '../state';

export type InjectPresetsStage = (state: PipelineState) => PipelineState;

export function createInjectPresetsStage(reader: PresetsReader): InjectPresetsStage {
  return (state) => ({ ...state, system: reader.read() });
}
