param(
    [Parameter(Mandatory=$true, HelpMessage="Path to CSV file containing variants")]
    [string]$InputCsv,
    
    [Parameter(Mandatory=$true, HelpMessage="Output directory for JSON files")]
    [string]$OutputDir,
    
    [Parameter(Mandatory=$false, HelpMessage="Column name containing variants (auto-detected if not specified)")]
    [string]$VariantColumn,
    
    [Parameter(Mandatory=$false, HelpMessage="Additional variant-linker parameters")]
    [string]$AdditionalParams = "",
    
    [Parameter(Mandatory=$false, HelpMessage="Log file path")]
    [string]$LogFile,
    
    [Parameter(Mandatory=$false, HelpMessage="Resume from specific row number (1-based)")]
    [int]$StartFromRow = 1,
    
    [Parameter(Mandatory=$false, HelpMessage="Process only up to this row number (1-based)")]
    [int]$EndAtRow = 0,
    
    [Parameter(Mandatory=$false, HelpMessage="Skip existing output files")]
    [switch]$SkipExisting,
    
    [Parameter(Mandatory=$false, HelpMessage="Show detailed progress information")]
    [switch]$ShowDetails,
    
    [Parameter(Mandatory=$false, HelpMessage="Timeout in seconds for each variant (default: 120)")]
    [int]$TimeoutSeconds = 120
)

<#
.SYNOPSIS
Batch process variants from CSV file using variant-linker

.DESCRIPTION
This script reads variants from a CSV file and processes each one through variant-linker,
generating individual JSON output files with systematic naming (var_0001.json, var_0002.json, etc.).

.EXAMPLE
.\batch-process-variants.ps1 -InputCsv "variants.csv" -OutputDir "results"

.EXAMPLE
.\batch-process-variants.ps1 -InputCsv "variants.csv" -OutputDir "results" -VariantColumn "HGVS" -LogFile "process.log"

.EXAMPLE
.\batch-process-variants.ps1 -InputCsv "variants.csv" -OutputDir "results" -StartFromRow 100 -EndAtRow 200 -SkipExisting
#>

# Initialize logging
function Write-Log {
    param(
        [string]$Message,
        [ValidateSet("INFO", "WARNING", "ERROR", "SUCCESS")]
        [string]$Level = "INFO",
        [switch]$ToConsole = $true
    )
    
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logEntry = "[$timestamp] [$Level] $Message"
    
    if ($LogFile) {
        $logEntry | Out-File -FilePath $LogFile -Append -Encoding UTF8
    }
    
    if ($ToConsole) {
        switch ($Level) {
            "INFO" { Write-Host $logEntry -ForegroundColor White }
            "SUCCESS" { Write-Host $logEntry -ForegroundColor Green }
            "WARNING" { Write-Host $logEntry -ForegroundColor Yellow }
            "ERROR" { Write-Host $logEntry -ForegroundColor Red }
        }
    }
}

# Validate variant-linker availability
function Test-VariantLinker {
    # First try node src/main.js from the project root
    try {
        $projectRoot = Split-Path $PSScriptRoot -Parent
        Push-Location $projectRoot
        $result = & "node" "src/main.js" --help 2>$null
        Pop-Location
        if ($LASTEXITCODE -eq 0) {
            return @{ Command = "node"; WorkingDir = $projectRoot }
        }
    } catch {
        Pop-Location -ErrorAction SilentlyContinue
    }
    
    # Try variant-linker in PATH
    try {
        $result = & "variant-linker" --help 2>$null
        if ($LASTEXITCODE -eq 0) {
            return @{ Command = "variant-linker"; WorkingDir = (Get-Location).Path }
        }
    } catch {}
    
    return $false
}

# Auto-detect variant column
function Find-VariantColumn {
    param([hashtable]$Headers)
    
    $variantPatterns = @(
        "variant", "hgvs", "notation", "mutation", "change",
        "c\.", "p\.", "NM_", "NR_", "rs", "chr"
    )
    
    foreach ($header in $Headers.Keys) {
        foreach ($pattern in $variantPatterns) {
            if ($header -match $pattern) {
                return $header
            }
        }
    }
    
    # Default to first column if no match
    return ($Headers.Keys | Select-Object -First 1)
}

# Process single variant
function Invoke-VariantLinker {
    param(
        [string]$Variant,
        [string]$OutputFile,
        [hashtable]$VariantLinkerInfo
    )
    
    try {
        # Set working directory and build command
        $originalLocation = Get-Location
        Set-Location $VariantLinkerInfo.WorkingDir
        
        if ($VariantLinkerInfo.Command -eq "node") {
            $cmd = "node"
            $args = @("src/main.js", "--variant", $Variant, "--output", "JSON", "--of", $OutputFile)
        } else {
            $cmd = $VariantLinkerInfo.Command
            $args = @("--variant", $Variant, "--output", "JSON", "--of", $OutputFile)
        }
        
        if ($AdditionalParams) {
            $args += $AdditionalParams.Split(' ')
        }
        
        Write-Log "Executing in $($VariantLinkerInfo.WorkingDir): $cmd $($args -join ' ')" -Level "INFO" -ToConsole:$ShowDetails
        
        # Start process with timeout
        $startTime = Get-Date
        $process = Start-Process -FilePath $cmd -ArgumentList $args -PassThru -NoNewWindow -RedirectStandardError "temp_error.log" -RedirectStandardOutput "temp_output.log"
        
        # Wait with timeout and progress updates
        $timeoutMs = $TimeoutSeconds * 1000
        $checkIntervalMs = 2000  # Check every 2 seconds
        $elapsed = 0
        
        while (-not $process.HasExited -and $elapsed -lt $timeoutMs) {
            Start-Sleep -Milliseconds $checkIntervalMs
            $elapsed += $checkIntervalMs
            $elapsedSeconds = [Math]::Round($elapsed / 1000, 1)
            Write-Log "  Processing... ${elapsedSeconds}s elapsed" -Level "INFO" -ToConsole:$ShowDetails
        }
        
        if (-not $process.HasExited) {
            Write-Log "  Timeout reached (${TimeoutSeconds}s), killing process" -Level "WARNING" -ToConsole:$true
            $process.Kill()
            $process.WaitForExit(5000)  # Wait up to 5s for cleanup
            $exitCode = -1  # Indicate timeout
        } else {
            $process.WaitForExit()  # Ensure we get the exit code
            $exitCode = if ($null -eq $process.ExitCode) { 0 } else { $process.ExitCode }
        }
        
        # Restore original location
        Set-Location $originalLocation
        
        $processingTime = (Get-Date) - $startTime
        $fileExists = Test-Path $OutputFile
        Write-Log "  Completed in $([Math]::Round($processingTime.TotalSeconds, 1))s (exit code: $exitCode, file exists: $fileExists)" -Level "INFO" -ToConsole:$true
        
        if ($exitCode -eq 0 -and $fileExists) {
            Remove-Item "temp_error.log" -ErrorAction SilentlyContinue
            Remove-Item "temp_output.log" -ErrorAction SilentlyContinue
            return @{ Success = $true; Message = "Processed successfully in $([Math]::Round($processingTime.TotalSeconds, 1))s" }
        } else {
            $errorMsg = ""
            if (Test-Path "temp_error.log") { 
                $errorContent = Get-Content "temp_error.log" -Raw
                if ($errorContent.Trim()) { $errorMsg += "Error: $errorContent" }
            }
            if (Test-Path "temp_output.log") { 
                $outputContent = Get-Content "temp_output.log" -Raw
                if ($outputContent.Trim()) { $errorMsg += "`nOutput: $outputContent" }
            }
            if (-not $errorMsg) {
                if ($exitCode -eq -1) {
                    $errorMsg = "Process timed out or was killed"
                } elseif ($exitCode -eq 0 -and -not (Test-Path $OutputFile)) {
                    $errorMsg = "Process succeeded but output file not created"
                } else {
                    $errorMsg = "Unknown error (exit code: $exitCode)"
                }
            }
            Remove-Item "temp_error.log" -ErrorAction SilentlyContinue
            Remove-Item "temp_output.log" -ErrorAction SilentlyContinue
            return @{ Success = $false; Message = $errorMsg.Trim() }
        }
    } catch {
        Set-Location $originalLocation -ErrorAction SilentlyContinue
        return @{ Success = $false; Message = $_.Exception.Message }
    }
}

# Main processing function
function Start-BatchProcessing {
    Write-Log "=== Variant-Linker Batch Processing Started ===" -Level "INFO"
    Write-Log "Input CSV: $InputCsv" -Level "INFO"
    Write-Log "Output Directory: $OutputDir" -Level "INFO"
    
    # Validate inputs
    if (-not (Test-Path $InputCsv)) {
        Write-Log "Input CSV file not found: $InputCsv" -Level "ERROR"
        exit 1
    }
    
    # Test variant-linker
    $variantLinkerInfo = Test-VariantLinker
    if (-not $variantLinkerInfo) {
        Write-Log "variant-linker not found. Please ensure variant-linker is installed or run from project directory." -Level "ERROR"
        exit 1
    }
    
    if ($variantLinkerInfo.Command -eq "node") {
        Write-Log "Using: node src/main.js (from $($variantLinkerInfo.WorkingDir))" -Level "INFO"
    } else {
        Write-Log "Using: $($variantLinkerInfo.Command)" -Level "INFO"
    }
    
    # Create output directory
    if (-not (Test-Path $OutputDir)) {
        New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
        Write-Log "Created output directory: $OutputDir" -Level "INFO"
    }
    
    # Read and parse CSV
    try {
        $csvData = Import-Csv -Path $InputCsv
        Write-Log "Loaded CSV with $($csvData.Count) rows" -Level "SUCCESS"
    } catch {
        Write-Log "Failed to read CSV file: $($_.Exception.Message)" -Level "ERROR"
        exit 1
    }
    
    # Determine variant column
    if (-not $VariantColumn) {
        $headers = @{}
        ($csvData | Get-Member -MemberType NoteProperty).Name | ForEach-Object { $headers[$_] = $true }
        $VariantColumn = Find-VariantColumn -Headers $headers
        Write-Log "Auto-detected variant column: '$VariantColumn'" -Level "INFO"
    } else {
        Write-Log "Using specified variant column: '$VariantColumn'" -Level "INFO"
    }
    
    # Validate column exists
    if (-not ($csvData | Get-Member -Name $VariantColumn -MemberType NoteProperty)) {
        Write-Log "Variant column '$VariantColumn' not found in CSV" -Level "ERROR"
        exit 1
    }
    
    # Set processing range
    $totalRows = $csvData.Count
    $endRow = if ($EndAtRow -gt 0) { [Math]::Min($EndAtRow, $totalRows) } else { $totalRows }
    $startRow = [Math]::Max(1, $StartFromRow)
    
    Write-Log "Processing rows $startRow to $endRow (of $totalRows total)" -Level "INFO"
    
    # Initialize counters
    $processed = 0
    $successful = 0
    $failed = 0
    $skipped = 0
    $startTime = Get-Date
    
    # Process variants
    for ($i = $startRow - 1; $i -lt $endRow; $i++) {
        $rowNum = $i + 1
        $variant = $csvData[$i].$VariantColumn
        
        # Skip empty variants
        if ([string]::IsNullOrWhiteSpace($variant)) {
            Write-Log "Row ${rowNum}: Empty variant, skipping" -Level "WARNING"
            $skipped++
            continue
        }
        
        # Generate output filename (use absolute path)
        $outputFile = Join-Path (Resolve-Path $OutputDir).Path ("var_{0:D4}.json" -f $rowNum)
        
        # Skip if file exists and SkipExisting is set
        if ($SkipExisting -and (Test-Path $outputFile)) {
            Write-Log "Row ${rowNum}: Output exists, skipping ($variant)" -Level "INFO" -ToConsole:$ShowDetails
            $skipped++
            continue
        }
        
        # Update progress
        $processed++
        $percentComplete = [Math]::Round(($processed / ($endRow - $startRow + 1)) * 100, 1)
        Write-Progress -Activity "Processing Variants" -Status "Row $rowNum/$endRow ($percentComplete%) - $variant" -PercentComplete $percentComplete
        
        Write-Log "Row ${rowNum}: Processing '$variant'" -Level "INFO" -ToConsole:$true
        
        # Process variant
        $result = Invoke-VariantLinker -Variant $variant -OutputFile $outputFile -VariantLinkerInfo $variantLinkerInfo
        
        if ($result.Success) {
            $successful++
            Write-Log "Row ${rowNum}: SUCCESS - $variant ($($result.Message))" -Level "SUCCESS" -ToConsole:$true
        } else {
            $failed++
            Write-Log "Row ${rowNum}: FAILED - $variant - $($result.Message)" -Level "ERROR"
        }
        
        # Show periodic progress
        if ($processed % 10 -eq 0) {
            $elapsed = (Get-Date) - $startTime
            $rate = $processed / $elapsed.TotalMinutes
            $eta = if ($rate -gt 0) { 
                $remaining = ($endRow - $startRow + 1) - $processed
                [Math]::Round($remaining / $rate, 1) 
            } else { "N/A" }
            
            Write-Log "Progress: $processed processed, $successful successful, $failed failed, $skipped skipped (${rate:F1}/min, ETA: ${eta}min)" -Level "INFO"
        }
    }
    
    Write-Progress -Activity "Processing Variants" -Completed
    
    # Final summary
    $endTime = Get-Date
    $duration = $endTime - $startTime
    $totalProcessed = $successful + $failed
    
    Write-Log "=== Batch Processing Complete ===" -Level "SUCCESS"
    Write-Log "Total Duration: $($duration.ToString('hh\:mm\:ss'))" -Level "INFO"
    Write-Log "Rows Processed: $totalProcessed" -Level "INFO"
    Write-Log "Successful: $successful" -Level "SUCCESS"
    Write-Log "Failed: $failed" -Level $(if ($failed -gt 0) { "ERROR" } else { "INFO" })
    Write-Log "Skipped: $skipped" -Level "INFO"
    Write-Log "Success Rate: $(if ($totalProcessed -gt 0) { [Math]::Round(($successful / $totalProcessed) * 100, 1) } else { 0 })%" -Level "INFO"
    Write-Log "Output Directory: $OutputDir" -Level "INFO"
    
    if ($failed -gt 0) {
        Write-Log "Check log file for error details: $LogFile" -Level "WARNING"
        exit 1
    }
}

# Execute main function
try {
    Start-BatchProcessing
} catch {
    Write-Log "Fatal error: $($_.Exception.Message)" -Level "ERROR"
    Write-Log $_.ScriptStackTrace -Level "ERROR"
    exit 1
}