# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Essential Commands
- **Build**: `npm run build` - Creates production webpack bundle in `dist/`
- **Test**: `npm test` - Runs Mocha test suite with recursive discovery
- **Lint**: `npm run lint` - ESLint check with Google style guide
- **Lint Fix**: `npm run lint:fix` - Auto-fix linting issues where possible
- **Start**: `npm start` - Runs the CLI tool directly
- **Benchmark**: `npm run benchmark` - Performance testing with various batch sizes

### CLI Usage Examples
```bash
# Single variant analysis
node src/main.js --variant "rs6025" --output JSON

# VCF file processing with inheritance analysis
node src/main.js --vcf-input sample.vcf --ped family.ped --calculate-inheritance --output VCF

# Batch processing with scoring
node src/main.js --variants-file examples/sample_variants.txt --scoring_config_path scoring/nephro_variant_score/ --output CSV
```

## Architecture Overview

### Core Processing Pipeline
The application follows a modular pipeline architecture:
1. **Input Processing** (`main.js`) - CLI argument parsing, file reading, validation
2. **Format Detection** (`variantLinkerCore.js`) - Determines VCF vs HGVS input format
3. **API Orchestration** - Parallel calls to Ensembl Variant Recoder and VEP APIs
4. **Data Integration** (`variantLinkerProcessor.js`) - Merges recoder + VEP results
5. **Inheritance Analysis** (`src/inheritance/`) - Family-based variant analysis
6. **Scoring** (`scoring.js`) - Configurable formula-based scoring system
7. **Output Formatting** - JSON/CSV/TSV/VCF with schema mapping

### Key Modules

#### Core Components
- **`variantLinkerCore.js`** - Main analysis orchestrator, handles single and batch processing
- **`variantLinkerProcessor.js`** - Result processing, filtering, and output formatting
- **`main.js`** - CLI entry point with comprehensive parameter handling

#### API Integrations
- **`variantRecoder.js`** - Single variant recoding (GET)
- **`variantRecoderPost.js`** - Batch variant recoding (POST, auto-chunked)
- **`vepRegionsAnnotation.js`** - VEP annotation with batch support
- **`apiHelper.js`** - HTTP client with retry logic and exponential backoff

#### Data Processing
- **`vcfReader.js`** - VCF parsing with multi-allelic splitting
- **`pedReader.js`** - Pedigree file parsing for family structure
- **`convertVcfToEnsemblFormat.js`** - Format conversion utilities
- **`dataExtractor.js`** - VEP response parsing and extraction

#### Inheritance Analysis System
- **`inheritanceAnalyzer.js`** - Main inheritance pattern detection
- **`patternDeducer.js`** - Pattern inference from genotype data
- **`segregationChecker.js`** - Family segregation validation
- **`compoundHetAnalyzer.js`** - Compound heterozygous variant detection
- **`pedigreeUtils.js`** - Family relationship utilities

#### Scoring System
- **`scoring.js`** - Configurable scoring formulas with variable assignment
- **Configuration files**: `scoring/*/formula_config.json` and `variable_assignment_config.json`
- Supports annotation-level and transcript-level scoring

### Configuration Management

#### API Configuration (`config/apiConfig.json`)
```json
{
  "ensembl": {
    "recoderPostChunkSize": 200,
    "vepPostChunkSize": 200
  },
  "requests": {
    "retry": {
      "maxRetries": 4,
      "baseDelayMs": 1000,
      "retryableStatusCodes": [429, 500, 502, 503, 504]
    }
  }
}
```

#### Assembly Support
- **GRCh38** (hg38) - Default, uses `https://rest.ensembl.org`
- **GRCh37** (hg19) - Uses `https://grch37.rest.ensembl.org`

### Input/Output Formats

#### Supported Input Types
- **Single variant**: HGVS, rsID, VCF string format
- **Batch files**: One variant per line, comma-separated lists
- **VCF files**: Full VCF with header preservation and multi-allelic handling
- **PED files**: 6-column pedigree format for family analysis

#### Output Formats
- **JSON**: Structured annotation data
- **CSV/TSV**: Flattened by consequence with configurable fields
- **VCF**: Annotated VCF with `VL_CSQ` INFO field
- **SCHEMA**: Schema.org compliant format

### Error Handling and Resilience

#### API Resilience
- Automatic retry with exponential backoff for transient failures
- Request chunking for large batches (200 variants per API call)
- Rate limiting compliance with `Retry-After` header support

#### Batch Processing
- Large variant lists automatically split into API-compliant chunks
- Progress tracking and error isolation per chunk
- Memory-efficient streaming for large datasets

### Testing Implementation

#### Testing Framework Stack
- **Mocha** (`^10.4.0`) - Test runner with recursive discovery and 30s timeout
- **Chai** (`^4.3.4`) - BDD/TDD assertion library with expect-style assertions
- **Sinon** (`^18.0.1`) - Test spies, stubs, and mocks with sandbox isolation
- **Nock** (`^13.5.4`) - HTTP request mocking for Ensembl API testing
- **Proxyquire** (`^2.1.3`) - Module mocking and dependency injection

#### Test File Organization (17 test files)

##### Core Unit Tests
- **`variantLinkerCore.test.js`** - Main orchestrator, format detection, batch processing
- **`variantLinkerProcessor.test.js`** - Result processing, filtering, output formatting
- **`variantLinkerProcessor.vcf.test.js`** - VCF-specific processing and annotation
- **`apiHelper.test.js`** - HTTP client, retry logic, exponential backoff
- **`dataExtractor.test.js`** - VEP response parsing and data extraction
- **`scoring.test.js`** - Configurable scoring formulas and variable assignment

##### File Processing Tests
- **`vcfReader.test.js`** - VCF parsing, multi-allelic splitting, header preservation
- **`vcfFormatter.test.js`** - VCF output formatting with `VL_CSQ` INFO fields
- **`pedReader.test.js`** - Pedigree file parsing for family structure analysis

##### API Integration Tests
- **`variantRecoder.test.js`** - Single variant recoding (GET) with assembly support
- **`variantRecoderPost.test.js`** - Batch variant recoding (POST) with chunking
- **`vepRegionsAnnotation.test.js`** - VEP annotation API with batch processing

##### Integration Test Suite
- **`fixtures-integration.test.js`** - End-to-end scenarios with fixture validation
- **`csv-tsv-integration.test.js`** - Output format validation and field mapping
- **`inheritance-integration.test.js`** - Family analysis workflows and pattern detection
- **`format-conversion-integration.test.js`** - Format conversion pipelines
- **`scripts/benchmark.js`** - Performance testing with batch size analysis

#### Test Configuration

##### Mocha Configuration (`.mocharc.json`)
```json
{
  "timeout": 30000,
  "reporter": "spec",
  "bail": false,
  "recursive": true
}
```

##### ESLint Test Overrides
```javascript
overrides: [{
  files: ['test/**/*.js'],
  rules: {
    'no-unused-expressions': 'off', // For chai assertions
    'require-jsdoc': 'off',
    'valid-jsdoc': 'off'
  }
}]
```

#### Test Fixtures and Data

##### Standard Format Fixtures (`test/fixtures/`)
- **SNP Examples**: `rs6025.csv/tsv` - Standard SNP output validation
- **HGVS Examples**: `hgvs_missense.csv/tsv` - HGVS notation processing
- **VCF Examples**: `vcf_frameshift.csv/tsv` - Frameshift variant annotation
- **Batch Examples**: `multiple_variants_filtered.csv/tsv` - Multi-variant processing

##### Inheritance Analysis Fixtures (`test/fixtures/inheritance/`)
- **Family Structures**: `trio_*.ped` files with parent-child relationships
- **Genotype Data**: Corresponding `trio_*.vcf` files with variant calls
- **Pattern Examples**: X-linked dominant/recessive, autosomal recessive patterns
- **Complex Cases**: Compound heterozygous, de novo variants, missing parents

##### Core Test Data
- **`test.vcf`** - Standard VCF file for general testing
- **Comprehensive README** - Fixture generation and usage documentation

#### Test Utilities and Helpers

##### Central Helper System (`test/helpers.js`)
```javascript
// Mock response templates for consistent API testing
const mockResponses = {
  variantFormats: { vcfVariant, hgvsVariant, rsVariant },
  variantRecoderGet: { /* realistic single variant responses */ },
  variantRecoderPost: [ /* batch processing responses */ ],
  vepVcfResponse: [ /* comprehensive VEP annotations */ ]
};

// Mock setup utilities with validation
function setupMock({ baseUrl, endpoint, response, statusCode, method });
function createVepAnnotation({ input, consequence, impact, polyphen });
```

##### API Testing Patterns
- **Nock-based mocking** - HTTP request interception for Ensembl APIs
- **Request validation** - Custom validators for API parameter correctness
- **Response simulation** - Realistic data patterns matching live API responses
- **Error scenario testing** - Network failures, rate limits, malformed responses

#### Testing Patterns and Conventions

##### Test Structure Patterns
- **BDD-style organization** - Descriptive describe/it blocks with clear naming
- **Setup/teardown isolation** - beforeEach/afterEach with sinon sandboxes
- **Mock cleanup** - `nock.cleanAll()` and `sinon.restore()` after each test
- **Async/await patterns** - Modern JavaScript patterns for API testing
- **Timeout management** - Test-specific timeouts for API-dependent operations

##### Error Handling Testing
- **Retry logic validation** - Exponential backoff with configurable attempts
- **Network error simulation** - ECONNRESET, ETIMEDOUT, DNS failures
- **HTTP status testing** - Rate limits (429), server errors (500-504)
- **Recovery testing** - Graceful degradation and error reporting

##### Integration Testing Strategies
- **Fixture-based validation** - Comparing actual vs expected output files
- **Cross-platform compatibility** - Line ending normalization (Windows/Unix)
- **API resilience testing** - Retry behavior under various failure conditions
- **Real-world data validation** - Authentic variant examples from clinical use

#### Performance and Benchmark Testing

##### Benchmark System (`scripts/benchmark.js`)
- **Batch size analysis** - Performance across 1, 10, 50, 100, 200+ variants
- **Memory usage tracking** - Heap usage and garbage collection monitoring
- **API retry monitoring** - Failure rates and retry attempt counting
- **Timing measurements** - High-resolution performance timing
- **Detailed reporting** - Tabular output with performance metrics

##### Performance Test Coverage
- **Single variant latency** - Individual variant processing time
- **Batch processing throughput** - Variants per second across batch sizes
- **Memory efficiency** - Memory usage patterns for large datasets
- **API call optimization** - Request batching and chunking effectiveness

#### Test Execution and Coverage

##### Execution Commands
- **`npm test`** - Full test suite with recursive discovery
- **`npm run benchmark`** - Performance testing across scenarios
- **`npm run lint`** - Code quality including test file validation

##### Coverage Areas
- **Unit test coverage** - Individual function and module testing
- **Integration coverage** - End-to-end workflow validation
- **API coverage** - All Ensembl API endpoints and error conditions
- **Format coverage** - All input/output format combinations
- **Edge case coverage** - Malformed inputs, network failures, rate limits

#### Specialized Testing Focus Areas

##### Inheritance Analysis Testing
- **Complex pedigrees** - Multi-generational family structures
- **Pattern detection** - AR, AD, XLR, XLD inheritance validation
- **Genotype-phenotype correlation** - Family segregation analysis
- **Compound heterozygous detection** - Gene-based variant pairing

##### API Resilience Testing
- **Rate limiting compliance** - Retry-After header handling
- **Assembly endpoint testing** - GRCh37 vs GRCh38 API differences
- **Batch chunking validation** - 200-variant API call limits
- **Request validation** - Malformed input handling and error reporting

##### Output Format Testing
- **Schema compliance** - JSON, CSV, TSV, VCF format validation
- **Field mapping accuracy** - Consequence data flattening and organization
- **Cross-format consistency** - Same data across different output formats
- **Header preservation** - VCF metadata and annotation integration

### Library Usage Pattern

The tool is designed for dual use as CLI and library:

```javascript
const { analyzeVariant, variantRecoderPost, vepRegionsAnnotation } = require('variant-linker');

// Batch processing
const result = await analyzeVariant({
  variants: ['rs123', 'ENST00000366667:c.803C>T'],
  recoderOptions: { vcf_string: '1' },
  vepOptions: { CADD: '1', hgvs: '1' },
  output: 'JSON'
});
```

### Code Style and Linting

#### ESLint Configuration
- Google JavaScript Style Guide base
- Node.js specific rules
- Prettier integration for formatting
- Custom rules for test files (Mocha/Chai support)

#### Key Style Points
- 100 character line limit
- camelCase for variables/functions
- JSDoc comments required for functions
- No console.log in production code (use debug module)

### Development Workflow

#### Before Committing
1. Run `npm run lint` to check code style
2. Run `npm test` to ensure all tests pass
3. Use conventional commit messages for semantic-release

#### Performance Considerations
- Use batch APIs for multiple variants
- Enable caching for development/testing
- Monitor API retry counts in debug output
- Consider assembly choice impact on API endpoints

### Common Debugging

#### Debug Levels
- **Level 1** (`-d`): Basic progress and errors
- **Level 2** (`-dd`): Detailed API calls and processing
- **Level 3** (`-ddd`): All debug output including data dumps

#### Debug Output
```bash
DEBUG=variant-linker:* node src/main.js --variant "rs6025" --output JSON
```

### Scoring Configuration

#### Directory Structure
```
scoring/
  nephro_variant_score/
    formula_config.json       # Scoring formulas
    variable_assignment_config.json  # Variable definitions
```

#### Formula Types
- **Annotation-level**: Applied to overall variant
- **Transcript-level**: Applied per transcript consequence
- Support for conditional logic and mathematical operations