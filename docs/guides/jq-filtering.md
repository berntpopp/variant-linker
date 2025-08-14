# JQ Filtering Guide

Learn how to use `jq` to extract specific data from variant-linker JSON output for downstream analysis and reporting.

## Prerequisites

- Install [jq](https://stedolan.github.io/jq/) command-line JSON processor
- variant-linker installed and configured

## Basic Workflow

The typical workflow combines variant-linker with jq for targeted data extraction:

```bash
variant-linker --variant "your_variant" --output JSON | jq 'your_filter'
```

## Common Use Cases

### Extract MANE RefSeq Annotations

Get HGVS coding/protein annotations and VCF coordinates for MANE_Select RefSeq transcripts:

```bash
# Single command pipeline
variant-linker --variant "ENST00000366667:c.803C>T" --output JSON | \
jq -r '.annotationData[] as $anno | 
       $anno.transcript_consequences[] | 
       select(has("mane") and (.mane | contains(["MANE_Select"])) and (.transcript_id | startswith("NM_"))) | 
       [$anno.originalInput, .hgvsc, (.hgvsp // "N/A"), $anno.variantKey] | @tsv'
```

**Output:**
```
ENST00000366667:c.803C>T	NM_001384479.1:c.803C>T	NP_001371408.1:p.Ala268Val	1-230710021-G-A
```

### Save to File and Filter

```bash
# Save JSON output first
variant-linker --variant "ENST00000366667:c.803C>T" --output JSON > variant_output.json

# Then apply jq filter
jq -r '.annotationData[] as $anno | 
       $anno.transcript_consequences[] | 
       select(has("mane") and (.mane | contains(["MANE_Select"])) and (.transcript_id | startswith("NM_"))) | 
       [$anno.originalInput, .hgvsc, (.hgvsp // "N/A"), $anno.variantKey] | @tsv' variant_output.json
```

## Batch Processing with JQ

### Process Multiple Variants

```bash
# Create variants file
echo -e "rs123\nENST00000366667:c.803C>T\n1-100000-A-G" > variants.txt

# Process with batch mode and filter
variant-linker --variants-file variants.txt --output JSON | \
jq -r '.[] | 
       select(.annotationData) | 
       .annotationData[] as $anno | 
       $anno.transcript_consequences[] | 
       select(has("mane") and (.transcript_id | startswith("NM_"))) | 
       "\($anno.originalInput) -> \(.hgvsc)"'
```

## Output Formatting Options

### Tab-Separated Values

```bash
variant-linker --variant "rs123" --output JSON | \
jq -r '.annotationData[] as $anno | 
       $anno.transcript_consequences[] | 
       select(has("mane") and (.transcript_id | startswith("NM_"))) | 
       [.transcript_id, .hgvsc, (.hgvsp // "N/A"), $anno.variantKey] | @tsv'
```

### CSV Format

```bash
variant-linker --variant "rs123" --output JSON | \
jq -r '["Transcript", "HGVS_c", "HGVS_p", "VCF"], 
       (.annotationData[] as $anno | 
        $anno.transcript_consequences[] | 
        select(has("mane") and (.transcript_id | startswith("NM_"))) | 
        [.transcript_id, .hgvsc, (.hgvsp // "N/A"), $anno.variantKey]) | @csv'
```

### JSON Array Output

```bash
variant-linker --variant "rs123" --output JSON | \
jq '[.annotationData[] as $anno | 
     $anno.transcript_consequences[] | 
     select(has("mane") and (.transcript_id | startswith("NM_"))) | 
     {
       transcript: .transcript_id,
       hgvsc: .hgvsc,
       hgvsp: (.hgvsp // null),
       vcf: $anno.variantKey,
       impact: .impact,
       consequence: .consequence_terms[0]
     }]'
```

## Error Handling

### Handle Missing Fields

```bash
variant-linker --variant "rs123" --output JSON | \
jq -r '.annotationData[]? as $anno | 
       $anno.transcript_consequences[]? | 
       select(has("mane") and (.transcript_id | startswith("NM_"))) | 
       "\(.hgvsc // "N/A") | \(.hgvsp // "N/A") | \($anno.variantKey // "N/A")"'
```

### Check for Empty Results

```bash
result=$(variant-linker --variant "invalid" --output JSON | jq -r '.annotationData[]?.transcript_consequences[]? | select(has("mane")) | .hgvsc' 2>/dev/null)
if [ -z "$result" ]; then
    echo "No MANE annotations found"
else
    echo "$result"
fi
```

## Performance Tips

1. **Save JSON first** for multiple queries on the same data
2. **Use compact output** with `jq -c` for large datasets
3. **Filter early** in the jq pipeline to reduce processing
4. **Combine with other tools** like `sort`, `uniq`, `head` for further processing

This guide provides comprehensive examples for extracting and formatting variant annotation data using jq filters with variant-linker output.