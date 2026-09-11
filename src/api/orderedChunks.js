'use strict';
const { abortable } = require('./requestContext');
const apiConfig = require('../../config/apiConfig.json');

/** Ordered bounded workers for Ensembl POST endpoints (maximum 200 inputs).
 * Scheduling stops on the first failure; siblings receive its abort reason.
 * @template Input, Output
 * @param {Input[]} inputs
 * @param {(chunk: Input[], index: number, signal: AbortSignal) => Promise<Output[]>} run
 * @param {{chunkSize?: number, concurrency?: number, signal?: AbortSignal}} [options]
 * @returns {Promise<Output[]>}
 */
async function orderedChunks(inputs, run, options = {}) {
  const maxSize = apiConfig.ensembl.maxPostSize;
  const maxConcurrency = apiConfig.requests.maxPostConcurrency;
  if (!Number.isSafeInteger(maxSize) || maxSize < 1)
    throw new Error('maxPostSize must be a positive integer');
  if (!Number.isSafeInteger(maxConcurrency) || maxConcurrency < 1)
    throw new Error('maxPostConcurrency must be a positive integer');
  const size = options.chunkSize ?? maxSize;
  const concurrency = options.concurrency ?? apiConfig.requests.postConcurrency;
  if (!Number.isInteger(size) || size < 1 || size > maxSize)
    throw new Error(`chunkSize must be an integer between 1 and ${maxSize}`);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > maxConcurrency)
    throw new Error(`concurrency must be an integer between 1 and ${maxConcurrency}`);
  options.signal?.throwIfAborted();
  const controller = new AbortController();
  const cancel = () => controller.abort(options.signal?.reason || new Error('Request cancelled'));
  options.signal?.addEventListener('abort', cancel, { once: true });
  const count = Math.ceil(inputs.length / size);
  /** @type {Output[][]} */
  const results = new Array(count);
  let next = 0;
  async function worker() {
    try {
      while (next < count) {
        controller.signal.throwIfAborted();
        const index = next++;
        results[index] = await abortable(
          run(inputs.slice(index * size, (index + 1) * size), index, controller.signal),
          controller.signal
        );
      }
    } catch (error) {
      if (!controller.signal.aborted) controller.abort(error);
      throw error;
    }
  }
  try {
    await Promise.allSettled(Array.from({ length: Math.min(concurrency, count) }, worker));
    controller.signal.throwIfAborted();
    return results.flat();
  } finally {
    options.signal?.removeEventListener('abort', cancel);
  }
}

module.exports = { orderedChunks };
