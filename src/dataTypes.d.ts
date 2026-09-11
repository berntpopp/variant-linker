/** Extensible JSON payloads from Ensembl and user annotation sources. */
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface Transcript {
  [key: string]: unknown;
  gene_symbol?: string;
  gene_id?: string;
  transcript_id?: string;
  consequence_terms?: string[];
  impact?: string;
  biotype?: string;
  canonical?: number;
  mane_select?: string;
  mane_plus_clinical?: string;
  hgvsc?: string;
  hgvsp?: string;
  variant_allele?: string;
  strand?: number;
}

export interface SampleMap {
  index?: string;
  proband?: string;
  mother?: string;
  father?: string;
}

export interface PedigreeMember {
  familyId?: string;
  fatherId?: string;
  motherId?: string;
  sex?: number | string;
  affectedStatus?: number | string;
}

export type Pedigree = Map<string, PedigreeMember>;

export interface CompoundHetResult {
  isCompHet: boolean;
  isPossible: boolean;
  pattern: string;
  variantKeys: string[];
  paternalVariantKeys: string[];
  maternalVariantKeys: string[];
  ambiguousVariantKeys: string[];
}

export interface CompoundHetDetails {
  isCandidate?: boolean;
  isPossible?: boolean;
  geneSymbol?: string;
  partnerVariantKeys?: string[];
  likelyPaternalKeys?: string[];
  likelyMaternalKeys?: string[];
  ambiguousKeys?: string[];
  error?: string;
}

export interface InheritanceResult {
  prioritizedPattern: string;
  possiblePatterns: string[];
  segregationStatus: Record<string, string>;
  compHetDetails?: CompoundHetDetails;
  compHetByGene?: Record<string, CompoundHetDetails>;
  error?: string;
}

export interface FeatureOverlap {
  [key: string]: unknown;
  type: string;
  name?: string;
  identifier?: string;
  source: string;
  chrom?: string;
  region_start?: number;
  region_end?: number;
  score?: number;
  strand?: string;
  gene_source_type?: string;
}

export interface Annotation {
  [key: string]: unknown;
  variantKey?: string;
  originalVariantKey?: string;
  originalInput?: string;
  input?: string;
  vcfString?: string;
  seq_region_name?: string;
  chr?: string;
  start?: number | string;
  end?: number | string;
  allele_string?: string;
  most_severe_consequence?: string;
  transcript_consequences?: Transcript[];
  gene_symbol?: string;
  deducedInheritancePattern?: InheritanceResult | string;
  user_feature_overlap?: FeatureOverlap[];
}

export interface BedRegion {
  chrom: string;
  start: number;
  end: number;
  name: string;
  score: number | null;
  strand: string | null;
}

export interface RegionPayload {
  low: number;
  high: number;
  name: string;
  source: string;
  score: number | null;
  strand: string | null;
}

export interface GeneRecord {
  [key: string]: unknown;
  identifier: string;
  source: string;
  line?: number;
}

export interface GeneSource {
  [key: string]: unknown;
  source: string;
  type: string;
}

export interface Features {
  featuresByChrom: Record<string, import('node-interval-tree').default<RegionPayload>>;
  geneSets: Map<string, GeneSource[]>;
}

export interface FeatureParams {
  bedFile?: string[];
  geneList?: string[];
  jsonGenes?: string[];
  jsonGeneMapping?: string;
}

export interface GeneMapping {
  identifier: string;
  dataFields?: string[];
}

export interface OriginalVcfRecord {
  CHROM: string;
  POS: number;
  REF: string;
  ALT?: string[];
  ID?: string | string[] | null;
  QUAL?: number | null;
  FILTER?: string | string[] | null;
  INFO?: Record<string, unknown>;
}

/** Accept legacy caller-supplied map entries as well as full parser entries. */
export interface FormatterEntry {
  originalRecord: OriginalVcfRecord;
  alt: string;
  originalRecordId?: string;
  originalLine?: string;
  records?: FormatterEntry[];
}

export interface VcfAltData {
  annotations: Annotation[];
  originalInfo?: Record<string, unknown>;
  originalQual?: number | null;
  originalFilter?: string | string[] | null;
}

export interface VcfGroup {
  chrom: string;
  pos: number;
  ref: string;
  id: string;
  originalLine?: string;
  recordOrder?: number;
  alts: Map<string, VcfAltData>;
}
