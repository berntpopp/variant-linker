'use strict';
const { getDefaultColumnConfig } = require('./columns');

/** @typedef {{spreadsheetSafe?: boolean}} TabularOptions */

/**
 * TSV uses reversible backslash escapes for literal backslashes, tabs and newlines.
 * CSV uses quoted fields with doubled quotes. Spreadsheet protection is opt-in;
 * signed numbers and scientific notation retain their numeric representation.
 * @param {unknown} value
 * @param {string} delimiter
 * @param {TabularOptions} options
 * @returns {string}
 */
function serializeCell(value, delimiter, options) {
  let text =
    value === null || value === undefined
      ? ''
      : Array.isArray(value)
        ? value.join(';')
        : typeof value === 'object'
          ? JSON.stringify(value)
          : String(value);
  const numeric = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text.trim());
  if (options.spreadsheetSafe && /^\s*[=+@-]/.test(text) && !numeric) text = "'" + text;
  if (delimiter === '\t') {
    return text
      .replace(/\\/g, '\\\\')
      .replace(/\t/g, '\\t')
      .replace(/\r/g, '\\r')
      .replace(/\n/g, '\\n');
  }
  if (text.includes(delimiter) || /["\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/**
 * @param {Record<string,unknown>[]} flatRows
 * @param {import('../analysisTypes').Column[]} columnConfig
 * @param {string} delimiter
 * @param {boolean} [includeHeader]
 * @param {TabularOptions} [options]
 * @returns {string}
 */
function formatToTabular(
  flatRows,
  columnConfig = getDefaultColumnConfig(),
  delimiter = ',',
  includeHeader = true,
  options = {}
) {
  const headers = columnConfig.map((column) => column.header);
  const lines = includeHeader
    ? [headers.map((header) => serializeCell(header, delimiter, options)).join(delimiter)]
    : [];
  for (const row of Array.isArray(flatRows) ? flatRows : []) {
    lines.push(
      headers.map((header) => serializeCell(row[header], delimiter, options)).join(delimiter)
    );
  }
  return lines.join('\n');
}

module.exports = { formatToTabular };
