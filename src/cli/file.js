'use strict';
const fs = require('fs');
const { analyzeVariant } = require('../variantLinkerCore');
const { readVariantsFromVcf } = require('../vcfReader');
const { readPedigree } = require('../pedReader');
const { loadFeatures } = require('../featureParser');
const { parseOptionalParameters, readVariantsFromFile } = require('./helpers');
const { writeOutput } = require('./write');
const { filterAndFormatResults } = require('../variantLinkerProcessor');

/** @param {string|undefined} value @returns {import('../dataTypes').SampleMap|null} */
function parseSampleMap(value) {
  if (!value) return null;
  const ids = value.split(',').map((id) => id.trim());
  if (ids.length !== 3 || ids.some((id) => !id) || new Set(ids).size !== 3) {
    throw new Error('sample-map must contain three distinct IDs: Index,Mother,Father');
  }
  return { index: ids[0], mother: ids[1], father: ids[2] };
}

/** @param {import('../analysisTypes').CliParams} params */
async function processFileBased(params) {
  const recoderOptions = parseOptionalParameters(params.recoder_params, { vcf_string: '1' });
  const vepOptions = parseOptionalParameters(params.vep_params, {
    CADD: '1',
    hgvs: '1',
    merged: '1',
    mane: '1',
  });
  if (params.pickOutput) vepOptions.pick = '1';
  const vcf =
    typeof params.vcfInput === 'string' ? await readVariantsFromVcf(params.vcfInput) : null;
  const variants = vcf
    ? vcf.variantsToProcess
    : params.variant
      ? [params.variant]
      : params.variants
        ? params.variants
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean)
        : params.variantsFile
          ? readVariantsFromFile(params.variantsFile)
          : [];
  const pedigreeData = params.ped ? await readPedigree(params.ped) : null;
  const sampleMap = parseSampleMap(params.sampleMap);
  const features =
    params.bedFile || params.geneList || params.jsonGenes ? await loadFeatures(params) : null;
  const calculateInheritance =
    params.calculateInheritance ?? Boolean(pedigreeData || (vcf && vcf.samples.length > 1));
  const result = await analyzeVariant({
    ...params,
    variants,
    recoderOptions,
    vepOptions,
    pedigreeData,
    sampleMap,
    features,
    calculateInheritance,
    vcfRecordMap: vcf?.vcfRecordMap,
    vcfHeaderLines: vcf?.headerLines,
    samples: vcf?.samples,
    scoringConfigPath: params.scoring_config_path || params.scoringConfigPath,
    output: 'JSON',
    filter: undefined,
    pickOutput: false,
  });
  if (typeof result === 'string') throw new Error('Unexpected serialized analysis result');
  const content = filterAndFormatResults(
    result,
    params.filter ? JSON.parse(params.filter) : null,
    params.output,
    { ...params, variants: undefined, sampleMap: undefined, isStreaming: false }
  );
  if (typeof content !== 'string') throw new Error('Expected complete formatted output');
  const savePath = params.save || params.outputFile;
  if (savePath) {
    await fs.promises.writeFile(savePath, content);
    console.error('Results saved to ' + savePath);
  } else {
    await writeOutput(content + '\n');
  }
  if (
    result.annotationData.some((annotation) => annotation.error) ||
    Object.values(result.meta.liftoverMeta || {}).some((entry) => entry.status !== 'success')
  ) {
    process.exitCode = 1;
  }
}
module.exports = { processFileBased, parseSampleMap };
