# PowerShell Batch Processing Script: batch-process-variants.ps1

An elegant PowerShell script for batch processing variants from CSV files using variant-linker, with comprehensive logging, progress tracking, and error handling.

## Overview

This script automates the processing of multiple variants from a CSV file through variant-linker, generating individual JSON output files with systematic naming (var_0001.json, var_0002.json, etc.). It's designed for high-volume variant analysis with robust error handling and detailed progress reporting.

## Prerequisites

- **PowerShell 5.1 or later** (Windows PowerShell or PowerShell Core)
- **variant-linker** installed and accessible via command line OR Node.js with variant-linker source
- **CSV file** with variant data

## Installation

1. The script is located at `scripts/batch-process-variants.ps1`
2. Ensure PowerShell execution policy allows running scripts:
   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   ```

## Usage

### Basic Syntax
```powershell
.\batch-process-variants.ps1 -InputCsv <csv-file> -OutputDir <output-directory> [options]
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `InputCsv` | String | ✅ | Path to CSV file containing variants |
| `OutputDir` | String | ✅ | Output directory for JSON files |
| `VariantColumn` | String | ❌ | Column name containing variants (auto-detected if not specified) |
| `AdditionalParams` | String | ❌ | Additional variant-linker parameters |
| `LogFile` | String | ❌ | Path for detailed log file |
| `StartFromRow` | Int | ❌ | Resume from specific row number (1-based, default: 1) |
| `EndAtRow` | Int | ❌ | Process only up to this row number (1-based, default: all rows) |
| `SkipExisting` | Switch | ❌ | Skip processing if output file already exists |
| `ShowDetails` | Switch | ❌ | Show detailed progress information |

### Examples

#### 1. Basic batch processing
```powershell
.\batch-process-variants.ps1 -InputCsv "variants.csv" -OutputDir "results"
```

#### 2. With specific variant column and logging
```powershell
.\batch-process-variants.ps1 -InputCsv "variants.csv" -OutputDir "results" -VariantColumn "HGVS_Notation" -LogFile "process.log"
```

#### 3. Resume processing from row 100
```powershell
.\batch-process-variants.ps1 -InputCsv "variants.csv" -OutputDir "results" -StartFromRow 100 -SkipExisting -ShowDetails
```

#### 4. Process specific range with additional parameters
```powershell
.\batch-process-variants.ps1 -InputCsv "variants.csv" -OutputDir "results" -StartFromRow 50 -EndAtRow 100 -AdditionalParams "--cache --assembly GRCh37"
```

#### 5. Complete workflow example
```powershell
# Create output directory
New-Item -ItemType Directory -Path "batch_results" -Force

# Process all variants with comprehensive logging
.\batch-process-variants.ps1 -InputCsv "my_variants.csv" -OutputDir "batch_results" -LogFile "batch_results/processing.log" -ShowDetails

# View summary
Get-Content "batch_results/processing.log" | Select-String "=== Batch Processing Complete ===" -A 10
```

## CSV File Format

The script accepts CSV files with any structure. It will auto-detect the variant column or you can specify it explicitly.

### Supported CSV Formats

#### Example 1: Simple format
```csv
variant,description
NM_033629:c.868_930del,Deletion in TREX1
rs6025,Factor V Leiden
ENST00000366667:c.803C>T,Missense variant
```

#### Example 2: Complex format
```csv
sample_id,gene,hgvs_coding,hgvs_protein,phenotype
SAMPLE001,TREX1,NM_033629:c.868_930del,p.Pro290_Ala310del,AGS
SAMPLE002,F5,rs6025,p.Arg506Gln,Thrombophilia
```

#### Example 3: Mixed variant types
```csv
variant_id,notation,type
VAR001,NM_033629:c.868_930del,coding
VAR002,rs6025,dbSNP
VAR003,chr1:12345:A:T,VCF
VAR004,ENST00000366667:c.803C>T,transcript
```

### Column Auto-Detection

The script automatically detects variant columns by searching for these patterns:
- "variant"
- "hgvs" 
- "notation"
- "mutation"
- "change"
- Columns containing "c.", "p.", "NM_", "NR_", "rs", "chr"

## Output Format

### File Naming Convention
- Files are named sequentially: `var_0001.json`, `var_0002.json`, etc.
- Row numbers correspond to CSV rows (excluding header)
- Zero-padded to 4 digits for proper sorting

### Output Structure
Each JSON file contains the complete variant-linker output for that variant:
```json
{
  "inputFormat": "HGVS",
  "variantData": [...],
  "annotationData": [...],
  "meta": {
    "input": "NM_033629:c.868_930del",
    "batchSize": 1,
    "startTime": "2025-01-01T10:00:00.000Z",
    "endTime": "2025-01-01T10:00:05.123Z",
    "durationMs": 5123
  }
}
```

## Features

### 🚀 Performance Features
- **Auto-detection**: Intelligently finds variant columns
- **Progress tracking**: Real-time progress bar and periodic updates  
- **Resume capability**: Continue from any row number
- **Skip existing**: Avoid reprocessing completed variants
- **Batch range**: Process specific row ranges

### 🛡️ Error Handling
- **Robust validation**: Checks inputs, paths, and dependencies
- **Graceful failures**: Continues processing even if individual variants fail
- **Detailed logging**: Comprehensive error reporting and debugging info
- **Platform detection**: Works with both `variant-linker` and `node src/main.js`

### 📊 Progress Reporting
- **Real-time progress**: Visual progress bar with ETA
- **Periodic summaries**: Updates every 10 processed variants
- **Final statistics**: Complete summary with success rates
- **Detailed logging**: Optional comprehensive log files

### 🎛️ Flexibility
- **Flexible CSV**: Works with any CSV structure
- **Custom parameters**: Pass additional variant-linker options
- **Range processing**: Process specific subsets of data
- **Multiple formats**: Supports all variant-linker input formats

## Advanced Usage

### Large Dataset Processing
For processing thousands of variants:

```powershell
# Process in chunks of 1000
.\batch-process-variants.ps1 -InputCsv "large_dataset.csv" -OutputDir "results" -StartFromRow 1 -EndAtRow 1000 -LogFile "batch_1.log"
.\batch-process-variants.ps1 -InputCsv "large_dataset.csv" -OutputDir "results" -StartFromRow 1001 -EndAtRow 2000 -LogFile "batch_2.log" -SkipExisting
```

### Error Recovery
If processing fails midway:

```powershell
# Check how many files were created
$completed = (Get-ChildItem "results\var_*.json").Count
Write-Host "Completed: $completed variants"

# Resume from where it left off
.\batch-process-variants.ps1 -InputCsv "variants.csv" -OutputDir "results" -StartFromRow ($completed + 1) -SkipExisting
```

### Quality Control
Validate results after processing:

```powershell
# Check for empty or invalid JSON files
Get-ChildItem "results\var_*.json" | ForEach-Object {
    try {
        $json = Get-Content $_.FullName | ConvertFrom-Json
        if (-not $json.annotationData) {
            Write-Warning "Invalid result: $($_.Name)"
        }
    } catch {
        Write-Warning "Failed to parse: $($_.Name)"
    }
}
```

### Integration with Other Tools
Combine with the extract-mane.ps1 script:

```powershell
# 1. Batch process variants
.\batch-process-variants.ps1 -InputCsv "variants.csv" -OutputDir "json_results"

# 2. Extract MANE annotations from all results
.\extract-mane.ps1 -InputPath "json_results" -OutputFile "mane_summary.tsv" -IncludeHeader -StrongestImpactOnly
```

## Troubleshooting

### Common Issues

#### 1. "variant-linker not found"
```powershell
# Check if variant-linker is in PATH
where.exe variant-linker

# Or use Node.js directly (script auto-detects)
node src/main.js --help
```

#### 2. "Column not found"
```powershell
# Specify the variant column explicitly
.\batch-process-variants.ps1 -InputCsv "data.csv" -OutputDir "results" -VariantColumn "your_column_name"

# Check CSV headers
Import-Csv "data.csv" | Get-Member -MemberType NoteProperty
```

#### 3. PowerShell execution policy
```powershell
# Allow local scripts
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Check current policy
Get-ExecutionPolicy -List
```

#### 4. Large files causing memory issues
```powershell
# Process in smaller chunks
.\batch-process-variants.ps1 -InputCsv "large.csv" -OutputDir "results" -EndAtRow 500
```

### Performance Optimization

#### For Maximum Speed
```powershell
# Use caching and skip existing files
.\batch-process-variants.ps1 -InputCsv "variants.csv" -OutputDir "results" -AdditionalParams "--cache" -SkipExisting
```

#### For Debugging
```powershell
# Use detailed logging and process small batches
.\batch-process-variants.ps1 -InputCsv "variants.csv" -OutputDir "results" -EndAtRow 10 -LogFile "debug.log" -ShowDetails
```

## Log File Format

The log file provides detailed information about the processing:

```
[2025-01-01 10:00:00] [INFO] === Variant-Linker Batch Processing Started ===
[2025-01-01 10:00:00] [INFO] Input CSV: variants.csv
[2025-01-01 10:00:00] [INFO] Output Directory: results
[2025-01-01 10:00:01] [SUCCESS] Loaded CSV with 150 rows
[2025-01-01 10:00:01] [INFO] Auto-detected variant column: 'variant'
[2025-01-01 10:00:01] [INFO] Processing rows 1 to 150 (of 150 total)
[2025-01-01 10:00:05] [SUCCESS] Row 1: SUCCESS - NM_033629:c.868_930del -> results\var_0001.json
[2025-01-01 10:00:10] [SUCCESS] Row 2: SUCCESS - rs6025 -> results\var_0002.json
[2025-01-01 10:00:15] [ERROR] Row 3: FAILED - invalid_variant - Invalid variant format
[2025-01-01 10:01:00] [INFO] Progress: 10 processed, 9 successful, 1 failed, 0 skipped (12.5/min, ETA: 11.2min)
...
[2025-01-01 10:15:30] [SUCCESS] === Batch Processing Complete ===
[2025-01-01 10:15:30] [INFO] Total Duration: 00:15:30
[2025-01-01 10:15:30] [INFO] Rows Processed: 150
[2025-01-01 10:15:30] [SUCCESS] Successful: 147
[2025-01-01 10:15:30] [ERROR] Failed: 3
[2025-01-01 10:15:30] [INFO] Skipped: 0
[2025-01-01 10:15:30] [INFO] Success Rate: 98%
```

## Best Practices

1. **Always use logging** for large batches: `-LogFile "process.log"`
2. **Test with small batches first**: `-EndAtRow 10`
3. **Use SkipExisting for reruns**: `-SkipExisting`
4. **Monitor disk space** for large datasets
5. **Validate CSV format** before processing
6. **Keep backups** of important results

## Integration Examples

### With PowerBI/Excel Analysis
```powershell
# Process variants
.\batch-process-variants.ps1 -InputCsv "clinical_variants.csv" -OutputDir "analysis_results"

# Extract for analysis
.\extract-mane.ps1 -InputPath "analysis_results" -OutputFile "summary_for_excel.tsv" -IncludeHeader

# Import to Excel or PowerBI for visualization
```

### With Clinical Pipelines
```powershell
# Process patient variants
.\batch-process-variants.ps1 -InputCsv "patient_variants.csv" -OutputDir "patient_results" -AdditionalParams "--scoring_config_path scoring/nephro_variant_score/"

# Generate clinical reports (custom script)
.\generate-clinical-reports.ps1 -ResultsDir "patient_results"
```

## Related Documentation

- [variant-linker CLI Documentation](../README.md)
- [extract-mane.ps1 Documentation](README-ps.md)
- [JQ Filtering Guide](../docs/guides/jq-filtering.md)

This script provides enterprise-grade batch processing capabilities for variant-linker, suitable for research, clinical, and production environments.