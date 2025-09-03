#!/bin/bash

# batch-process-variants.sh
# Bash version of the PowerShell batch processing script
# Batch process variants from CSV file using variant-linker

set -euo pipefail

# Default values
INPUT_CSV=""
OUTPUT_DIR=""
VARIANT_COLUMN=""
ADDITIONAL_PARAMS=""
LOG_FILE=""
START_FROM_ROW=1
END_AT_ROW=0
SKIP_EXISTING=false
SHOW_DETAILS=false
TIMEOUT_SECONDS=120

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Help function
show_help() {
    cat << EOF
Usage: $0 --input-csv <csv-file> --output-dir <output-directory> [options]

Batch process variants from CSV file using variant-linker

Required parameters:
    --input-csv <file>          Path to CSV file containing variants
    --output-dir <dir>          Output directory for JSON files

Optional parameters:
    --variant-column <name>     Column name containing variants (auto-detected if not specified)
    --additional-params <str>   Additional variant-linker parameters
    --log-file <file>           Path for detailed log file
    --start-from-row <num>      Resume from specific row number (1-based, default: 1)
    --end-at-row <num>          Process only up to this row number (1-based, default: all rows)
    --skip-existing             Skip processing if output file already exists
    --show-details              Show detailed progress information
    --timeout <seconds>         Timeout in seconds for each variant (default: 120)
    --help                      Show this help message

Examples:
    $0 --input-csv "variants.csv" --output-dir "results"
    $0 --input-csv "variants.csv" --output-dir "results" --variant-column "HGVS" --log-file "process.log"
    $0 --input-csv "variants.csv" --output-dir "results" --start-from-row 100 --end-at-row 200 --skip-existing
EOF
}

# Logging function
write_log() {
    local message="$1"
    local level="${2:-INFO}"
    local to_console="${3:-true}"
    
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    local log_entry="[$timestamp] [$level] $message"
    
    if [[ -n "$LOG_FILE" ]]; then
        echo "$log_entry" >> "$LOG_FILE"
    fi
    
    if [[ "$to_console" == "true" ]]; then
        case "$level" in
            "INFO")    echo -e "${BLUE}$log_entry${NC}" ;;
            "SUCCESS") echo -e "${GREEN}$log_entry${NC}" ;;
            "WARNING") echo -e "${YELLOW}$log_entry${NC}" ;;
            "ERROR")   echo -e "${RED}$log_entry${NC}" ;;
            *)         echo "$log_entry" ;;
        esac
    fi
}

# Mathematical helper functions that work with or without bc
calculate() {
    local expression="$1"
    if command -v bc >/dev/null 2>&1; then
        echo "$expression" | bc -l
    else
        # Simple shell arithmetic fallback (integer only)
        echo "$(($expression))"
    fi
}

calculate_percentage() {
    local numerator="$1"
    local denominator="$2"
    if command -v bc >/dev/null 2>&1; then
        echo "scale=1; ($numerator * 100) / $denominator" | bc -l
    else
        # Shell arithmetic fallback
        echo "$(((numerator * 100) / denominator))"
    fi
}

calculate_rate() {
    local processed="$1"
    local elapsed="$2"
    if command -v bc >/dev/null 2>&1; then
        echo "scale=1; ($processed * 60) / $elapsed" | bc -l
    else
        # Shell arithmetic fallback
        if [[ $elapsed -gt 0 ]]; then
            echo "$(((processed * 60) / elapsed))"
        else
            echo "0"
        fi
    fi
}

# Test variant-linker availability
test_variant_linker() {
    local project_root
    project_root=$(dirname "$0")/..
    
    # First try node src/main.js from the project root
    if [[ -f "$project_root/src/main.js" ]]; then
        if command -v node >/dev/null 2>&1; then
            if (cd "$project_root" && node src/main.js --help >/dev/null 2>&1); then
                echo "node|$(realpath "$project_root")"
                return 0
            fi
        fi
    fi
    
    # Try variant-linker in PATH
    if command -v variant-linker >/dev/null 2>&1; then
        if variant-linker --help >/dev/null 2>&1; then
            echo "variant-linker|$(pwd)"
            return 0
        fi
    fi
    
    return 1
}

# Auto-detect variant column
find_variant_column() {
    local csv_file="$1"
    local headers
    
    # Read first line and split by comma
    headers=$(head -n 1 "$csv_file" | tr ',' '\n' | sed 's/"//g' | sed 's/^[ \t]*//;s/[ \t]*$//')
    
    local variant_patterns=("variant" "hgvs" "notation" "mutation" "change" "c\." "p\." "NM_" "NR_" "rs" "chr")
    
    # Check each header against patterns
    local line_num=1
    while IFS= read -r header; do
        for pattern in "${variant_patterns[@]}"; do
            if [[ "$header" =~ $pattern ]]; then
                echo "$header"
                return 0
            fi
        done
        ((line_num++))
    done <<< "$headers"
    
    # Default to first column if no match
    echo "$headers" | head -n 1
}

# Get column number from column name
get_column_number() {
    local csv_file="$1"
    local column_name="$2"
    local headers
    
    headers=$(head -n 1 "$csv_file" | tr ',' '\n' | sed 's/"//g' | sed 's/^[ \t]*//;s/[ \t]*$//')
    
    local line_num=1
    while IFS= read -r header; do
        if [[ "$header" == "$column_name" ]]; then
            echo "$line_num"
            return 0
        fi
        ((line_num++))
    done <<< "$headers"
    
    return 1
}

# Process single variant
invoke_variant_linker() {
    local variant="$1"
    local output_file="$2"
    local variant_linker_info="$3"
    
    local cmd working_dir
    IFS='|' read -r cmd working_dir <<< "$variant_linker_info"
    
    local original_dir
    original_dir=$(pwd)
    
    cd "$working_dir" || return 1
    
    local args=()
    if [[ "$cmd" == "node" ]]; then
        args=("node" "src/main.js" "--variant" "$variant" "--output" "JSON" "--of" "$output_file")
    else
        args=("$cmd" "--variant" "$variant" "--output" "JSON" "--of" "$output_file")
    fi
    
    if [[ -n "$ADDITIONAL_PARAMS" ]]; then
        # Split additional params by space and add to args
        read -ra additional_array <<< "$ADDITIONAL_PARAMS"
        args+=("${additional_array[@]}")
    fi
    
    if [[ "$SHOW_DETAILS" == "true" ]]; then
        write_log "Executing in $working_dir: ${args[*]}" "INFO" "true"
    fi
    
    local start_time end_time duration exit_code
    start_time=$(date +%s.%N)
    
    # Start process with timeout
    if timeout "${TIMEOUT_SECONDS}s" "${args[@]}" > temp_output.log 2> temp_error.log; then
        exit_code=0
    else
        exit_code=$?
    fi
    
    end_time=$(date +%s.%N)
    duration=$(calculate "$end_time - $start_time")
    
    cd "$original_dir" || return 1
    
    local file_exists="false"
    if [[ -f "$output_file" ]]; then
        file_exists="true"
    fi
    
    write_log "  Completed in ${duration}s (exit code: $exit_code, file exists: $file_exists)" "INFO" "true"
    
    if [[ $exit_code -eq 0 && "$file_exists" == "true" ]]; then
        rm -f temp_error.log temp_output.log 2>/dev/null
        echo "SUCCESS|Processed successfully in ${duration}s"
        return 0
    else
        local error_msg=""
        if [[ -f temp_error.log && -s temp_error.log ]]; then
            error_msg="Error: $(cat temp_error.log)"
        fi
        if [[ -f temp_output.log && -s temp_output.log ]]; then
            local output_content
            output_content=$(cat temp_output.log)
            if [[ -n "$output_content" ]]; then
                error_msg="${error_msg}\nOutput: $output_content"
            fi
        fi
        if [[ -z "$error_msg" ]]; then
            if [[ $exit_code -eq 124 ]]; then
                error_msg="Process timed out or was killed"
            elif [[ $exit_code -eq 0 && "$file_exists" == "false" ]]; then
                error_msg="Process succeeded but output file not created"
            else
                error_msg="Unknown error (exit code: $exit_code)"
            fi
        fi
        rm -f temp_error.log temp_output.log 2>/dev/null
        echo "FAILURE|${error_msg}"
        return 1
    fi
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --input-csv)
                INPUT_CSV="$2"
                shift 2
                ;;
            --output-dir)
                OUTPUT_DIR="$2"
                shift 2
                ;;
            --variant-column)
                VARIANT_COLUMN="$2"
                shift 2
                ;;
            --additional-params)
                ADDITIONAL_PARAMS="$2"
                shift 2
                ;;
            --log-file)
                LOG_FILE="$2"
                shift 2
                ;;
            --start-from-row)
                START_FROM_ROW="$2"
                shift 2
                ;;
            --end-at-row)
                END_AT_ROW="$2"
                shift 2
                ;;
            --skip-existing)
                SKIP_EXISTING=true
                shift
                ;;
            --show-details)
                SHOW_DETAILS=true
                shift
                ;;
            --timeout)
                TIMEOUT_SECONDS="$2"
                shift 2
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

# Main processing function
start_batch_processing() {
    write_log "=== Variant-Linker Batch Processing Started ===" "INFO"
    write_log "Input CSV: $INPUT_CSV" "INFO"
    write_log "Output Directory: $OUTPUT_DIR" "INFO"
    
    # Validate inputs
    if [[ ! -f "$INPUT_CSV" ]]; then
        write_log "Input CSV file not found: $INPUT_CSV" "ERROR"
        exit 1
    fi
    
    # Test variant-linker
    local variant_linker_info
    if ! variant_linker_info=$(test_variant_linker); then
        write_log "variant-linker not found. Please ensure variant-linker is installed or run from project directory." "ERROR"
        exit 1
    fi
    
    local cmd working_dir
    IFS='|' read -r cmd working_dir <<< "$variant_linker_info"
    
    if [[ "$cmd" == "node" ]]; then
        write_log "Using: node src/main.js (from $working_dir)" "INFO"
    else
        write_log "Using: $cmd" "INFO"
    fi
    
    # Create output directory
    if [[ ! -d "$OUTPUT_DIR" ]]; then
        mkdir -p "$OUTPUT_DIR"
        write_log "Created output directory: $OUTPUT_DIR" "INFO"
    fi
    
    # Count CSV rows
    local total_rows
    total_rows=$(($(wc -l < "$INPUT_CSV") - 1)) # Subtract header row
    write_log "Loaded CSV with $total_rows rows" "SUCCESS"
    
    # Determine variant column
    if [[ -z "$VARIANT_COLUMN" ]]; then
        VARIANT_COLUMN=$(find_variant_column "$INPUT_CSV")
        write_log "Auto-detected variant column: '$VARIANT_COLUMN'" "INFO"
    else
        write_log "Using specified variant column: '$VARIANT_COLUMN'" "INFO"
    fi
    
    # Get column number
    local column_num
    if ! column_num=$(get_column_number "$INPUT_CSV" "$VARIANT_COLUMN"); then
        write_log "Variant column '$VARIANT_COLUMN' not found in CSV" "ERROR"
        exit 1
    fi
    
    # Set processing range
    local end_row
    if [[ $END_AT_ROW -gt 0 ]]; then
        end_row=$((END_AT_ROW < total_rows ? END_AT_ROW : total_rows))
    else
        end_row=$total_rows
    fi
    local start_row=$((START_FROM_ROW > 1 ? START_FROM_ROW : 1))
    
    write_log "Processing rows $start_row to $end_row (of $total_rows total)" "INFO"
    
    # Initialize counters
    local processed=0 successful=0 failed=0 skipped=0
    local start_time
    start_time=$(date +%s)
    
    # Process variants
    local current_row=$start_row
    while [[ $current_row -le $end_row ]]; do
        local row_num=$((current_row + 1)) # Add 1 for header row
        
        # Extract variant from CSV
        local variant
        variant=$(sed -n "${row_num}p" "$INPUT_CSV" | cut -d',' -f"$column_num" | sed 's/"//g' | sed 's/^[ \t]*//;s/[ \t]*$//')
        
        # Skip empty variants
        if [[ -z "$variant" ]]; then
            write_log "Row ${current_row}: Empty variant, skipping" "WARNING"
            ((skipped++))
            ((current_row++))
            continue
        fi
        
        # Generate output filename
        local output_file
        output_file=$(realpath "$OUTPUT_DIR")/$(printf "var_%04d.json" "$current_row")
        
        # Skip if file exists and SkipExisting is set
        if [[ "$SKIP_EXISTING" == "true" && -f "$output_file" ]]; then
            if [[ "$SHOW_DETAILS" == "true" ]]; then
                write_log "Row ${current_row}: Output exists, skipping ($variant)" "INFO"
            fi
            ((skipped++))
            ((current_row++))
            continue
        fi
        
        # Update progress
        ((processed++))
        local percent_complete
        percent_complete=$(calculate_percentage "$processed" "$((end_row - start_row + 1))")
        
        write_log "Row ${current_row}: Processing '$variant' (${percent_complete}%)" "INFO"
        
        # Process variant
        local result
        if result=$(invoke_variant_linker "$variant" "$output_file" "$variant_linker_info"); then
            local status message
            IFS='|' read -r status message <<< "$result"
            ((successful++))
            write_log "Row ${current_row}: SUCCESS - $variant ($message)" "SUCCESS"
        else
            local status message
            IFS='|' read -r status message <<< "$result"
            ((failed++))
            write_log "Row ${current_row}: FAILED - $variant - $message" "ERROR"
        fi
        
        # Show periodic progress
        if [[ $((processed % 10)) -eq 0 ]]; then
            local elapsed current_time rate eta
            current_time=$(date +%s)
            elapsed=$((current_time - start_time))
            rate=$(calculate_rate "$processed" "$elapsed")
            if [[ $(echo "$rate > 0" | bc -l 2>/dev/null || echo "$((rate > 0))") -eq 1 ]]; then
                local remaining
                remaining=$((end_row - start_row + 1 - processed))
                eta=$(calculate "$remaining / $rate" 2>/dev/null || echo "$((remaining / rate))")
            else
                eta="N/A"
            fi
            
            write_log "Progress: $processed processed, $successful successful, $failed failed, $skipped skipped (${rate}/min, ETA: ${eta}min)" "INFO"
        fi
        
        ((current_row++))
    done
    
    # Final summary
    local end_time duration total_processed
    end_time=$(date +%s)
    duration=$((end_time - start_time))
    total_processed=$((successful + failed))
    
    write_log "=== Batch Processing Complete ===" "SUCCESS"
    write_log "Total Duration: $(printf '%02d:%02d:%02d' $((duration / 3600)) $((duration % 3600 / 60)) $((duration % 60)))" "INFO"
    write_log "Rows Processed: $total_processed" "INFO"
    write_log "Successful: $successful" "SUCCESS"
    if [[ $failed -gt 0 ]]; then
        write_log "Failed: $failed" "ERROR"
    else
        write_log "Failed: $failed" "INFO"
    fi
    write_log "Skipped: $skipped" "INFO"
    if [[ $total_processed -gt 0 ]]; then
        local success_rate
        success_rate=$(calculate_percentage "$successful" "$total_processed")
        write_log "Success Rate: ${success_rate}%" "INFO"
    else
        write_log "Success Rate: 0%" "INFO"
    fi
    write_log "Output Directory: $OUTPUT_DIR" "INFO"
    
    if [[ $failed -gt 0 ]]; then
        write_log "Check log file for error details: $LOG_FILE" "WARNING"
        exit 1
    fi
}

# Main execution
main() {
    # Check if bc is available - warn but don't fail
    if ! command -v bc >/dev/null 2>&1; then
        echo "Warning: 'bc' command not found. Some mathematical operations will use shell arithmetic instead." >&2
    fi
    
    # Parse arguments
    parse_args "$@"
    
    # Validate required parameters
    if [[ -z "$INPUT_CSV" ]]; then
        echo "Error: --input-csv is required" >&2
        show_help
        exit 1
    fi
    
    if [[ -z "$OUTPUT_DIR" ]]; then
        echo "Error: --output-dir is required" >&2
        show_help
        exit 1
    fi
    
    # Initialize logging
    if [[ -n "$LOG_FILE" ]]; then
        echo "=== Variant-Linker Batch Processing Bash Script Log ===" > "$LOG_FILE"
        write_log "Script started with parameters: InputCsv='$INPUT_CSV', OutputDir='$OUTPUT_DIR'" "INFO"
    fi
    
    # Start processing
    start_batch_processing
}

# Execute main function if script is run directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi