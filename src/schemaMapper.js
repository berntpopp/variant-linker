'use strict';
const Ajv = require('ajv').default;
const addFormats = require('ajv-formats').default;
const schema = require('../schema/variant_annotation.schema.json');
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

/** Add a JSON-LD Dataset envelope while retaining the versioned annotation payload.
 * @template {object} T @param {T} output */
function mapOutputToSchemaOrg(output) {
  return {
    ...output,
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: 'Genetic Variant Annotation Dataset',
    schemaVersion: '1',
  };
}
/** @param {unknown} output @param {string} [schemaPath] */
function validateSchemaOrgOutput(output, schemaPath) {
  void schemaPath; // Compatibility argument: the bundled schema is authoritative.
  if (!validate(output)) {
    throw new Error('Schema.org output validation failed: ' + ajv.errorsText(validate.errors));
  }
}
/** Compatibility hook: standard formats are registered once during initialization. */
function addCustomFormats() {}
module.exports = { mapOutputToSchemaOrg, validateSchemaOrgOutput, addCustomFormats };
