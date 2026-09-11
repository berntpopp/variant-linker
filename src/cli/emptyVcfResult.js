'use strict';
/** Retain valid reference-only/header-only VCFs without sending an empty API request.
 * @param {Pick<import('../analysisTypes').AnalysisParams,'vcfRecordMap'|'vcfHeaderLines'>} source
 * @returns {import('../analysisTypes').AnalysisResult}
 */
function emptyVcfResult(source) {
  const timestamp = new Date().toISOString();
  return {
    annotationData: [],
    vcfRecordMap: source.vcfRecordMap,
    vcfHeaderLines: source.vcfHeaderLines,
    meta: {
      input: [],
      inputFormat: 'VCF',
      recoderCalled: false,
      batchSize: 0,
      stepsPerformed: ['Retained original VCF records without annotatable ALT alleles.'],
      startTime: timestamp,
      endTime: timestamp,
      durationMs: 0,
      batchProcessing: true,
      inheritanceCalculated: false,
    },
  };
}
module.exports = { emptyVcfResult };
