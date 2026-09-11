'use strict';
/** Wait for consumption before reading another chunk, including slow pipes.
 * @param {string} content @param {import('stream').Writable} [output]
 * @returns {Promise<void>} */
function writeOutput(content, output = process.stdout) {
  return new Promise((resolve, reject) => {
    const onError = (/** @type {Error} */ error) => reject(error);
    output.once('error', onError);
    output.write(content, (error) => {
      if (error) {
        // The stream emits its error after the write callback.
        reject(error);
      } else {
        output.removeListener('error', onError);
        resolve();
      }
    });
  });
}
module.exports = { writeOutput };
