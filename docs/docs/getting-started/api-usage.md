# API Usage

Variant-Linker can be used as both a command-line tool and a JavaScript library. This guide explains the key differences between API and CLI usage, helping you choose the right approach for your project.

## Overview: API vs CLI

### When to Use the API
- **Node.js applications**: Integrating variant annotation into existing JavaScript/Node.js projects
- **Custom workflows**: Building complex pipelines with custom logic and data processing
- **Real-time processing**: Interactive applications requiring immediate responses
- **Memory efficiency**: Processing results in memory without file I/O overhead
- **Custom error handling**: Applications requiring specific error handling strategies

### When to Use the CLI
- **Standalone analysis**: One-off variant annotation tasks
- **Batch processing**: Large-scale file-based variant processing
- **Shell scripting**: Integration into bash/shell-based workflows
- **Standard formats**: Working primarily with VCF, CSV, or JSON files
- **Simple automation**: Basic pipeline automation without complex logic

## Basic API Usage

### Installation as a Library

```bash
npm install variant-linker
```

### Simple Variant Analysis

```javascript
const { analyzeVariant } = require('variant-linker');

async function analyzeVariants() {
  try {
    // Single variant analysis
    const result = await analyzeVariant({
      variant: 'rs6025',
      output: 'JSON'
    });
    
    console.log(result);
  } catch (error) {
    console.error('Analysis failed:', error.message);
  }
}

analyzeVariants();
```

### Batch Processing

```javascript
const { analyzeVariant } = require('variant-linker');

async function processBatch() {
  const variants = ['rs6025', 'ENST00000366667:c.803C>T', 'rs1799963'];
  
  const result = await analyzeVariant({
    variants: variants,
    recoderOptions: { vcf_string: '1' },
    vepOptions: { CADD: '1', SIFT: '1', PolyPhen: '1' },
    output: 'JSON'
  });
  
  return result;
}
```

## Key Differences: API vs CLI

### 1. Configuration

#### CLI Configuration
```bash
# File-based configuration
variant-linker --config config.json --scoring_config_path scoring/nephro_variant_score/

# Command-line parameters
variant-linker --variant "rs6025" --vep_params "CADD=1,SIFT=1" --output JSON
```

#### API Configuration
```javascript
// Object-based configuration
const { analyzeVariant, scoring } = require('variant-linker');

// Load scoring configuration from files (Node.js only)
const scoringConfig = await scoring.readScoringConfigFromFiles('scoring/nephro_variant_score/');

// Or parse configuration objects directly
const scoringConfig = scoring.parseScoringConfig(
  { variables: { /* variable definitions */ } },
  { formulas: { /* scoring formulas */ } }
);

const result = await analyzeVariant({
  variant: 'rs6025',
  vepOptions: { CADD: '1', SIFT: '1' },
  scoringConfig: scoringConfig,
  output: 'JSON'
});
```

**Key Differences:**
- **CLI**: Uses file paths and comma-separated parameter strings
- **API**: Uses JavaScript objects and structured data
- **Scoring**: CLI loads from directory path; API accepts parsed objects or loads via helper functions

### 2. Error Handling

#### CLI Error Handling
```bash
# CLI exits with status codes
variant-linker --variant "invalid" --output JSON
echo $?  # Returns non-zero exit code on failure

# JSON error output to stderr
{
  "status": "error",
  "message": "Invalid variant format"
}
```

#### API Error Handling
```javascript
// API throws exceptions
try {
  const result = await analyzeVariant({
    variant: 'invalid',
    output: 'JSON'
  });
} catch (error) {
  // Handle different error types
  if (error.name === 'ValidationError') {
    console.error('Input validation failed:', error.message);
  } else if (error.name === 'APIError') {
    console.error('External API error:', error.message, error.statusCode);
  } else {
    console.error('Unexpected error:', error);
  }
}
```

**Key Differences:**
- **CLI**: Uses exit codes (0 = success, non-zero = error) and JSON error output
- **API**: Throws typed exceptions with detailed error information
- **Recovery**: API allows for programmatic error recovery and retry logic

### 3. Input/Output Handling

#### CLI Input/Output
```bash
# File-based I/O
variant-linker --vcf-input sample.vcf --output VCF --save annotated.vcf

# String/console I/O
variant-linker --variant "rs6025" --output JSON > result.json
```

#### API Input/Output
```javascript
// Data structure I/O
const fs = require('fs');
const { analyzeVariant, convertVcfToEnsemblFormat } = require('variant-linker');

// Process VCF data in memory
const vcfContent = fs.readFileSync('sample.vcf', 'utf8');
const variants = convertVcfToEnsemblFormat(vcfContent);

const results = await analyzeVariant({
  variants: variants,
  output: 'JSON'
});

// Results are JavaScript objects/arrays
results.forEach(variant => {
  console.log(`Variant: ${variant.input}`);
  console.log(`Consequences: ${variant.most_severe_consequence}`);
});
```

**Key Differences:**
- **CLI**: File streams, command-line strings, and saved output files
- **API**: JavaScript arrays, objects, and in-memory data structures
- **Flexibility**: API provides direct access to parsed data structures

### 4. Dependencies and Environment

#### CLI Environment
```bash
# Global installation
npm install -g variant-linker
variant-linker --version

# Local execution
npx variant-linker --variant "rs6025"

# Shell integration
for variant in rs6025 rs1799963; do
  variant-linker --variant "$variant" --output JSON
done
```

#### API Environment
```javascript
// Node.js environment required
const { analyzeVariant, cache } = require('variant-linker');

// Browser environment (with webpack bundle)
// Note: File system operations not available in browser
import VariantLinker from './dist/variant-linker.bundle.js';

// Environment detection
if (typeof window !== 'undefined') {
  // Browser environment - limited functionality
  console.log('Running in browser');
} else {
  // Node.js environment - full functionality
  console.log('Running in Node.js');
}
```

**Key Differences:**
- **CLI**: Requires Node.js runtime, works in any shell environment
- **API**: Node.js for full functionality, limited browser support via webpack bundle
- **File operations**: CLI has full file system access; browser API is limited

### 5. State Management and Caching

#### CLI State Management
```bash
# Each CLI invocation is independent
variant-linker --variant "rs6025" --output JSON  # Fresh cache
variant-linker --variant "rs6025" --output JSON  # Cache may be used

# No persistent state between CLI calls
```

#### API State Management
```javascript
const { analyzeVariant, cache } = require('variant-linker');

// Persistent cache across API calls
await analyzeVariant({ variant: 'rs6025', output: 'JSON' });  // API call made
await analyzeVariant({ variant: 'rs6025', output: 'JSON' });  // Cache hit

// Manual cache management
cache.clearCache();  // Clear all cached data

// Cache is shared across all API usage in the same Node.js process
```

**Key Differences:**
- **CLI**: Independent cache per process, automatically cleaned up
- **API**: Persistent cache within Node.js process, manual management available
- **Memory**: API cache persists until process ends or manually cleared

## Advanced API Usage

### Custom Error Handling
```javascript
const { analyzeVariant, apiHelper } = require('variant-linker');

async function robustAnalysis(variants) {
  const results = [];
  const errors = [];
  
  for (const variant of variants) {
    try {
      const result = await analyzeVariant({
        variant: variant,
        output: 'JSON'
      });
      results.push(result);
    } catch (error) {
      errors.push({ variant, error: error.message });
      
      // Implement custom retry logic
      if (error.statusCode === 429) {  // Rate limited
        await new Promise(resolve => setTimeout(resolve, 5000));
        // Retry logic here
      }
    }
  }
  
  return { results, errors };
}
```

### Custom Processing Pipeline
```javascript
const { 
  variantRecoderPost, 
  vepRegionsAnnotation, 
  processVariantLinking,
  scoring 
} = require('variant-linker');

async function customPipeline(variants) {
  // Step 1: Variant recoding
  const recodedVariants = await variantRecoderPost(variants, {
    vcf_string: '1'
  });
  
  // Step 2: VEP annotation
  const annotations = await vepRegionsAnnotation(recodedVariants, {
    CADD: '1',
    SIFT: '1',
    PolyPhen: '1'
  });
  
  // Step 3: Custom processing
  const processed = processVariantLinking(recodedVariants, annotations);
  
  // Step 4: Apply custom scoring
  const scoringConfig = scoring.parseScoringConfig(
    myVariableConfig,
    myFormulaConfig
  );
  
  const scored = scoring.applyScoring(processed, scoringConfig);
  
  return scored;
}
```

### Memory-Efficient Batch Processing
```javascript
async function processLargeBatch(variants, chunkSize = 200) {
  const results = [];
  
  for (let i = 0; i < variants.length; i += chunkSize) {
    const chunk = variants.slice(i, i + chunkSize);
    
    const chunkResults = await analyzeVariant({
      variants: chunk,
      output: 'JSON'
    });
    
    results.push(...chunkResults);
    
    // Optional: Clear cache periodically to manage memory
    if (i % 1000 === 0) {
      cache.clearCache();
    }
  }
  
  return results;
}
```

## Best Practices

### API Best Practices
1. **Error Handling**: Always wrap API calls in try-catch blocks
2. **Batching**: Use batch processing for multiple variants to reduce API calls
3. **Caching**: Monitor cache usage and clear when processing large datasets
4. **Configuration**: Validate configuration objects before passing to API functions
5. **Memory Management**: Consider clearing cache for long-running processes

### When to Choose API vs CLI
- **Choose API** for: Integration into applications, custom error handling, memory efficiency, real-time processing
- **Choose CLI** for: File-based workflows, shell scripting, standalone analysis, standard output formats

## Migration from CLI to API

### CLI Command Translation
```bash
# CLI command
variant-linker --variants-file variants.txt --scoring_config_path scoring/nephro/ --output CSV --save results.csv
```

```javascript
// Equivalent API usage
const fs = require('fs');
const { analyzeVariant, scoring } = require('variant-linker');

async function migrate() {
  // Read variants file
  const variantsFile = fs.readFileSync('variants.txt', 'utf8');
  const variants = variantsFile.split('\n').filter(line => line.trim());
  
  // Load scoring configuration
  const scoringConfig = await scoring.readScoringConfigFromFiles('scoring/nephro/');
  
  // Analyze variants
  const results = await analyzeVariant({
    variants: variants,
    scoringConfig: scoringConfig,
    output: 'CSV'
  });
  
  // Save results
  fs.writeFileSync('results.csv', results);
}
```

## Next Steps

- Learn about [CLI usage](cli-usage.md) for command-line workflows
- Explore [inheritance analysis](../guides/inheritance-analysis.md) for family-based studies
- Set up [custom scoring](../guides/scoring-engine.md) for variant prioritization
- Review [benchmarking](../benchmarking.md) for performance optimization