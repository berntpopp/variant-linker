const axios = require('axios');
const debug = require('debug')('variant-linker:variantRecoder');

async function variantRecoder(variant) {
  try {
    debug(`Requesting Variant Recoder for variant: ${variant}`);
    const response = await axios.get(`https://rest.ensembl.org/variant_recoder/human/${variant}?content-type=application/json`);
    debug(`Response received: ${JSON.stringify(response.data)}`);
    return response.data;
  } catch (error) {
    debug(`Error in variantRecoder: ${error.message}`);
    throw error; // Rethrow the error after logging
  }
}

module.exports = variantRecoder;
