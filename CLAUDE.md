# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Essential Commands
- **Build**: `npm run build` - Creates production webpack bundle in `dist/` (UMD library format)
- **Test**: `npm test` - Runs Mocha test suite with recursive discovery and 180s timeout
- **Test CI**: `npm run test:ci` - Runs tests with CI-specific configuration (120s timeout)
- **Test Single File**: `npx mocha test/specific-test.js` - Run individual test file
- **Test Debug**: `DEBUG=variant-linker:* npm test` - Run tests with debug output
- **Lint**: `npm run lint` - ESLint check with Google style guide
- **Lint Fix**: `npm run lint:fix` - Auto-fix linting issues where possible
- **Start**: `npm start` - Runs the CLI tool directly
- **Benchmark**: `npm run benchmark` - Performance testing with various batch sizes

### Documentation Commands
- **Docs Dev**: `npm run docs:dev` - Start VitePress development server
- **Docs Build**: `npm run docs:build` - Build VitePress documentation site
- **Docs Serve**: `npm run docs:serve` - Serve built documentation locally

### Development Setup
- **Node Version**: Requires Node.js >= 14
- **Global CLI Install**: `npm link` - Install CLI globally for development
- **Webpack Dev Server**: `npm run serve` - Development server with hot reload

### CLI Usage Examples

#### Basic API Mode (Default)
```bash
# Single variant analysis
node src/main.js --variant "rs6025" --output JSON

# Copy Number Variant (CNV) analysis
node src/main.js --variant "7:117559600-117559609:DEL" --output JSON

# VCF file processing with inheritance analysis
node src/main.js --vcf-input sample.vcf --ped family.ped --calculate-inheritance --output VCF

# Batch processing with scoring
node src/main.js --variants-file examples/sample_variants.txt --scoring_config_path scoring/nephro_variant_score/ --output CSV

# CNV with custom scoring
node src/main.js --variant "1:1000-5000:DUP" --scoring_config_path scoring/cnv_score_example/ --output CSV

# Genome assembly liftover (hg19 to hg38)
node src/main.js --assembly hg19tohg38 --variant "chr17-7578406-C-A" --output JSON
```

#### Caching and Performance Options
```bash
# Enable caching for better performance
node src/main.js --variant "rs6025" --cache --output JSON

# Batch processing with persistent cache
node src/main.js --variants-file examples/sample_variants.txt --cache --cache-dir ~/.vl-cache --output CSV

# Streaming mode for large datasets
node src/main.js --vcf-input large_dataset.vcf --stream --output JSON
```

#### Debugging and Environment Checks
```bash
# Debug mode to see API calls and processing details
node src/main.js --variant "rs6025" --output JSON -d

# Detailed debug output with data dumps
node src/main.js --variant "rs6025" --output JSON -dd

# Maximum debug output with all logging
node src/main.js --variant "rs6025" --output JSON -ddd

# Debug with log file output
node src/main.js --variant "rs6025" --output JSON -d --log_file debug.log
```

#### Proxy Configuration
```bash
# Basic proxy usage
node src/main.js --variant "rs6025" --proxy http://proxy.company.com:8080 --output JSON

# Authenticated proxy (embedded credentials)
node src/main.js --variant "rs6025" --proxy http://user:pass@proxy.company.com:8080 --output JSON

# Authenticated proxy (separate authentication parameter)
node src/main.js --variant "rs6025" --proxy http://proxy.company.com:8080 --proxy-auth user:pass --output JSON

# HTTPS proxy
node src/main.js --variant "rs6025" --proxy https://proxy.company.com:8443 --output JSON
```

## Entry Points and Module Exports

### CLI Entry Point
- **`src/main.js`** - Main CLI interface with comprehensive argument parsing
- Supports single variants, batch files, VCF processing, and inheritance analysis
- Debug levels available: `-d`, `-dd`, `-ddd` for progressively verbose output

### Library Entry Point  
- **`src/index.js`** - Main library exports for programmatic usage
- Key exports: `analyzeVariant`, `variantRecoderPost`, `vepRegionsAnnotation`, `vcfReader`
- Designed for both Node.js require() and ES6 import usage

### Browser Entry Point
- **`dist/variant-linker.bundle.js`** - UMD bundle for browser usage
- Global: `window.VariantLinker` when loaded via script tag
- Node.js modules (fs, path, os) replaced with browser-compatible fallbacks

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

#### Caching System
- **`cache/CacheManager.js`** - Unified L1/L2 cache manager with memory and persistent storage
- **`cache/PersistentCache.js`** - Persistent disk-based caching implementation
- **`cache.js`** - Cache utilities and configuration helpers

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
- **`vcfFormatter.js`** - VCF output formatting with INFO field annotation
- **`assemblyConverter.js`** - Genome assembly liftover (hg19↔hg38)

#### Feature Annotation System
- **`featureAnnotator.js`** - Custom annotation overlay engine
- **`featureParser.js`** - BED file, gene list, and JSON metadata parsing
- **`schemaMapper.js`** - Output schema mapping and validation

#### Inheritance Analysis System
- **`inheritance/inheritanceAnalyzer.js`** - Main inheritance pattern detection
- **`inheritance/patternDeducer.js`** - Pattern inference from genotype data
- **`inheritance/segregationChecker.js`** - Family segregation validation
- **`inheritance/compoundHetAnalyzer.js`** - Compound heterozygous variant detection
- **`inheritance/pedigreeUtils.js`** - Family relationship utilities
- **`inheritance/genotypeUtils.js`** - Genotype processing and validation utilities
- **`inheritance/patternPrioritizer.js`** - Inheritance pattern prioritization logic

#### Scoring System
- **`scoring.js`** - Configurable scoring formulas with variable assignment
- **Configuration files**: `scoring/*/formula_config.json` and `variable_assignment_config.json`
- Supports annotation-level and transcript-level scoring

#### Utilities and Helpers
- **`configHelper.js`** - API configuration and base URL management
- **`utils/pathUtils.js`** - Cross-platform path utilities
- **`version.js`** - Package version information

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
- **hg19tohg38** - Automatic liftover from hg19 to hg38 coordinates

#### Cache Configuration (Runtime)
```json
{
  "cache": {
    "memory": {
      "maxSize": 100,
      "ttl": 300000
    },
    "persistent": {
      "enabled": false,
      "location": "~/.variant-linker-cache",
      "ttl": 86400000,
      "maxSize": "100MB"
    }
  }
}
```
*Note: Cache configuration is set via CLI parameters, not configuration files.*

#### Schema and Configuration Files
- **`schema/variant_annotation.schema.json`** - JSON schema for output validation
- **`.eslintrc.js`** - ESLint configuration with Google style guide
- **`webpack.config.js`** - Build configuration for UMD library bundle
- **`.mocharc.json`** - Mocha test runner configuration (180s timeout)
- **`.mocharc.ci.json`** - CI-specific test configuration (120s timeout)
- **`tsconfig.json`** - TypeScript configuration for development

### Input/Output Formats

#### Supported Input Types
- **Single variant**: HGVS, rsID, VCF string format, CNV format (chr:start-end:TYPE)
- **Batch files**: One variant per line, comma-separated lists, mixed variant types
- **VCF files**: Full VCF with header preservation and multi-allelic handling
- **CNV variants**: Copy number variants in chr:start-end:TYPE format (DEL, DUP, CNV, etc.)
- **PED files**: 6-column pedigree format for family analysis
- **Streaming input**: stdin support for pipeline integration

#### Output Formats
- **JSON**: Structured annotation data
- **CSV/TSV**: Flattened by consequence with configurable fields, automatic CNV columns for structural variants
- **VCF**: Annotated VCF with `VL_CSQ` INFO field
- **SCHEMA**: Schema.org compliant format

### Caching System

#### Overview
Variant-Linker implements a two-tier caching strategy to improve performance and reduce API calls:
- **L1 Cache (Memory)**: LRU cache for frequently accessed data
- **L2 Cache (Persistent)**: Disk-based cache for long-term storage

#### Cache Configuration
- **Memory Cache**: Configurable max size and TTL (default: 100 entries, 5min TTL)
- **Persistent Cache**: Optional disk-based cache with size limits and cleanup
- **Cache Keys**: Generated from variant inputs and API parameters for consistency
- **Invalidation**: Automatic expiration based on TTL and cache size limits

#### Usage
```bash
# Enable persistent caching
node src/main.js --variant "rs6025" --cache --cache-dir ~/.variant-linker-cache --output JSON

# Cache with custom TTL (24 hours)
node src/main.js --variants-file variants.txt --cache --cache-ttl 86400 --output CSV
```

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
- **Mocha** (`^10.4.0`) - Test runner with recursive discovery and 180s timeout
- **Chai** (`^4.3.4`) - BDD/TDD assertion library with expect-style assertions
- **Sinon** (`^18.0.1`) - Test spies, stubs, and mocks with sandbox isolation
- **Nock** (`^13.5.4`) - HTTP request mocking for Ensembl API testing
- **Proxyquire** (`^2.1.3`) - Module mocking and dependency injection

#### Test File Organization (18 test files)

##### Core Unit Tests
- **`variantLinkerCore.test.js`** - Main orchestrator, format detection, batch processing
- **`variantLinkerProcessor.test.js`** - Result processing, filtering, output formatting
- **`variantLinkerProcessor.vcf.test.js`** - VCF-specific processing and annotation
- **`apiHelper.test.js`** - HTTP client, retry logic, exponential backoff
- **`dataExtractor.test.js`** - VEP response parsing and data extraction
- **`scoring.test.js`** - Configurable scoring formulas and variable assignment

##### Caching and Performance Tests
- **`cache-manager.test.js`** - Cache manager functionality and L1/L2 coordination
- **`cache.test.js`** - Cache utilities and configuration validation
- **`persistent-cache.test.js`** - Persistent disk-based cache implementation

##### File Processing Tests
- **`vcfReader.test.js`** - VCF parsing, multi-allelic splitting, header preservation
- **`vcfFormatter.test.js`** - VCF output formatting with `VL_CSQ` INFO fields
- **`pedReader.test.js`** - Pedigree file parsing for family structure analysis
- **`featureAnnotator.test.js`** - Custom feature annotation engine testing
- **`featureParser.test.js`** - BED file, gene list, and JSON metadata parsing
- **`assemblyConverter.test.js`** - Assembly liftover functionality and coordinate mapping
- **`configHelper.test.js`** - Configuration management and API endpoint selection
- **`genotypeUtils.test.js`** - Genotype parsing and validation utilities

##### API Integration Tests
- **`variantRecoder.test.js`** - Single variant recoding (GET) with assembly support
- **`variantRecoderPost.test.js`** - Batch variant recoding (POST) with chunking
- **`vepRegionsAnnotation.test.js`** - VEP annotation API with batch processing

##### Integration Test Suite
- **`fixtures-integration.test.js`** - End-to-end scenarios with fixture validation
- **`csv-tsv-integration.test.js`** - Output format validation and field mapping
- **`inheritance-integration.test.js`** - Family analysis workflows and pattern detection
- **`format-conversion-integration.test.js`** - Format conversion pipelines
- **`vep_consistency.test.js`** - Scientific validation against VEP web tool baseline data
- **`cnv-integration.test.js`** - Copy Number Variant specific processing and annotation
- **`feature-annotation-integration.test.js`** - Custom annotation overlay functionality
- **`streaming-simple.test.js`** - Basic streaming mode testing
- **`streaming.test.js`** - Advanced streaming scenarios
- **`pick-output-integration.test.js`** - Transcript selection and PICK flag functionality
- **`liftover-simple.test.js`** - Assembly liftover basic functionality
- **`scripts/benchmark.js`** - Performance testing with batch size analysis

#### Test Configuration

##### Mocha Configuration (`.mocharc.json`)
```json
{
  "timeout": 180000,
  "reporter": "spec",
  "bail": false,
  "recursive": true
}
```

##### CI-Specific Configuration (`.mocharc.ci.json`)
```json
{
  "timeout": 120000,
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

##### VEP Consistency Test Fixtures (`test/fixtures/consistency/`)
- **Baseline Data**: `VEP_online_output_test_variants_2024-06-20.txt` - Trusted VEP web tool output
- **Test Variants**: `test_variants_vcf_format_2024-06-20.txt` - Input variants for validation
- **Settings Documentation**: `VEP_SETTINGS.md` - Exact VEP web tool configuration used
- **Comprehensive README**: Fixture generation, maintenance, and troubleshooting guide

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
- **`npm test`** - Full test suite with recursive discovery (180-second timeout)
- **`npm run test:ci`** - CI test suite with 120-second timeout
- **`npm run benchmark`** - Performance testing across scenarios
- **`npm run lint`** - Code quality including test file validation
- **Running specific tests**: `npx mocha test/specific-test.js` - Run individual test files
- **Debug mode**: `DEBUG=variant-linker:* npm test` - Run tests with debug output

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

##### VEP Consistency Testing
- **Scientific validation** - Field-by-field comparison against VEP web tool baseline
- **Baseline data management** - Trusted reference data from VEP web tool (TSV format)
- **Mock API responses** - Transform baseline TSV data into VEP REST API JSON format
- **Annotation accuracy** - Validate most severe consequences, transcript consequences, HGVS notations
- **Numerical precision** - Compare CADD scores, allele frequencies with floating-point tolerance
- **Scoring consistency** - Verify custom scoring formulas produce identical results
- **Regression detection** - Automatic detection of changes affecting annotation quality
- **Coverage testing** - Multiple variant types, consequence types, impact levels
- **Cross-platform testing** - Validates consistent behavior across different operating systems

### Library Usage Pattern

The tool is designed for dual use as CLI and library:

#### Node.js Library Usage
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

#### Browser Bundle Usage
The webpack build creates a UMD library (`dist/variant-linker.bundle.js`):
- **Entry point**: `src/index.js`
- **Global object**: `VariantLinker` when loaded via script tag
- **Browser compatibility**: Node.js modules (fs, path) replaced with browser-compatible alternatives
- **Module formats**: Supports CommonJS, AMD, and global usage

### Code Style and Linting

#### ESLint Configuration
- Google JavaScript Style Guide base
- Node.js specific rules
- Prettier integration for formatting
- Custom rules for test files (Mocha/Chai support)

#### Key Style Points
- 120 character line limit (configured in .eslintrc.js)
- camelCase for variables/functions
- JSDoc comments required for functions (FunctionDeclarations and ClassDeclarations)
- Console.log allowed (rule disabled in this project)
- Prettier integration for consistent formatting

### Project Structure and Distribution

#### Published Package Contents
The npm package includes only:
- `src/` - All source code
- `config/` - API configuration
- `schema/` - JSON schemas
- `scoring/` - Scoring configurations
- `README.md` and `LICENSE`

Note: Tests, examples, and documentation are excluded from the published package.

#### Browser Build
- Webpack creates UMD bundle at `dist/variant-linker.bundle.js`
- Browser fallbacks configured for Node.js modules (fs, path, os)
- Global variable: `VariantLinker` when loaded via script tag

### Development Workflow

#### Before Committing
1. Run `npm run lint` to check code style
2. Run `npm test` to ensure all tests pass
3. Use conventional commit messages for semantic-release

#### Release Process
- **Semantic Release**: Automated versioning based on conventional commits
- **Commit format**: `feat:`, `fix:`, `docs:`, `style:`, `refactor:`, `test:`, `chore:`
- **Version bumps**: 
  - `feat:` → minor version increase
  - `fix:` → patch version increase
  - `BREAKING CHANGE:` → major version increase
- **CI/CD**: GitHub Actions handles automated releases to npm

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
    variable_assignment_config.json  # Variable definitions with scoped structure
```

#### Variable Scoping and Configuration
- **New scoped format**: Variables organized into `aggregates` and `transcriptFields` sections
- **Legacy format**: Still supported for backward compatibility
- **Transcript prioritization**: Uses pick > MANE > canonical > first transcript for annotation-level scoring

#### Formula Types
- **Annotation-level**: Applied to overall variant using prioritized transcript data for transcript-specific fields
- **Transcript-level**: Applied per transcript consequence using individual transcript context
- **Variable scoping**: Aggregated variables (variant-wide) vs transcript-specific fields clearly separated
- Support for conditional logic and mathematical operations

### Documentation System

#### VitePress Documentation
- **Development**: `npm run docs:dev` - Runs on port 5173 by default
- **Build**: `npm run docs:build` - Creates static site in `docs/.vitepress/dist`
- **Preview**: `npm run docs:serve` - Preview production build
- **Configuration**: `docs/.vitepress/config.mjs` - VitePress configuration
- **Theme**: Custom theme with green color scheme (#2e8555 light, #25c2a0 dark)
- **Deployment**: Automated via GitHub Actions to GitHub Pages

#### Documentation Structure
```
docs/
  .vitepress/
    config.mjs         # VitePress configuration
    theme/             # Custom theme files
  index.md             # Homepage
  introduction.md      # Introduction page
  getting-started/     # Installation and usage guides
  guides/              # In-depth feature guides
  blog/                # Blog posts
  benchmarking.md      # Performance documentation
  contributing.md      # Contribution guidelines
```

### GitHub Actions and CI/CD

#### Test Workflow
- **Location**: `.github/workflows/ci.yml`
- **Triggers**: Push to main, pull requests
- **Node versions**: Tests on Node 18, 20, and 22
- **OS**: Ubuntu latest
- **Test command**: `npm run test:ci` (120s timeout)

#### Documentation Deployment
- **Location**: `.github/workflows/deploy-docs.yml`
- **Triggers**: Push to main branch
- **Build**: VitePress static site generation
- **Deployment**: GitHub Pages with automatic updates
- **Output**: Available at https://berntpopp.github.io/variant-linker/

#### Release Workflow
- **Semantic Release**: Automated versioning and npm publishing
- **Changelog**: Automatically generated from conventional commits
- **NPM Publishing**: Automated on successful release

### Custom Annotations Support

#### BED Region Overlays
- **Flag**: `--annotate-bed`
- **Purpose**: Add custom annotations from BED files
- **Format**: Standard BED format with optional name field
- **Output**: Adds `customAnnotations.bedRegions` array to results

#### Gene List Filtering
- **Flag**: `--annotate-genes`
- **Purpose**: Flag variants in specific genes of interest
- **Format**: One gene symbol per line
- **Output**: Adds `customAnnotations.inGeneList` boolean

#### JSON Metadata
- **Flag**: `--annotate-json`
- **Purpose**: Add arbitrary JSON metadata to variants
- **Format**: JSON file with variant IDs as keys
- **Output**: Merges metadata into `customAnnotations.metadata`

### Important Project Notes

#### Test Timeouts
- **Local development**: 180s timeout (`.mocharc.json`)
- **CI environment**: 120s timeout (`.mocharc.ci.json`)
- **Individual test timeout**: Can be overridden with `this.timeout(ms)`
- **Known slow tests**: `fixtures-integration.test.js` and `variantLinkerCore.test.js` may timeout in CI

#### API Rate Limits
- **Ensembl API**: Rate limited, respect 429 responses
- **Retry strategy**: Exponential backoff with max 4 retries
- **Batch size**: Limited to 200 variants per request
- **Local mode**: No rate limits when using local VEP/recoder

#### Memory Considerations
- **Large VCF files**: Use streaming mode (`--stream`) for files > 100MB
- **Batch processing**: Automatically chunks large variant lists
- **Memory monitoring**: Available in debug mode (`-d`)