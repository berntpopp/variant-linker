'use strict';
const { isRecord } = require('./input');
/** @param {string} input */
function normalizeInput(input) {
  return input.trim().replace(/\s+/g, ' ');
}
/** Align verified response objects by echoed identity, preserving explicit missing outcomes.
 * @param {unknown} responses @param {string[]} inputs @param {boolean} [recoder]
 * @returns {import('../dataTypes').Annotation[]}
 */
function alignResponses(responses, inputs, recoder = false) {
  if (!Array.isArray(responses)) throw new Error('API response must be an array');
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const input of inputs)
    counts.set(normalizeInput(input), (counts.get(normalizeInput(input)) || 0) + 1);
  /** @type {Map<string, import('../dataTypes').Annotation[]>} */
  const byInput = new Map();
  for (const response of responses) {
    if (!isRecord(response)) throw new Error('API response must contain objects');
    let input = response.input;
    if (typeof input !== 'string' && recoder) {
      const echoed = Object.values(response)
        .filter(isRecord)
        .map((entry) => entry.input)
        .filter((entry) => typeof entry === 'string');
      if (new Set(echoed).size > 1)
        throw new Error('Recoder response contains conflicting input identities');
      input = echoed[0];
    }
    // A single submitted input has no positional ambiguity even if legacy responses omit the echo.
    if (input === undefined && inputs.length === 1 && responses.length === 1) input = inputs[0];
    if (typeof input !== 'string' || !counts.has(normalizeInput(input)))
      throw new Error('API response has an unknown or missing input identity');
    const key = normalizeInput(input);
    const entries = byInput.get(key) || [];
    if (entries.length >= (counts.get(key) || 0))
      throw new Error('API response contains a duplicate input identity');
    entries.push(/** @type {import('../dataTypes').Annotation} */ (response));
    byInput.set(key, entries);
  }
  return inputs.map(
    (input) =>
      byInput.get(normalizeInput(input))?.shift() || {
        input,
        error: 'No annotation returned for this input',
        transcript_consequences: [],
      }
  );
}
module.exports = { alignResponses };
