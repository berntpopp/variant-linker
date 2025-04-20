# Variant-Linker

## Introduction
Variant-Linker is a command-line interface (CLI) tool designed to facilitate the retrieval of genetic variant annotations. It integrates with Ensembl's Variant Recoder and Variant Effect Predictor (VEP) REST APIs to provide a streamlined process for obtaining detailed annotations for a given genetic variant.

In addition to its CLI capabilities, Variant-Linker is designed with a modular architecture so that its core functionalities can be easily imported and used as an API within other Node.js projects.

## Features
- **Variant Translation**: Converts genetic variant inputs into various formats to all possible variant IDs and HGVS notations.
- **VEP Annotations**: Retrieves detailed variant annotations from the VEP API.
- **Filtering**: Filters VEP annotations based on transcript specifications.
- **Modular Design**: Structured to facilitate reuse of core functionalities (as a library) in other projects.
- **Extensibility**: Prepared for future extensions to include local installations of VEP and Variant Recoder.
- **Output Customization**: Users can specify the output format (JSON, CSV, TSV) with configurable field selection.
- **Tabular Data Export**: Provides CSV and TSV output with a "flatten by consequence" strategy for comprehensive variant analysis.
- **PED File Support**: Reads standard 6-column PED files to extract family structure and affected status information for inheritance analysis.
- **Inheritance Pattern Analysis**: Automatically deduces potential inheritance patterns (de novo, autosomal dominant/recessive, X-linked) from multi-sample VCF files and family structure information.
- **VCF Handling**: Supports standard VCF file input (`--vcf-input`) and generation of annotated VCF output (`--output VCF`), preserving original headers and adding annotations to the INFO field. Works with any input type; a default header is generated if input was not a VCF file.
- **Batch Request Chunking**: Automatically splits large batches of variants into smaller chunks for API requests, ensuring compliance with Ensembl limits and efficient processing.
- **Exponential Backoff Retry**: Implements automatic retry with exponential backoff for transient API errors, improving reliability when Ensembl services experience temporary issues.
- **Configuration File Support**: Allows users to provide parameters through a structured configuration file.

## Installation

Before installing Variant-Linker, ensure you have [Node.js](https://nodejs.org/) and npm (Node Package Manager) installed on your system.

To set up Variant-Linker, follow these steps:

1. **Clone the repository**:
   ```bash
   git clone https://github.com/berntpopp/variant-linker.git
   cd variant-linker
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Link the package globally** (optional but recommended):
   ```bash
   npm link
   ```

## Usage

### Command-Line Interface

After installation, you can run Variant-Linker using the following command:

```bash
# Process a single variant
variant-linker --variant <variant_input> --output <output_format> [--debug]

# Process multiple variants from a file (one per line)
variant-linker --variants-file <file_path> --output <output_format> [--debug]

# Process multiple variants as a comma-separated list
variant-linker --variants <variant1,variant2,variant3> --output <output_format> [--debug]

# Process variants from a VCF file
variant-linker --vcf-input <vcf_file_path> --output <output_format> [--debug]
```

#### Command-Line Options
- `--config`, `-c`: Path to the configuration file.
- `--variant`, `-v`: Specify a single genetic variant to be analyzed.
- `--variants-file`, `-vf`: Path to a file containing variants to be analyzed (one per line).
- `--variants`, `-vs`: Comma-separated list of variants to be analyzed.
- `--vcf-input`, `-vi`: Path to a VCF file containing variants to be analyzed. The file's header and record structure are preserved in output if `--output VCF` is used.
- `--output`, `-o`: Define the desired output format (JSON, CSV, TSV, VCF). Default is JSON.
- `--save`, `-s`: Filename to save the results. If not specified, results will be printed to the console.
- `--debug`, `-d`: Enable debug mode for detailed logging. This is optional and is not enabled by default.
- `--vep_params`, `--vp`: Optional parameters for VEP annotation in key=value format, separated by commas (default: "CADD=1").
- `--recoder_params`, `--rp`: Optional parameters for Variant Recoder in key=value format, separated by commas (default: "vcf_string=1").
- `--ped`, `-p`: Path to the PED file defining family structure and affected status. Provides pedigree information for inheritance analysis.
- `--calculate-inheritance`, `-ci`: Enable automatic inheritance pattern deduction and segregation check.
- `--sample-map`, `-sm`: Comma-separated sample IDs for Index, Mother, Father if PED file is not provided (used for default trio mode).
- `--scoring_config_path`, `--scp`: Path to the scoring configuration directory.

#### Configuration File

Variant-Linker can accept a JSON configuration file to specify parameters. Command-line parameters will override configuration file parameters if both are provided.

##### Example Configuration File (`example_input.json`):

```json
{
  "variant": "ENST00000366667:c.803C>T",
  "output": "JSON",
  "save": "output/example_output.json",
  "debug": 3,
  "scoring_config_path": "scoring/meta_score/"
}
```

##### API Retry Configuration

Variant-Linker automatically retries failed API requests when encountering transient errors. The retry behavior can be customized in the `config/apiConfig.json` file:

```json
"requests": {
  "retry": {
    "maxRetries": 4,         // Maximum number of retry attempts
    "baseDelayMs": 1000,     // Initial delay in milliseconds
    "retryableStatusCodes": [429, 500, 502, 503, 504]  // HTTP status codes that trigger a retry
  }
}
```

### Benchmarking

Variant-Linker includes a benchmarking suite to measure performance metrics when processing variants under different conditions. Benchmarks are useful for:

- Performance testing across different variant types and batch sizes
- Identifying bottlenecks in the processing pipeline
- Comparing API performance across different scenarios
- Testing changes to ensure they don't negatively impact performance

#### Running Benchmarks

Benchmarks can be run using npm:

```bash
# Run all benchmarks
npm run benchmark

# Run with verbose output
npm run benchmark -- --verbose

# Run specific benchmark file
npm run benchmark -- --input examples/benchmark_data/tiny_batch.txt

# Save results to a file
npm run benchmark -- --format csv --output benchmark_results.csv
```

#### Benchmark Options

- `--verbose`, `-v`: Run with detailed output showing each step of the process
- `--input`, `-i`: Specify a specific input file to benchmark
- `--assembly`, `-a`: Genome assembly to use (GRCh37 or GRCh38, default: GRCh38)
- `--repeat`, `-r`: Number of times to repeat each benchmark for averaging (default: 1)
- `--format`, `-f`: Output format for results (table, csv, tsv, default: table)
- `--output`, `-o`: File to write results to (if not specified, results are printed to console)
- `--variant-type`, `-t`: Variant types to benchmark (vcf, hgvs, rsid, all, default: all) 
- `--variant-count`, `-c`: Variant counts to benchmark (1, 10, 50, 500, all, default: all)

#### Benchmark Data

The repository includes sample benchmark data files in the `examples/benchmark_data` directory:

- Single variants (`single_variant.txt`, `single_variant.vcf`)
- Small batches (`tiny_batch.txt`, `tiny_batch.vcf`, `small_batch.txt`, `small_batch.vcf`)
- Large batches (`large_batch.txt`, `large_batch.vcf`)

See `examples/benchmark_data/README.md` for details on these files and how to generate custom benchmark data.

With the default configuration:
- Retry up to 4 times (5 total attempts including the initial request)
- Use exponential backoff starting at 1 second (approximately 1s, 2s, 4s, 8s for retries)
- Add jitter to prevent thundering herd issues
- Respect `Retry-After` headers for rate-limiting (HTTP 429) responses
- Only retry on server errors (5xx) and network issues, not on client errors (4xx)

### Batch Processing and Chunking

When processing large numbers of variants, Variant-Linker automatically splits them into smaller batches ("chunks") to avoid overwhelming the Ensembl APIs, which typically have limits around 200 variants per request. This chunking behavior can be configured in the `config/apiConfig.json` file:

```json
"ensembl": {
  "recoderPostChunkSize": 200,  // Maximum variants per Variant Recoder POST request
  "vepPostChunkSize": 200       // Maximum variants per VEP Region POST request
}
```

With the default configuration:
- Variant Recoder POST requests are limited to 200 variants per chunk
- VEP Region POST requests are limited to 200 variants per chunk
- When processing more variants than the chunk size, multiple API requests are made automatically
- Results from all chunks are aggregated seamlessly before being returned
- A small delay is added between chunk requests to be polite to the API

#### VCF String Input Conversion

Variant-Linker can internally convert VCF-style string representations (e.g., `chr-pos-ref-alt`) to the Ensembl region format required for annotation. For example:
- **Input**: `1-65568-A-C`
- **Ensembl region format**: `1:65568-65568:1`
- **Allele**: `C`

#### Example CLI Usage

Using command-line parameters:
```bash
# JSON output
variant-linker --variant 'ENST00000366667:c.803C>T' --output JSON

# CSV output
variant-linker --variant 'rs6025' --output CSV

# TSV output
variant-linker --variant '9 130716739 . G GT' --output TSV

# VCF input and output
variant-linker --vcf-input sample.vcf --output VCF
```

Using a configuration file:
```bash
variant-linker --config example_input.json
```

### CSV and TSV Output

Variant-Linker provides CSV and TSV output for variant annotations, using a "flatten by consequence" strategy that creates one row per transcript consequence for each variant.

### VCF File Input and Output

Variant-Linker provides robust support for VCF files:

- **VCF Input (`--vcf-input <file>`):** Reads variants from a standard VCF file. The original VCF header is preserved in the output. Multi-allelic sites are automatically split and processed as separate variants.
- **VCF Output (`--output VCF`):** Produces an annotated VCF file. Annotations are added to the INFO field using a `VL_CSQ` tag. The original header is preserved if input was a VCF file; otherwise, a default VCF header is generated.
- **Universal VCF Output:** You can use `--output VCF` with any input type (`--variant`, `--variants-file`, or `--vcf-input`). If the input was not a VCF file, a minimal standard-compliant VCF header is generated.
- **INFO Field Annotation:** Annotations are added as an `INFO` field named `VL_CSQ` with a pipe-delimited format similar to VEP's CSQ notation.
- **VL_CSQ Format:** The `VL_CSQ` field contains: `Allele|Consequence|IMPACT|SYMBOL|Gene|Feature_type|Feature|BIOTYPE|HGVSc|HGVSp|Protein_position|Amino_acids|Codons|SIFT|PolyPhen`
- **Header Example:**
  ```
  ##fileformat=VCFv4.2
  ##INFO=<ID=VL_CSQ,Number=.,Type=String,Description="Consequence annotations from variant-linker. Format: Allele|Consequence|IMPACT|SYMBOL|Gene|Feature_type|Feature|BIOTYPE|HGVSc|HGVSp|Protein_position|Amino_acids|Codons|SIFT|PolyPhen">
  #CHROM	POS	ID	REF	ALT	QUAL	FILTER	INFO
  ```
- **Multi-allelic Handling:** Multi-allelic records are split internally for annotation and then merged into the output, preserving original context.

**Example: Annotated VCF output from VCF input**
```bash
variant-linker --vcf-input sample.vcf --output VCF
```

**Example: Annotated VCF output from non-VCF input**
```bash
# VCF output from HGVS input
variant-linker --variant 'rs6025' --output VCF --save annotated_rs6025.vcf
```

The annotated VCF output will have all original (or default) header lines, and each variant record will include a `VL_CSQ` annotation in the INFO column.
#### CSV/TSV Features

- **Flatten by Consequence**: Creates one row per transcript consequence for variants with multiple consequences
- **Consistent Structure**: Variants without consequences still generate a row with top-level data
- **Default Headers**: Includes key fields like variant ID, location, gene symbol, consequence, and impact
- **Filter Support**: CSV/TSV output works with all filtering options

#### Example CSV Output

```csv
OriginalInput,VariantID,Location,Alleles,GeneSymbol,Consequence,Impact,HGVS_p
rs6025,rs6025,1:169519049-169519049,T/C,F5,missense_variant,MODERATE,p.Arg534Gln
rs6025,rs6025,1:169519049-169519049,T/C,F5,missense_variant,MODERATE,p.Arg564Gln
```

#### Example TSV Output

```
OriginalInput	VariantID	Location	Alleles	GeneSymbol	Consequence	Impact	HGVS_p
rs6025	rs6025	1:169519049-169519049	T/C	F5	missense_variant	MODERATE	p.Arg534Gln
rs6025	rs6025	1:169519049-169519049	T/C	F5	missense_variant	MODERATE	p.Arg564Gln
```

### Using Variant-Linker as a Library (API Usage)

Variant-Linker is also designed to be used as a library in your own Node.js projects. Once installed (or linked) you can import its core functions directly into your code. For example:

```js
// Import the desired functions from variant-linker
const {
  analyzeVariant,        // Core analysis function that supports both single and batch processing
  variantRecoder,        // Single variant recoding (GET endpoint)
  variantRecoderPost,    // Batch variant recoding (POST endpoint)
  vepRegionsAnnotation,  // VEP annotation (supports batch processing)
  vepHgvsAnnotation,
  convertVcfToEnsemblFormat,
  scoring,
  variantLinkerProcessor
} = require('variant-linker');

// Example: Using variantRecoder to get recoded variant information
async function getRecoderData() {
  try {
    const recoderData = await variantRecoder('rs123', { vcf_string: '1' });
    console.log('Variant Recoder Data:', recoderData);
  } catch (error) {
    console.error('Error fetching variant recoding:', error);
  }
}
getRecoderData();

// Example: Converting a VCF string to Ensembl format
const vcfInput = '1-65568-A-C';
const ensemblFormat = convertVcfToEnsemblFormat(vcfInput);
console.log('Ensembl Format:', ensemblFormat);

// Example: Using batch variant processing
async function analyzeBatchVariants() {
  try {
    // Process multiple variants at once (will be automatically chunked if needed)
    const batchResult = await analyzeVariant({
      variants: ['rs123', 'ENST00000366667:c.803C>T', '1-65568-A-C'],
      recoderOptions: { vcf_string: '1' },
      vepOptions: { CADD: '1', hgvs: '1' },
      cache: false,
      output: 'JSON' // Can also use 'CSV' or 'TSV'
    });

    console.log('Batch Analysis Results:', batchResult);
    
    // Alternatively, use the variantRecoderPost function directly for batch recoding
    const batchRecoderResult = await variantRecoderPost(
      ['rs123', 'ENST00000366667:c.803C>T'],
      { vcf_string: '1' }
    );
    console.log('Batch Recoder Results:', batchRecoderResult);
  } catch (error) {
    console.error('Error processing batch variants:', error);
  }
}
analyzeBatchVariants();

// Example: Using filtering criteria with CSV output
async function analyzeWithFiltering() {
  try {
    const variantWithFilter = await analyzeVariant({
      variant: 'ENST00000366667:c.803C>T',
      filter: JSON.stringify({
        'transcript_consequences.*.biotype': { eq: 'protein_coding' },
        'transcript_consequences.*.canonical': { eq: 1 }
      }),
      output: 'CSV' // Use CSV format for tabular output
    });
    console.log('Filtered CSV Results:', variantWithFilter);
  } catch (error) {
    console.error('Error:', error.message);
  }
}
analyzeWithFiltering();

// Various other functions are similarly available for integration.
```

All core functions – such as variant recoding, VEP annotation retrieval, VCF conversion, scoring, and result processing – are exposed via the package’s main module (via the `index.js` file). This modular design allows you to integrate Variant-Linker into larger bioinformatics pipelines or web services.

## Contributing
Contributions to Variant-Linker are welcome. Please feel free to fork the repository, make your changes, and submit a pull request.

## Testing

Variant-Linker includes a comprehensive test suite using Mocha as the test runner and Chai for assertions. The tests cover core functionality including variant format detection, single and batch variant processing, scoring, and API interactions.

### Benchmark Suite

Variant-Linker includes a benchmark suite for measuring and tracking performance metrics under various conditions. This helps identify bottlenecks, track performance improvements or regressions, and provide expected performance characteristics.

#### Running Benchmarks

To run the benchmark suite:

```bash
# Run all benchmarks
npm run benchmark
```

The benchmark suite executes the variant-linker CLI against predefined test datasets and reports key performance metrics including:

- **Total Runtime**: How long the entire process takes for each scenario
- **Variants Processed**: The number of variants processed in each scenario
- **Average Time per Variant**: Runtime divided by number of variants processed
- **API Retries**: Number of API retry attempts encountered during processing
- **Chunks Processed**: Number of chunks processed for batch requests when request chunking is triggered

#### Benchmark Scenarios

The benchmark suite tests the following scenarios:

1. **Single Variant VCF**: Processing a single VCF variant (no recoding needed)
2. **Single Variant rsID**: Processing a single rsID variant (requires recoding)
3. **Tiny Batch VCF**: Processing 10 VCF variants (no recoding needed)
4. **Tiny Batch HGVS/rsID**: Processing 10 rsID variants (requires recoding)
5. **Small Batch VCF**: Processing ~50 VCF variants (no recoding needed)
6. **Small Batch HGVS/rsID**: Processing ~50 HGVS/rsID variants (requires recoding)
7. **Large Batch VCF**: Processing ~500 VCF variants (no recoding, triggers chunking)
8. **Large Batch HGVS/rsID**: Processing ~500 HGVS/rsID variants (requires recoding, triggers chunking)

These scenarios test different input types and batch sizes to provide a comprehensive view of the tool's performance under various conditions.

#### Benchmark Results Example

```
📊 BENCHMARK RESULTS
=================================================================================
| Scenario              | Runtime (s) | Variants | Time/Variant (s) | Retries | Chunks |
---------------------------------------------------------------------------------
| Small Batch VCF       |       1.25 |       50 |           0.0250 |       0 |      0 |
| Small Batch HGVS/rsID |       2.75 |       50 |           0.0550 |       0 |      0 |
| Large Batch VCF       |       8.50 |      500 |           0.0170 |       1 |      3 |
| Large Batch HGVS/rsID |      12.75 |      500 |           0.0255 |       2 |      3 |
=================================================================================
```

### Running Tests

To run the test suite:

```bash
# Run all tests
npm test

# Run tests with coverage reporting (if configured)
npm run test:coverage
```

### Test Structure

Tests are organized in the `test/` directory with the following structure:

- `helpers.js` - Common test utilities and mock data
- `scoring.test.js` - Tests for the scoring module
- `variantLinkerCore.test.js` - Tests for core functionality and batch processing
- `variantRecoder.test.js` - Tests for variant recoder API interactions
- `variantRecoderPost.test.js` - Tests for batch variant recoder API interactions

### Adding New Tests

When adding new features, please include appropriate tests following these principles:

- **KISS (Keep It Simple, Stupid)** - Write straightforward, focused tests
- **DRY (Don't Repeat Yourself)** - Use helpers and shared fixtures
- **Mock external dependencies** - Don't make actual API calls in tests
- **Clean up resources** - Use try/finally to ensure proper cleanup

## PED File Format

Variant-Linker supports standard 6-column PED (pedigree) files for family structure and affected status:

```
FamilyID SampleID FatherID MotherID Sex AffectedStatus
```

Where:
- **FamilyID**: Identifier for family group
- **SampleID**: Unique sample identifier (used for sample lookup)
- **FatherID**: Father's sample ID (or '0' for founder/unknown)
- **MotherID**: Mother's sample ID (or '0' for founder/unknown)
- **Sex**: 1=male, 2=female, 0=unknown
- **AffectedStatus**: 0=unknown, 1=unaffected, 2=affected

Example PED file content:
```
FAM1 SAMPLE1 0 0 1 2       # Male founder (affected)
FAM1 SAMPLE2 0 0 2 1       # Female founder (unaffected)
FAM1 SAMPLE3 SAMPLE1 SAMPLE2 1 2  # Male child (affected)
```

PED files can use either tabs or spaces as delimiters. Lines starting with '#' are treated as comments and ignored. This pedigree data enables inheritance analysis and filtering based on family relationships.

## Inheritance Pattern Analysis

Variant-Linker can automatically analyze genotype data and family relationships to deduce potential inheritance patterns for variants. This feature helps prioritize variants based on their segregation within a family.

### Supported Inheritance Patterns

- **De novo**: Variants present in child but absent in both parents
- **Autosomal dominant**: Heterozygous variants segregating with affected status
- **Autosomal recessive**: Homozygous variants in affected individuals with carrier parents
- **X-linked dominant**: Variants on X chromosome following dominant inheritance 
- **X-linked recessive**: Variants on X chromosome following recessive inheritance

### Analysis Modes

The inheritance pattern analysis can operate in three modes:

1. **Single Sample Mode**: When only one sample is present in the VCF file. Limited to basic inheritance pattern possibilities.
2. **Trio Mode**: When a parent-child trio is available, either automatically detected in the VCF file or specified via `--sample-map`.
3. **PED-based Mode**: When a comprehensive family structure is provided via PED file, enabling multi-generational inheritance analysis.

### Usage

To enable inheritance pattern analysis:

```bash
# Using a PED file with family structure
variant-linker --vcf-input sample.vcf --ped family.ped --calculate-inheritance

# Using manual trio mapping
variant-linker --vcf-input sample.vcf --sample-map "PROBAND,MOTHER,FATHER" --calculate-inheritance
```

### Output

When inheritance pattern analysis is enabled, each variant annotation will include a `deducedInheritancePattern` property with the following information:

- **patterns**: Array of possible inheritance patterns for the variant
- **confidence**: Confidence level in the deduced pattern (high, medium, low)
- **patternDetails**: Additional information about the inheritance pattern

This information can be used to prioritize variants that follow the expected inheritance pattern for the disease of interest.

## Code Style & Linting

Variant-Linker uses ESLint and Prettier to enforce consistent code style following the Google JavaScript Style Guide with some customizations for Node.js development.

### Running Linting

```bash
# Check for linting issues
npm run lint

# Fix automatically fixable linting issues
npm run lint:fix
```

### Linting Configuration

Linting is configured through the following files:

- `.eslintrc.js` - ESLint configuration based on Google's style guide
- `.prettierrc.js` - Prettier formatting configuration
- `.eslintignore` - Files and directories to exclude from linting

### Style Guidelines

When contributing to the project, please follow these guidelines:

- Use camelCase for variable and function names
- Maintain clear JSDoc comments for all functions
- Keep line length under 100 characters
- Follow the KISS principle - avoid unnecessary complexity
- Follow the DRY principle - don't repeat code

### Automated Releases & Commit Messages

This project uses [semantic-release](https://github.com/semantic-release/semantic-release) to automate the release process, including version bumping, changelog generation, npm publishing, and GitHub release creation.

To make this automation work, **commit messages MUST follow the [Conventional Commits specification](https://www.conventionalcommits.org/)**. When you submit a Pull Request, the title and the commit messages will be analyzed to determine the next version number.

**Common Commit Types:**

*   `feat:` A new feature (results in a **minor** version bump, e.g., `0.1.0` -> `0.2.0`)
*   `fix:` A bug fix (results in a **patch** version bump, e.g., `0.1.0` -> `0.1.1`)
*   `docs:` Documentation only changes
*   `style:` Changes that do not affect the meaning of the code (white-space, formatting, missing semi-colons, etc)
*   `refactor:` A code change that neither fixes a bug nor adds a feature
*   `perf:` A code change that improves performance
*   `test:` Adding missing tests or correcting existing tests
*   `build:` Changes that affect the build system or external dependencies (example scopes: gulp, broccoli, npm)
*   `ci:` Changes to our CI configuration files and scripts (example scopes: Travis, Circle, BrowserStack, SauceLabs)
*   `chore:` Other changes that don't modify `src` or `test` files
*   `revert:` Reverts a previous commit

Commits with types like `docs`, `style`, `refactor`, `test`, `chore`, etc., will **not** trigger a release.

**Breaking Changes:**

To trigger a **major** version bump (e.g., `1.0.0` -> `2.0.0`), include `BREAKING CHANGE:` in the footer of the commit message or append a `!` after the type/scope (e.g., `feat!: drop support for Node 12`).

```
feat: allow provided config object to extend other configs

BREAKING CHANGE: `extends` key in config file is now used for extending other config files
```

Please ensure your commit messages are descriptive and adhere to this format so that releases can be managed automatically.

## License
This project is licensed under the [MIT License](LICENSE.md).

## Acknowledgements
This tool utilizes the Ensembl Variant Recoder and Variant Effect Predictor APIs, provided by the Ensembl project.
