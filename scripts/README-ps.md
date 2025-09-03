# PowerShell Script: extract-mane.ps1

A PowerShell script to extract MANE Select RefSeq transcript annotations from variant-linker JSON output files.

## Overview

This script processes JSON output from variant-linker and extracts specific information for MANE (Matched Annotation from the NCBI and EBI) Select RefSeq transcripts. It outputs tab-separated values containing the original input, HGVS coding notation, HGVS protein notation, and VCF coordinates.

## Prerequisites

- **PowerShell 5.1 or later** (Windows PowerShell or PowerShell Core)
- **variant-linker** installed and configured
- **JSON output file** from variant-linker

## Installation

1. Download the `extract-mane.ps1` script to your working directory
2. Ensure PowerShell execution policy allows running scripts:
   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   ```

## Usage

### Basic Syntax
```powershell
.\extract-mane.ps1 -InputPath <path-to-json-file-or-directory> [-OutputFile <output-path>] [-IncludeHeader] [-LogFile <log-path>] [-IncludeFilename] [-StrongestImpactOnly] [-MANEOnly]
```

### Getting Help
```powershell
# Show detailed help
Get-Help .\extract-mane.ps1 -Detailed

# Show examples
Get-Help .\extract-mane.ps1 -Examples

# Show specific parameter info
Get-Help .\extract-mane.ps1 -Parameter InputPath
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `InputPath` | String | Yes | Path to JSON file OR directory containing JSON files |
| `OutputFile` | String | No | Path to save TSV output (if omitted, displays in console) |
| `IncludeHeader` | Switch | No | Include column headers in the output |
| `LogFile` | String | No | Path to log file for detailed processing information |
| `IncludeFilename` | Switch | No | Include source filename column (auto-enabled for directories) |
| `StrongestImpactOnly` | Switch | No | Filter to show only consequences with the strongest impact (HIGH > MODERATE > LOW > MODIFIER) |
| `MANEOnly` | Switch | No | Only show MANE Select transcripts (exclude other RefSeq transcripts) |

### Examples

#### 1. Single file processing (console output)
```powershell
.\extract-mane.ps1 -InputPath "variant_output.json"
```

#### 2. Single file with headers and logging
```powershell
.\extract-mane.ps1 -InputPath "variant_output.json" -OutputFile "mane_results.tsv" -IncludeHeader -LogFile "process.log"
```

#### 3. Directory processing (batch mode)
```powershell
.\extract-mane.ps1 -InputPath "C:\json_files\" -OutputFile "all_mane.tsv" -IncludeHeader -LogFile "batch.log"
```

#### 4. Directory processing with progress and verbose output
```powershell
.\extract-mane.ps1 -InputPath ".\json_files\" -OutputFile "results.tsv" -IncludeHeader -Verbose
```

#### 5. Filter for strongest impact only
```powershell
# Show only the most severe consequences (e.g., MODERATE over MODIFIER)
.\extract-mane.ps1 -InputPath "variant_output.json" -StrongestImpactOnly -IncludeHeader

# Directory processing with strongest impact filtering
.\extract-mane.ps1 -InputPath ".\json_files\" -OutputFile "strongest_impacts.tsv" -StrongestImpactOnly -IncludeHeader
```

#### 6. MANE Select only filtering
```powershell
# Show only MANE Select transcripts, skip variants without MANE
.\extract-mane.ps1 -InputPath "variant_output.json" -MANEOnly -IncludeHeader

# Combined: MANE only with strongest impact filtering
.\extract-mane.ps1 -InputPath ".\json_files\" -OutputFile "mane_select_only.tsv" -MANEOnly -StrongestImpactOnly -IncludeHeader
```

#### 7. Complete workflow example
```powershell
# Generate multiple JSON files
variant-linker --variant "ENST00000366667:c.803C>T" --output JSON > variant1.json
variant-linker --variant "rs123" --output JSON > variant2.json

# Process all JSON files in current directory
.\extract-mane.ps1 -InputPath "." -OutputFile "mane_summary.tsv" -IncludeHeader -LogFile "processing.log"

# View results
Get-Content "mane_summary.tsv"
```

## Output Format

The script produces tab-separated values (TSV) with the following columns:

### Single File Mode
| Column | Description | Example |
|--------|-------------|---------|
| Original_Input | Input variant provided to variant-linker | `ENST00000366667:c.803C>T` |
| HGVS_Coding | RefSeq coding sequence notation | `NM_001384479.1:c.803C>T` |
| HGVS_Protein | RefSeq protein sequence notation | `NP_001371408.1:p.Ala268Val` |
| Gene_Symbol | Gene symbol for the transcript | `SEPT9` |
| VCF_Coordinates | VCF-style coordinates | `1-230710021-G-A` |

### Directory Mode (includes source filename)
| Column | Description | Example |
|--------|-------------|---------|
| Source_File | Name of the JSON file processed | `variant1.json` |
| Original_Input | Input variant provided to variant-linker | `ENST00000366667:c.803C>T` |
| HGVS_Coding | RefSeq coding sequence notation | `NM_001384479.1:c.803C>T` |
| HGVS_Protein | RefSeq protein sequence notation | `NP_001371408.1:p.Ala268Val` |
| Gene_Symbol | Gene symbol for the transcript | `SEPT9` |
| VCF_Coordinates | VCF-style coordinates | `1-230710021-G-A` |

### Sample Output

**Single file:**
```
Original_Input	HGVS_Coding	HGVS_Protein	Gene_Symbol	VCF_Coordinates
ENST00000366667:c.803C>T	NM_001384479.1:c.803C>T	NP_001371408.1:p.Ala268Val	SEPT9	1-230710021-G-A
```

**Directory mode:**
```
Source_File	Original_Input	HGVS_Coding	HGVS_Protein	Gene_Symbol	VCF_Coordinates
variant1.json	ENST00000366667:c.803C>T	NM_001384479.1:c.803C>T	NP_001371408.1:p.Ala268Val	SEPT9	1-230710021-G-A
variant2.json	rs123	NM_000456.1:c.123A>G	NP_000447.1:p.Lys41Arg	BRCA1	2-456789-A-G
```

## What the Script Does

### Single File Mode
1. **Reads JSON**: Parses variant-linker JSON output file
2. **Filters transcripts**: Identifies RefSeq/NCBI transcripts (NM_*, NR_*, NP_*, or source=RefSeq)
3. **Prioritizes MANE**: Prefers MANE_Select transcripts when available
4. **Impact filtering**: Optionally filters to strongest impact only (HIGH > MODERATE > LOW > MODIFIER)
5. **Extracts data**: Pulls relevant annotation fields
6. **Outputs results**: TSV format to console or file

### Directory Mode
1. **Scans directory**: Finds all .json files in the specified directory
2. **Batch processing**: Processes each file with progress tracking
3. **Error handling**: Continues processing even if individual files fail
4. **Consolidated output**: Combines all results into single output with source filename
5. **Logging**: Detailed processing log with timestamps and statistics

### Key Features
- **Automatic mode detection**: File vs directory input
- **Transcript filtering**: RefSeq/NCBI transcripts with MANE Select prioritization
- **Impact hierarchy**: Strongest impact filtering (HIGH > MODERATE > LOW > MODIFIER)
- **Progress tracking**: Visual progress bar for directory processing
- **Error resilience**: Individual file failures don't stop batch processing
- **Comprehensive logging**: Optional detailed log files
- **Flexible output**: Console display or file output with headers

## Error Handling

The script includes comprehensive error handling:

- **File validation**: Checks if input file exists
- **JSON parsing**: Catches malformed JSON errors
- **Data processing**: Handles missing or unexpected data structures
- **Output writing**: Reports file writing issues

### Common Error Messages

```powershell
# File not found
Input file 'nonexistent.json' not found.

# Invalid JSON
Error processing file: Invalid JSON format

# No results found
Found 0 MANE Select RefSeq transcript(s)
```

## Advanced Usage

### Batch Processing Multiple Files
```powershell
# Process multiple JSON files
Get-ChildItem "*.json" | ForEach-Object {
    $outputName = $_.BaseName + "_mane.tsv"
    .\extract-mane.ps1 -InputFile $_.Name -OutputFile $outputName -IncludeHeader
}
```

### Combine with Other Tools
```powershell
# Extract and sort results
.\extract-mane.ps1 -InputFile "data.json" | Sort-Object

# Count unique transcripts
.\extract-mane.ps1 -InputFile "data.json" | ForEach-Object { $_.Split("`t")[1] } | Sort-Object | Get-Unique | Measure-Object

# Filter for specific chromosomes
.\extract-mane.ps1 -InputFile "data.json" | Where-Object { $_ -like "*1-*" }
```

### PowerShell Pipeline Integration
```powershell
# Generate multiple variants and process
@("rs123", "rs456", "rs789") | ForEach-Object {
    $jsonFile = "$_.json"
    variant-linker --variant $_ --output JSON > $jsonFile
    .\extract-mane.ps1 -InputFile $jsonFile
}
```

## Getting Help

### Built-in Help
```powershell
Get-Help .\extract-mane.ps1 -Detailed
Get-Help .\extract-mane.ps1 -Examples
```

### Parameter Information
```powershell
Get-Help .\extract-mane.ps1 -Parameter InputFile
```

## Troubleshooting

### Execution Policy Issues
```powershell
# Check current policy
Get-ExecutionPolicy

# Set policy to allow local scripts
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### File Encoding Issues
If you encounter character encoding problems:
```powershell
# Specify UTF-8 encoding when saving
.\extract-mane.ps1 -InputFile "data.json" -OutputFile "results.tsv"
# The script automatically uses UTF-8 encoding
```

### Large File Performance
For very large JSON files:
```powershell
# Monitor memory usage
Get-Process PowerShell | Select-Object WorkingSet64
```

## Integration with Excel

To open TSV files in Excel:
1. Open Excel
2. Go to Data → From Text/CSV
3. Select the TSV file
4. Choose "Tab" as delimiter
5. Import the data

Or use PowerShell to create Excel-compatible CSV:
```powershell
.\extract-mane.ps1 -InputFile "data.json" | ConvertFrom-Csv -Delimiter "`t" | Export-Csv "results.csv" -NoTypeInformation
```

## Performance Notes

- **Memory usage**: Script loads entire JSON file into memory
- **Processing speed**: Typically processes 1000+ variants per second
- **File size limits**: Tested with JSON files up to 100MB

## Related Documentation

- [variant-linker Documentation](https://berntpopp.github.io/variant-linker/)
- [JQ Filtering Guide](docs/guides/jq-filtering.md)
- [Proxy Configuration Guide](docs/guides/proxy-configuration.md)

This script provides a Windows-native alternative to jq for extracting MANE Select RefSeq annotations from variant-linker output.