import type { Annotation, Features, FeatureParams, Pedigree, SampleMap } from './dataTypes';
import type { ProxyConfig, RequestOptions } from './apiHelper';
import type { VcfEntry } from './vcfReader';

export interface Mapping {
  target?: string;
  aggregator?: string | null;
  condition?: string | null;
  default?: unknown;
}
export type VariableMappings = Record<string, string | Mapping>;
export interface ScopedVariables {
  aggregates?: VariableMappings;
  transcriptFields?: VariableMappings;
}
export interface ScoringConfig {
  variables: VariableMappings | ScopedVariables;
  formulas: {
    annotationLevel: Record<string, string>[];
    transcriptLevel: Record<string, string>[];
  };
}
export interface Column {
  header: string;
  path: string;
  isConsequenceLevel?: boolean;
  defaultValue?: unknown;
  formatter?: (value: unknown, annotation?: Annotation) => unknown;
}
export interface LiftoverMeta {
  status: string;
  message?: string;
  liftedVariant?: string;
  [key: string]: unknown;
}
export interface AnalysisParams extends FeatureParams {
  variant?: string;
  variants?: string[];
  vcfInput?: string | boolean;
  output?: string;
  filter?: string;
  pickOutput?: boolean;
  isStreaming?: boolean;
  cache?: boolean;
  recoderOptions?: Record<string, string | number | boolean>;
  vepOptions?: Record<string, string | number | boolean>;
  requestOptions?: RequestOptions;
  proxyConfig?: ProxyConfig | false | null;
  assembly?: string;
  calculateInheritance?: boolean;
  pedigreeData?: Pedigree | null;
  sampleMap?: SampleMap | null;
  vcfRecordMap?: Map<string, VcfEntry>;
  vcfHeaderLines?: string[];
  samples?: string[];
  features?: Features | null;
  scoringConfig?: ScoringConfig;
  scoringConfigPath?: string;
  scoring_config_path?: string;
  liftoverMeta?: Record<string, LiftoverMeta>;
  originalToLiftedMap?: Record<string, string>;
  _transcriptVersionFallback?: TranscriptFallback;
  columnConfig?: Column[];
  spreadsheetSafe?: boolean;
}
export interface TranscriptFallback {
  originalVariant: string;
  fallbackVariant: string;
  reason: string;
}
export interface ProcessingResult {
  annotationData: Annotation[];
  inputFormat?: string;
  variantData?: unknown;
  transcriptVersionFallback?: TranscriptFallback;
}
export interface Metadata {
  input: string | string[];
  inputFormat: string;
  recoderCalled: boolean;
  batchSize: number;
  stepsPerformed: string[];
  startTime: string;
  endTime: string;
  durationMs: number;
  batchProcessing: boolean;
  inheritanceCalculated: boolean;
  liftoverMeta?: Record<string, LiftoverMeta>;
  transcriptVersionFallback?: TranscriptFallback;
}
export interface AnalysisResult extends ProcessingResult {
  meta: Metadata;
  vcfRecordMap?: Map<string, VcfEntry>;
  vcfHeaderLines?: string[];
  pedigreeData?: Record<string, import('./dataTypes').PedigreeMember>;
}
export interface CliParams extends Omit<AnalysisParams, 'variants' | 'sampleMap'> {
  apiBaseUrl?: string;
  apiTimeout?: number;
  apiConcurrency?: 1 | 2;
  variants?: string;
  sampleMap?: string;
  output: string;
  config?: string;
  variantsFile?: string;
  save?: string;
  outputFile?: string;
  debug?: number;
  log_file?: string;
  recoder_params?: string;
  vep_params?: string;
  ped?: string;
  chunkSize?: number;
  stream?: boolean;
  proxy?: string;
  proxyAuth?: string;
  help?: boolean;
  version?: boolean;
  semver?: boolean;
}
export interface StreamParams extends Omit<CliParams, 'variants' | 'sampleMap'> {
  variants?: string[];
  sampleMap?: SampleMap | null;
  output: string;
  isStreaming: true;
  streamState: { failed: number };
  columnConfig: Column[];
  destination?: import('stream').Writable;
}
