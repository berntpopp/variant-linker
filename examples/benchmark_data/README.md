# Variant-Linker Benchmark Data

This directory contains sample files for benchmarking the variant-linker tool. These files provide standardized datasets for testing performance, accuracy, and functionality across different variant types and batch sizes.

## File Structure

The benchmark data is organized by size and format:

- **single_variant**: Contains a single variant for basic testing
- **tiny_batch**: Contains 10 variants for quick tests
- **small_batch**: Contains ~50 variants for moderate testing
- **large_batch**: Contains hundreds of variants for stress testing

Each size category has two format types:

- **.txt**: Contains rsID variants, one per line (requires variant recoding)
- **.vcf**: Contains VCF formatted variants from ClinVar (no recoding required)

## Current File Contents

> **Note:** Based on benchmarking results, some files need to be regenerated to contain the correct number of variants. The commands provided below can be used to create proper benchmark files with the expected variant counts. This is particularly important for `large_batch.txt` which currently has the same content as `small_batch.txt`.

### Text Files (rsID Format)

- **single_variant.txt**: Contains 1 rsID variant
- **tiny_batch.txt**: Contains 10 rsID variants
- **small_batch.txt**: Contains 55 rsID variants (used for ~50 variant tests)
- **large_batch.txt**: Contains 55 rsID variants currently (should be regenerated to contain ~500)

### VCF Files

- **single_variant.vcf**: Contains 1 variant from ClinVar
- **tiny_batch.vcf**: Contains 10 variants from ClinVar
- **small_batch.vcf**: Contains ~50 variants from ClinVar
- **large_batch.vcf**: Contains hundreds of variants from ClinVar

The VCF files include standard ClinVar header information and contain variants with various annotations including:

- CLNDISDB (disease database references)
- CLNDN (disease names)
- CLNHGVS (HGVS expressions)
- CLNREVSTAT (review status)
- CLNSIG (clinical significance)
- RS (rsID references for some variants)

## File Generation

### rsID Files Generation

The rsID format files are simple text files containing one rsID per line. These can be created manually or by extracting rsIDs from existing variant databases.

#### Linux Commands for Text Files

```bash
# Create a single variant file
echo "rs1801133" > single_variant.txt

# Create a tiny batch (10 variants)
cat > tiny_batch.txt << EOL
rs548392885
rs1795445397
rs1470809474
rs372013056
rs1555614386
rs1818720104
rs2236654
rs746384838
rs199967428
rs1801133
EOL

# Extract rsIDs from a VCF file (requires bcftools)
bcftools query -f '%ID\n' source.vcf | grep -E '^rs[0-9]+$' | head -50 > small_batch.txt
bcftools query -f '%ID\n' source.vcf | grep -E '^rs[0-9]+$' | head -500 > large_batch.txt

# Remove null bytes if present
tr -d '\000' < tiny_batch.txt > temp_file && mv temp_file tiny_batch.txt
```

#### Windows Commands for Text Files

```powershell
# Create a single variant file
"rs1801133" | Out-File -FilePath single_variant.txt -Encoding utf8

# Create a tiny batch (10 variants)
@"
rs548392885
rs1795445397
rs1470809474
rs372013056
rs1555614386
rs1818720104
rs2236654
rs746384838
rs199967428
rs1801133
"@ | Out-File -FilePath tiny_batch.txt -Encoding utf8

# Extract rsIDs from a VCF file (requires bcftools in PATH)
bcftools query -f '%ID\n' source.vcf | Select-String -Pattern '^rs[0-9]+$' | Select-Object -First 50 | Out-File small_batch.txt -Encoding utf8
bcftools query -f '%ID\n' source.vcf | Select-String -Pattern '^rs[0-9]+$' | Select-Object -First 500 | Out-File large_batch.txt -Encoding utf8

# Remove null bytes if present
$content = [System.IO.File]::ReadAllBytes("tiny_batch.txt")
$newBytes = $content | Where-Object { $_ -ne 0 }
[System.IO.File]::WriteAllBytes("tiny_batch.txt", $newBytes)
```

### VCF Files Generation

VCF files require proper formatting with headers and variant information. The simplest approach is to extract subsets from existing VCF files.

#### Linux Commands for VCF Files

```bash
# Download the latest ClinVar VCF (if needed)
wget -c ftp://ftp.ncbi.nlm.nih.gov/pub/clinvar/vcf_GRCh38/clinvar.vcf.gz -O clinvar_GRCh38.vcf.gz

# Extract header and specific number of variants from a source VCF
# For single variant
(zcat clinvar_GRCh38.vcf.gz | grep "^#"; zcat clinvar_GRCh38.vcf.gz | grep -v "^#" | head -1) > single_variant.vcf

# For tiny batch (10 variants)
(zcat clinvar_GRCh38.vcf.gz | grep "^#"; zcat clinvar_GRCh38.vcf.gz | grep -v "^#" | head -10) > tiny_batch.vcf

# For small and large batches
(zcat clinvar_GRCh38.vcf.gz | grep "^#"; zcat clinvar_GRCh38.vcf.gz | grep -v "^#" | head -50) > small_batch.vcf
(zcat clinvar_GRCh38.vcf.gz | grep "^#"; zcat clinvar_GRCh38.vcf.gz | grep -v "^#" | head -500) > large_batch.vcf

# Clean up null bytes if present
find . -name "*.vcf" -exec sh -c 'tr -d "\000" < "$1" > "$1.tmp" && mv "$1.tmp" "$1"' _ {} \;
```

#### Windows Commands for VCF Files

```powershell
# Download the latest ClinVar VCF (if needed)
Invoke-WebRequest -Uri "ftp://ftp.ncbi.nlm.nih.gov/pub/clinvar/vcf_GRCh38/clinvar.vcf.gz" -OutFile "clinvar_GRCh38.vcf.gz"

# You'll need a tool like 7-Zip to extract the gzip file on Windows
# Then create VCF files from the extracted source

# For single variant (assuming clinvar.vcf is extracted)
$header = Get-Content -Path "clinvar.vcf" | Where-Object { $_ -match "^#" }
$variants = Get-Content -Path "clinvar.vcf" | Where-Object { $_ -notmatch "^#" } | Select-Object -First 1
$header + $variants | Out-File -FilePath "single_variant.vcf" -Encoding utf8

# For tiny batch (10 variants)
$header = Get-Content -Path "clinvar.vcf" | Where-Object { $_ -match "^#" }
$variants = Get-Content -Path "clinvar.vcf" | Where-Object { $_ -notmatch "^#" } | Select-Object -First 10
$header + $variants | Out-File -FilePath "tiny_batch.vcf" -Encoding utf8

# For small and large batches
$header = Get-Content -Path "clinvar.vcf" | Where-Object { $_ -match "^#" }
$variants = Get-Content -Path "clinvar.vcf" | Where-Object { $_ -notmatch "^#" } | Select-Object -First 50
$header + $variants | Out-File -FilePath "small_batch.vcf" -Encoding utf8

$header = Get-Content -Path "clinvar.vcf" | Where-Object { $_ -match "^#" }
$variants = Get-Content -Path "clinvar.vcf" | Where-Object { $_ -notmatch "^#" } | Select-Object -First 500
$header + $variants | Out-File -FilePath "large_batch.vcf" -Encoding utf8

# Clean up null bytes if present
Get-ChildItem -Path "*.vcf" | ForEach-Object {
    $bytes = [System.IO.File]::ReadAllBytes($_.FullName)
    $newBytes = @()
    foreach ($byte in $bytes) {
        if ($byte -ne 0) {
            $newBytes += $byte
        }
    }
    [System.IO.File]::WriteAllBytes($_.FullName, $newBytes)
}
```

## Data Sources

The sample data provided in this repository was created from:

1. Common rsIDs from ClinVar and dbSNP databases
2. Sample VCF files from the ClinVar FTP site (ftp://ftp.ncbi.nlm.nih.gov/pub/clinvar/vcf_GRCh38/)

## Usage in Benchmarks

When running benchmarks, these files can be used to test performance across different scenarios:

```bash
# Run benchmark with a specific file
node scripts/benchmark.js --input examples/benchmark_data/tiny_batch.txt --verbose

# Run all benchmarks
node scripts/benchmark.js
```

## File Maintenance

When updating these files, ensure:

1. All files have proper line endings (LF) for cross-platform compatibility
2. No null bytes or other binary data is present in the files
3. rsID files contain one variant per line with no additional whitespace
4. VCF files have proper headers and formatting
