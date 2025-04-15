// src/schemaMapper.js
'use strict';

const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

/**
 * Maps the tool's output to a Schema.org compliant JSON structure.
 * @param {Object} output - The variant annotation output to transform
 * @returns {Object} A Schema.org compliant JSON structure for variant annotations
 */
function mapOutputToSchemaOrg(output) {
  // ... transform output as needed ...
  return output;
}

/**
 * Validates the output against the given JSON schema.
 *
 * @param {Object} output - The output to validate.
 * @param {string} schemaPath - Path to the JSON schema file.
 * @throws {Error} If validation fails.
 */
function validateSchemaOrgOutput(output, schemaPath) {
  const schema = require(schemaPath);
  const validate = ajv.compile(schema);
  const valid = validate(output);
  if (!valid) {
    throw new Error('Schema.org output validation failed: ' + ajv.errorsText(validate.errors));
  }
}

/**
 * Registers custom formats with the AJV instance.
 */
function addCustomFormats() {
  // Here you can add custom format definitions if needed.
  // For example, if the "date-time" format is not recognized,
  // you can define it explicitly (though ajv-formats should already do this).
  ajv.addFormat('date-time', {
    type: 'string',
    validate: (dateTimeString) => {
      // Simple validation: try to parse as Date and ensure it's valid.
      const d = new Date(dateTimeString);
      return !isNaN(d.valueOf());
    },
  });
}

module.exports = { mapOutputToSchemaOrg, validateSchemaOrgOutput, addCustomFormats };
