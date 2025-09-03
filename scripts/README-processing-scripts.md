# Variant-Linker Processing Scripts

This directory contains batch processing and data extraction scripts for variant-linker, available in both PowerShell and Bash versions for cross-platform compatibility.

## Overview

The processing scripts provide two main functionalities:

1. **Batch Processing**: Process multiple variants from CSV files through variant-linker
2. **MANE Extraction**: Extract MANE Select RefSeq transcript annotations from JSON output files

Both scripts are available in PowerShell (`.ps1`) and Bash (`.sh`) versions with identical functionality and command-line interfaces.

## Available Scripts

### Batch Processing Scripts

| Script | Platform | Purpose |
|--------|----------|---------|
| `batch-process-variants.ps1` | PowerShell | Batch process variants from CSV files |
| `batch-process-variants.sh` | Bash | Bash version of the PowerShell batch processor |

### MANE Extraction Scripts

| Script | Platform | Purpose |
|--------|----------|---------|
| `extract-mane.ps1` | PowerShell | Extract MANE annotations from JSON files |
| `extract-mane.sh` | Bash | Bash version of the PowerShell MANE extractor |

## Prerequisites

### PowerShell Version
- **PowerShell 5.1 or later** (Windows PowerShell or PowerShell Core)
- **variant-linker** installed and accessible via command line OR Node.js with variant-linker source

### Bash Version
- **Bash 4.0 or later** (macOS, Linux, WSL, or Git Bash on Windows)
- **jq** for JSON processing
- **variant-linker** installed and accessible via command line OR Node.js with variant-linker source

### Common Requirements
- CSV file with variant data (for batch processing)
- JSON output from variant-linker (for MANE extraction)

## Installation

### PowerShell Setup
```powershell
# Set execution policy to allow local scripts
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Bash Setup
```bash
# Install jq if not already available
# Ubuntu/Debian
sudo apt-get install jq

# macOS
brew install jq

# Windows (via Chocolatey)
choco install jq

# Make scripts executable
chmod +x batch-process-variants.sh
chmod +x extract-mane.sh
```

## Batch Processing

### Purpose
Process multiple variants from a CSV file through variant-linker, generating individual JSON output files with systematic naming (var_0001.json, var_0002.json, etc.).

### Basic Usage

**PowerShell:**
```powershell
.\batch-process-variants.ps1 -InputCsv "variants.csv" -OutputDir "results"
```

**Bash:**
```bash
./batch-process-variants.sh --input-csv "variants.csv" --output-dir "results"
```

### Parameters

| Parameter | PowerShell | Bash | Required | Description |
|-----------|------------|------|----------|-------------|
| Input CSV | `-InputCsv` | `--input-csv` | ✅ | Path to CSV file containing variants |
| Output Directory | `-OutputDir` | `--output-dir` | ✅ | Output directory for JSON files |
| Variant Column | `-VariantColumn` | `--variant-column` | ❌ | Column name containing variants (auto-detected) |
| Additional Parameters | `-AdditionalParams` | `--additional-params` | ❌ | Additional variant-linker parameters |
| Log File | `-LogFile` | `--log-file` | ❌ | Path for detailed log file |
| Start From Row | `-StartFromRow` | `--start-from-row` | ❌ | Resume from specific row number (1-based) |
| End At Row | `-EndAtRow` | `--end-at-row` | ❌ | Process only up to this row number (1-based) |
| Skip Existing | `-SkipExisting` | `--skip-existing` | ❌ | Skip processing if output file already exists |
| Show Details | `-ShowDetails` | `--show-details` | ❌ | Show detailed progress information |
| Timeout | `-TimeoutSeconds` | `--timeout` | ❌ | Timeout in seconds for each variant (default: 120) |

### Examples

#### Basic batch processing
```powershell
# PowerShell
.\batch-process-variants.ps1 -InputCsv "variants.csv" -OutputDir "results"
```
```bash
# Bash
./batch-process-variants.sh --input-csv "variants.csv" --output-dir "results"
```

#### With specific variant column and logging
```powershell
# PowerShell
.\batch-process-variants.ps1 -InputCsv "variants.csv" -OutputDir "results" -VariantColumn "HGVS_Notation" -LogFile "process.log"
```
```bash
# Bash
./batch-process-variants.sh --input-csv "variants.csv" --output-dir "results" --variant-column "HGVS_Notation" --log-file "process.log"
```

#### Resume processing from row 100
```powershell
# PowerShell
.\batch-process-variants.ps1 -InputCsv "variants.csv" -OutputDir "results" -StartFromRow 100 -SkipExisting -ShowDetails
```
```bash
# Bash
./batch-process-variants.sh --input-csv "variants.csv" --output-dir "results" --start-from-row 100 --skip-existing --show-details
```

## MANE Extraction

### Purpose
Extract MANE Select RefSeq transcript annotations from variant-linker JSON output files and produce tab-separated values (TSV) output.

### Basic Usage

**PowerShell:**
```powershell
.\extract-mane.ps1 -InputPath "variant_output.json"
```

**Bash:**
```bash
./extract-mane.sh --input-path "variant_output.json"
```

### Parameters

| Parameter | PowerShell | Bash | Required | Description |
|-----------|------------|------|----------|-------------|
| Input Path | `-InputPath` | `--input-path` | ✅ | Path to JSON file or directory containing JSON files |
| Output File | `-OutputFile` | `--output-file` | ❌ | Path to save TSV output (console if omitted) |
| Include Header | `-IncludeHeader` | `--include-header` | ❌ | Include column headers in output |
| Log File | `-LogFile` | `--log-file` | ❌ | Path to log file for detailed processing |
| Include Filename | `-IncludeFilename` | `--include-filename` | ❌ | Include source filename column |
| Strongest Impact Only | `-StrongestImpactOnly` | `--strongest-impact-only` | ❌ | Show only consequences with strongest impact |
| MANE Only | `-MANEOnly` | `--mane-only` | ❌ | Show only MANE Select transcripts |

### Examples

#### Single file processing with headers
```powershell
# PowerShell
.\extract-mane.ps1 -InputPath "variant_output.json" -OutputFile "mane_results.tsv" -IncludeHeader
```
```bash
# Bash
./extract-mane.sh --input-path "variant_output.json" --output-file "mane_results.tsv" --include-header
```

#### Directory processing with filtering
```powershell
# PowerShell
.\extract-mane.ps1 -InputPath "C:\json_files\" -OutputFile "all_mane.tsv" -StrongestImpactOnly -IncludeHeader
```
```bash
# Bash
./extract-mane.sh --input-path "./json_files/" --output-file "all_mane.tsv" --strongest-impact-only --include-header
```

## CSV File Format

Both batch processing scripts accept CSV files with any structure and will auto-detect the variant column.

### Example CSV Formats

#### Simple format
```csv
variant,description
NM_033629:c.868_930del,Deletion in TREX1
rs6025,Factor V Leiden
ENST00000366667:c.803C>T,Missense variant
```

#### Complex format
```csv
sample_id,gene,hgvs_coding,hgvs_protein,phenotype
SAMPLE001,TREX1,NM_033629:c.868_930del,p.Pro290_Ala310del,AGS
SAMPLE002,F5,rs6025,p.Arg506Gln,Thrombophilia
```

### Column Auto-Detection
The scripts automatically detect variant columns by searching for these patterns:
- "variant", "hgvs", "notation", "mutation", "change"
- Columns containing "c.", "p.", "NM_", "NR_", "rs", "chr"

## Output Formats

### Batch Processing Output
- **File naming**: `var_0001.json`, `var_0002.json`, etc.
- **Content**: Complete variant-linker JSON output for each variant
- **Zero-padded**: 4 digits for proper sorting

### MANE Extraction Output
Tab-separated values (TSV) with columns:

#### Single file mode
| Column | Description | Example |
|--------|-------------|---------|
| Original_Input | Input variant | `ENST00000366667:c.803C>T` |
| HGVS_Coding | RefSeq coding notation | `NM_001384479.1:c.803C>T` |
| HGVS_Protein | RefSeq protein notation | `NP_001371408.1:p.Ala268Val` |
| Gene_Symbol | Gene symbol | `SEPT9` |
| VCF_Coordinates | VCF-style coordinates | `1-230710021-G-A` |

#### Directory mode (includes source filename)
| Column | Description |
|--------|-------------|
| Source_File | JSON filename processed |
| Original_Input | Input variant |
| HGVS_Coding | RefSeq coding notation |
| HGVS_Protein | RefSeq protein notation |
| Gene_Symbol | Gene symbol |
| VCF_Coordinates | VCF-style coordinates |

## Features

### 🚀 Performance Features
- **Auto-detection**: Intelligently finds variant columns
- **Progress tracking**: Real-time progress bar and periodic updates
- **Resume capability**: Continue from any row number
- **Skip existing**: Avoid reprocessing completed variants
- **Batch range**: Process specific row ranges
- **Timeout handling**: Configurable timeout per variant

### 🛡️ Error Handling
- **Robust validation**: Checks inputs, paths, and dependencies
- **Graceful failures**: Continues processing even if individual variants fail
- **Detailed logging**: Comprehensive error reporting and debugging info
- **Platform detection**: Works with both `variant-linker` and `node src/main.js`

### 📊 Progress Reporting
- **Real-time progress**: Visual progress indicators with ETA
- **Periodic summaries**: Updates every 10 processed variants
- **Final statistics**: Complete summary with success rates
- **Detailed logging**: Optional comprehensive log files

### 🎛️ Filtering and Processing
- **Impact hierarchy**: Filter by strongest impact (HIGH > MODERATE > LOW > MODIFIER)
- **MANE prioritization**: Prefer MANE Select transcripts
- **RefSeq filtering**: Focus on standard RefSeq/NCBI transcripts
- **Deduplication**: Remove duplicate transcripts automatically

## Advanced Usage

### Complete Workflow Example
```bash
# 1. Batch process variants (Bash example)
./batch-process-variants.sh --input-csv "variants.csv" --output-dir "json_results" --log-file "batch.log"

# 2. Extract MANE annotations from all results
./extract-mane.sh --input-path "json_results" --output-file "mane_summary.tsv" --include-header --strongest-impact-only

# 3. View results
head -10 mane_summary.tsv
```

### Large Dataset Processing
```bash
# Process in chunks
./batch-process-variants.sh --input-csv "large_dataset.csv" --output-dir "results" --start-from-row 1 --end-at-row 1000
./batch-process-variants.sh --input-csv "large_dataset.csv" --output-dir "results" --start-from-row 1001 --end-at-row 2000 --skip-existing
```

### Error Recovery
```bash
# Check completion status
completed=$(ls results/var_*.json | wc -l)
echo "Completed: $completed variants"

# Resume from where it left off
./batch-process-variants.sh --input-csv "variants.csv" --output-dir "results" --start-from-row $((completed + 1)) --skip-existing
```

## Integration Examples

### With Clinical Pipelines
```bash
# Process patient variants with scoring
./batch-process-variants.sh --input-csv "patient_variants.csv" --output-dir "patient_results" --additional-params "--scoring_config_path scoring/nephro_variant_score/"

# Generate clinical summary
./extract-mane.sh --input-path "patient_results" --output-file "clinical_summary.tsv" --include-header --mane-only
```

### With Excel/Spreadsheet Analysis
```bash
# Process and extract for analysis
./batch-process-variants.sh --input-csv "research_variants.csv" --output-dir "analysis_results"
./extract-mane.sh --input-path "analysis_results" --output-file "summary_for_excel.tsv" --include-header

# The TSV file can be directly imported into Excel, Google Sheets, or similar tools
```

## Troubleshooting

### Common Issues

#### Script not found or permission denied
```bash
# Make scripts executable
chmod +x batch-process-variants.sh
chmod +x extract-mane.sh

# Check if scripts are in PATH or use full path
ls -la *.sh
```

#### variant-linker not found
```bash
# Check if variant-linker is accessible
which variant-linker

# Or check Node.js path
which node
node src/main.js --help
```

#### jq command not found (Bash version)
```bash
# Install jq
# Ubuntu/Debian: sudo apt-get install jq
# macOS: brew install jq
# Windows: choco install jq
```

#### Column not found in CSV
```bash
# Check CSV headers
head -1 variants.csv

# Specify column explicitly
./batch-process-variants.sh --input-csv "data.csv" --output-dir "results" --variant-column "your_column_name"
```

### Performance Optimization

#### Maximum speed
```bash
# Use caching and skip existing files
./batch-process-variants.sh --input-csv "variants.csv" --output-dir "results" --additional-params "--cache" --skip-existing
```

#### Debugging
```bash
# Use detailed logging and small batches
./batch-process-variants.sh --input-csv "variants.csv" --output-dir "results" --end-at-row 10 --log-file "debug.log" --show-details
```

## Best Practices

1. **Always use logging** for large batches: `--log-file "process.log"`
2. **Test with small batches first**: `--end-at-row 10`
3. **Use skip-existing for reruns**: `--skip-existing`
4. **Monitor disk space** for large datasets
5. **Validate CSV format** before processing
6. **Keep backups** of important results
7. **Check dependencies** (jq for bash, PowerShell version)

## Related Documentation

- [variant-linker CLI Documentation](../README.md)
- [Benchmark Results](BENCHMARK_RESULTS.md)
- [variant-linker Documentation](https://berntpopp.github.io/variant-linker/)

Both PowerShell and Bash versions provide identical functionality for cross-platform variant processing and analysis workflows.