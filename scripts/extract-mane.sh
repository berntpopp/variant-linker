#!/bin/bash

# extract-mane.sh
# Bash version of the PowerShell MANE extraction script
# Extract MANE Select RefSeq transcript annotations from variant-linker JSON output

set -euo pipefail

# Default values
INPUT_PATH=""
OUTPUT_FILE=""
INCLUDE_HEADER=false
LOG_FILE=""
INCLUDE_FILENAME=false
STRONGEST_IMPACT_ONLY=false
MANE_ONLY=false

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Impact hierarchy for strongest impact filtering
declare -A IMPACT_HIERARCHY=(
    ["HIGH"]=4
    ["MODERATE"]=3
    ["LOW"]=2
    ["MODIFIER"]=1
)

# Help function
show_help() {
    cat << EOF
Usage: $0 --input-path <path> [options]

Extract MANE Select RefSeq transcript annotations from variant-linker JSON output

Required parameters:
    --input-path <path>         Path to JSON file or directory containing JSON files

Optional parameters:
    --output-file <file>        Path to save TSV output (console if omitted)
    --include-header            Include column headers in output
    --log-file <file>           Path to log file for detailed processing
    --include-filename          Include source filename column
    --strongest-impact-only     Show only consequences with strongest impact
    --mane-only                Show only MANE Select transcripts (exclude other RefSeq)
    --help                      Show this help message

Examples:
    $0 --input-path "variant_output.json"
    $0 --input-path "variant_output.json" --output-file "mane_results.tsv" --include-header
    $0 --input-path "/path/to/json_files/" --output-file "all_mane.tsv" --include-header
    $0 --input-path "variant_output.json" --strongest-impact-only --include-header
    $0 --input-path "./json_files/" --mane-only --strongest-impact-only --include-header
EOF
}

# Logging function
write_log() {
    local message="$1"
    local level="${2:-INFO}"
    
    if [[ -n "$LOG_FILE" ]]; then
        local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
        local log_entry="[$timestamp] [$level] $message"
        echo "$log_entry" >> "$LOG_FILE"
    fi
}

# Process a single JSON file
process_json_file() {
    local file_path="$1"
    local file_name="$2"
    
    write_log "Processing file: $file_path" "INFO"
    
    # Check if file exists and is readable
    if [[ ! -f "$file_path" ]]; then
        local error_msg="File not found"
        write_log "$file_path - $error_msg" "ERROR"
        if [[ "$INCLUDE_FILENAME" == "true" ]]; then
            echo -e "$file_name\tERROR\t$error_msg\tN/A\tN/A\tN/A"
        else
            echo -e "ERROR\t$error_msg\tN/A\tN/A\tN/A"
        fi
        return 1
    fi
    
    # Check if file is valid JSON
    if ! jq empty "$file_path" >/dev/null 2>&1; then
        local error_msg="Invalid JSON format"
        write_log "$file_path - $error_msg" "ERROR"
        if [[ "$INCLUDE_FILENAME" == "true" ]]; then
            echo -e "$file_name\tERROR\t$error_msg\tN/A\tN/A\tN/A"
        else
            echo -e "ERROR\t$error_msg\tN/A\tN/A\tN/A"
        fi
        return 1
    fi
    
    # Check if annotationData exists
    local has_annotation_data
    has_annotation_data=$(jq 'has("annotationData")' "$file_path")
    
    if [[ "$has_annotation_data" != "true" ]]; then
        local error_msg="No annotationData found in file"
        write_log "$file_path - $error_msg" "WARNING"
        if [[ "$INCLUDE_FILENAME" == "true" ]]; then
            echo -e "$file_name\tERROR\t$error_msg\tN/A\tN/A\tN/A"
        else
            echo -e "ERROR\t$error_msg\tN/A\tN/A\tN/A"
        fi
        return 1
    fi
    
    # Build jq filter based on options
    local jq_filter='.annotationData[] as $anno | '
    
    # Filter for RefSeq/NCBI transcripts first (exclude predicted XM_/XP_/XR_ transcripts)
    jq_filter+='($anno.transcript_consequences // [] | map(select(.transcript_id and (.transcript_id | startswith("NM_") or startswith("NR_") or startswith("NP_")) and (.transcript_id | (startswith("XM_") or startswith("XR_") or startswith("XP_")) | not))))'
    
    if [[ "$MANE_ONLY" == "true" ]]; then
        # Only MANE Select transcripts
        jq_filter+=' | map(select(.mane and (.mane | contains("MANE_Select"))))'
    else
        # Prefer MANE Select, fall back to other RefSeq
        jq_filter+=' as $refseq | (($refseq | map(select(.mane and (.mane | contains("MANE_Select"))))) as $mane | if ($mane | length) > 0 then $mane else $refseq end)'
    fi
    
    # Apply strongest impact filter if requested
    if [[ "$STRONGEST_IMPACT_ONLY" == "true" ]]; then
        jq_filter+=' as $consequences | if ($consequences | length) > 0 then ($consequences | group_by(.impact) | max_by(map(if .impact == "HIGH" then 4 elif .impact == "MODERATE" then 3 elif .impact == "LOW" then 2 else 1 end) | max)) else [] end'
    fi
    
    # Filter out consequences with empty hgvsc and deduplicate by transcript_id
    jq_filter+=' | map(select(.hgvsc and (.hgvsc | length > 0))) | unique_by(.transcript_id)'
    
    # Format output
    jq_filter+=' | .[] | [($anno.originalInput // "N/A"), (.hgvsc // "N/A"), (.hgvsp // "N/A"), (.gene_symbol // "N/A"), ($anno.variantKey // "N/A")] | @tsv'
    
    # Add filename if requested
    if [[ "$INCLUDE_FILENAME" == "true" ]]; then
        jq_filter='["'"$file_name"'"] + ('"${jq_filter%' | @tsv'}"') | @tsv'
    fi
    
    # Process the file
    local transcript_results
    transcript_results=$(jq -r "$jq_filter" "$file_path" 2>/dev/null)
    
    if [[ -n "$transcript_results" ]]; then
        local processed_count
        processed_count=$(echo "$transcript_results" | wc -l)
        local type_msg
        type_msg=$(if [[ "$MANE_ONLY" == "true" ]]; then echo "MANE Select"; else echo "standard RefSeq"; fi)
        local filter_msg
        filter_msg=$(if [[ "$STRONGEST_IMPACT_ONLY" == "true" ]]; then echo " (strongest impact only)"; else echo ""; fi)
        write_log "$file_path - Found $processed_count $type_msg transcript(s)$filter_msg" "INFO"
        echo "$transcript_results"
    else
        local warning_msg
        warning_msg=$(if [[ "$MANE_ONLY" == "true" ]]; then echo "No MANE Select transcripts found"; else echo "No standard RefSeq/NCBI transcripts found"; fi)
        write_log "$file_path - $warning_msg" "WARNING"
        if [[ "$INCLUDE_FILENAME" == "true" ]]; then
            echo -e "$file_name\tWARNING\t$warning_msg\tN/A\tN/A\tN/A"
        else
            echo -e "WARNING\t$warning_msg\tN/A\tN/A\tN/A"
        fi
    fi
    
    return 0
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --input-path)
                INPUT_PATH="$2"
                shift 2
                ;;
            --output-file)
                OUTPUT_FILE="$2"
                shift 2
                ;;
            --include-header)
                INCLUDE_HEADER=true
                shift
                ;;
            --log-file)
                LOG_FILE="$2"
                shift 2
                ;;
            --include-filename)
                INCLUDE_FILENAME=true
                shift
                ;;
            --strongest-impact-only)
                STRONGEST_IMPACT_ONLY=true
                shift
                ;;
            --mane-only)
                MANE_ONLY=true
                shift
                ;;
            --help)
                show_help
                exit 0
                ;;
            *)
                echo "Unknown option: $1" >&2
                show_help
                exit 1
                ;;
        esac
    done
}

# Main processing logic
main() {
    # Check if jq is available
    if ! command -v jq >/dev/null 2>&1; then
        echo "Error: 'jq' command not found. Please install jq for JSON processing." >&2
        exit 1
    fi
    
    # Parse arguments
    parse_args "$@"
    
    # Validate required parameters
    if [[ -z "$INPUT_PATH" ]]; then
        echo "Error: --input-path is required" >&2
        show_help
        exit 1
    fi
    
    # Initialize logging
    if [[ -n "$LOG_FILE" ]]; then
        echo "=== MANE Extract Bash Script Log ===" > "$LOG_FILE"
        write_log "Script started with parameters: InputPath='$INPUT_PATH', OutputFile='$OUTPUT_FILE'" "INFO"
    fi
    
    # Validate input path
    if [[ ! -e "$INPUT_PATH" ]]; then
        write_log "Input path '$INPUT_PATH' not found." "ERROR"
        echo "Error: Input path '$INPUT_PATH' not found." >&2
        exit 1
    fi
    
    local all_results=()
    local total_processed=0
    local total_errors=0
    local files_processed=0
    
    # Collect all output first
    local output_lines=()
    
    # Add header if requested
    if [[ "$INCLUDE_HEADER" == "true" ]]; then
        if [[ "$INCLUDE_FILENAME" == "true" ]]; then
            output_lines+=("Source_File"$'\t'"Original_Input"$'\t'"HGVS_Coding"$'\t'"HGVS_Protein"$'\t'"Gene_Symbol"$'\t'"VCF_Coordinates")
        else
            output_lines+=("Original_Input"$'\t'"HGVS_Coding"$'\t'"HGVS_Protein"$'\t'"Gene_Symbol"$'\t'"VCF_Coordinates")
        fi
    fi
    
    # Determine if input is file or directory
    if [[ -d "$INPUT_PATH" ]]; then
        # Directory processing
        write_log "Processing directory: $INPUT_PATH" "INFO"
        
        local json_files
        json_files=$(find "$INPUT_PATH" -name "*.json" -type f)
        local file_count
        file_count=$(echo "$json_files" | wc -w)
        
        if [[ -z "$json_files" || "$file_count" -eq 0 ]]; then
            write_log "No JSON files found in directory '$INPUT_PATH'." "ERROR"
            echo "Error: No JSON files found in directory '$INPUT_PATH'." >&2
            exit 1
        fi
        
        write_log "Found $file_count JSON files to process" "INFO"
        
        # Force include filename for directory mode
        INCLUDE_FILENAME=true
        
        local current_file=0
        while IFS= read -r file; do
            if [[ -n "$file" ]]; then
                ((current_file++))
                ((files_processed++))
                
                local file_name
                file_name=$(basename "$file")
                
                # Process file and collect output
                local file_output
                if file_output=$(process_json_file "$file" "$file_name"); then
                    if [[ -n "$file_output" ]]; then
                        while IFS= read -r line; do
                            output_lines+=("$line")
                        done <<< "$file_output"
                        ((total_processed++))
                    fi
                else
                    ((total_errors++))
                fi
            fi
        done <<< "$json_files"
        
    else
        # Single file processing
        if [[ ! "$INPUT_PATH" =~ \.json$ ]]; then
            write_log "Input file does not have .json extension: $INPUT_PATH" "WARNING"
        fi
        
        local file_name=""
        if [[ "$INCLUDE_FILENAME" == "true" ]]; then
            file_name=$(basename "$INPUT_PATH")
        fi
        
        # Process file and collect output
        local file_output
        if file_output=$(process_json_file "$INPUT_PATH" "$file_name"); then
            if [[ -n "$file_output" ]]; then
                while IFS= read -r line; do
                    output_lines+=("$line")
                done <<< "$file_output"
                ((total_processed++))
            fi
        else
            ((total_errors++))
        fi
        files_processed=1
    fi
    
    # Output results
    if [[ -n "$OUTPUT_FILE" ]]; then
        # Output to file
        printf '%s\n' "${output_lines[@]}" > "$OUTPUT_FILE"
        echo "Results written to: $OUTPUT_FILE" >&2
        write_log "Results written to: $OUTPUT_FILE" "INFO"
    else
        # Output to console
        printf '%s\n' "${output_lines[@]}"
    fi
    
    # Summary reporting
    local summary_msg="Processing complete: $files_processed file(s) processed, $total_processed transcript(s) found, $total_errors error(s)"
    write_log "$summary_msg" "INFO"
    
    if [[ $total_errors -gt 0 ]]; then
        echo "Check output for ERROR/WARNING entries or log file for details" >&2
    fi
    
    return 0
}

# Execute main function if script is run directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi