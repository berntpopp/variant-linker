# Variant-Linker: Source Code Overview

This directory contains the core scripts of the Variant-Linker tool. Each script is responsible for a specific part of the functionality. Below is an overview of each script and how they work together.

## Scripts Overview

### main.js

The entry point of the Variant-Linker CLI tool. This script sets up command-line arguments, orchestrates the variant analysis process, and handles output.

- **Functionality**:
  - Sets up command-line arguments using `yargs`.
  - Enables debug mode with multiple levels (`basic`, `detailed`, `all`).
  - Orchestrates the process by calling `processVariantLinking`, `filterAndFormatResults`, and `outputResults`.

### variantRecoder.js

Handles the API call to the Variant Recoder. It fetches the recoded information of a given genetic variant.

- **Functionality**:
  - Sends a request to the Variant Recoder API.
  - Logs the request and response at different debug levels.
  - Returns the recoded variant information, including VCF string.

### vepRegionsAnnotation.js

Handles the API call to VEP (Variant Effect Predictor) using genomic coordinates. It retrieves VEP annotations for a given region and allele.

- **Functionality**:
  - Sends a request to the VEP API using the region endpoint.
  - Logs the request and response at different debug levels.
  - Returns the annotation data.

### vepHgvsAnnotation.js

Handles the API call to VEP (Variant Effect Predictor) using HGVS notation. It retrieves VEP annotations for a given HGVS notation.

- **Functionality**:
  - Sends a request to the VEP API using the HGVS endpoint.
  - Logs the request and response at different debug levels.
  - Returns the annotation data.

### convertVcfToEnsemblFormat.js

Converts VCF notation to Ensembl region and allele format required by the VEP API.

- **Functionality**:
  - Parses the VCF string.
  - Converts it to the Ensembl format.
  - Logs the conversion process at different debug levels.
  - Returns the region and allele.

### scoring.js

Handles the application of scoring algorithms based on VEP annotations with clarified variable scoping.

- **Functionality**:
  - Reads and parses scoring configuration files with support for both legacy and scoped formats.
  - Implements transcript prioritization (pick > MANE > canonical > first) for annotation-level scoring.
  - For annotation-level formulas: uses globally aggregated variables for variant-wide fields and prioritized transcript data for transcript-specific fields.
  - For transcript-level formulas: uses globally aggregated variables for variant-wide fields and individual transcript data for transcript-specific fields.
  - Extracts variables and calculates scores with context-aware variable scoping.
  - Logs the process at different debug levels.

### variantLinkerProcessor.js

Processes the linking between variant recoding and VEP annotations, filters, formats, and outputs the results.

- **Functionality**:
  - Processes variant linking by obtaining data from `variantRecoder` and `vepRegionsAnnotation`.
  - Filters and formats the results based on user input.
  - Outputs the results to either the console or a file.

## How They Work Together

1. **main.js**:
   - Sets up the CLI and parses arguments.
   - Detects input format (VCF or HGVS).
   - Calls `processVariantLinking` with the provided variant, which internally calls `variantRecoder`, `vepRegionsAnnotation`, and `vepHgvsAnnotation`.
   - Calls `filterAndFormatResults` to filter and format the results.
   - Calls `outputResults` to display or save the final results.

2. **variantRecoder.js**:
   - Fetches recoded variant information from the Variant Recoder API, including the VCF string.

3. **vepRegionsAnnotation.js**:
   - Fetches VEP annotations from the VEP API using genomic coordinates.

4. **vepHgvsAnnotation.js**:
   - Fetches VEP annotations from the VEP API using HGVS notation.

5. **convertVcfToEnsemblFormat.js**:
   - Converts VCF notation to the required Ensembl format for the VEP API.

6. **scoring.js**:
   - Reads and applies scoring configurations to VEP annotations.

7. **variantLinkerProcessor.js**:
   - Orchestrates the data processing, filtering, and formatting.

## Default Parameters

### vep_params

By default, the `vep_params` include the following parameters:

- `CADD=1`: Includes CADD scores in the VEP annotation results.
- `hgvs=1`: Ensures that HGVS notations are always included in the VEP annotation results.
- `merged=1`: Uses the merged Ensembl and RefSeq transcript set for more comprehensive annotation data.
- `mane=1`: Includes MANE Select transcripts in the VEP annotation results.

These defaults can be overridden by specifying additional parameters via the command line.

### recoder_params

By default, the `recoder_params` include the following parameter:

- `vcf_string=1`: Ensures that the VCF string is included in the Variant Recoder results.

These defaults can be overridden by specifying additional parameters via the command line.

## Mermaid Diagram

```mermaid
graph TD;
    A[main.js] --> B[variantRecoder.js];
    A --> C[vepRegionsAnnotation.js];
    A --> D[convertVcfToEnsemblFormat.js];
    A --> E[variantLinkerProcessor.js];
    A --> F[scoring.js];
    E --> B;
    E --> C;
    E --> D;
    E --> F;
    E --> G[filterAndFormatResults];
    E --> H[outputResults];
```

## Example Usage

```bash
variant-linker --variant "ENST00000366667:c.803C>T" --output JSON --save results.json --debug  --scoring_config_path "scoring/meta_score/"
```

This command will analyze the specified variant, format the results as JSON, save them to `results.json`, and enable debug mode.

## Future Enhancements

- Support for additional output formats (e.g., CSV).
- Implement a filter function for more versatile data processing.
- Add local versions of VEP and Variant Recoder as alternatives.

For detailed documentation on each function and module, refer to the JSDoc comments in the source code.
