param(
    [Parameter(Mandatory=$true, HelpMessage="Path to the input JSON file or directory containing JSON files")]
    [string]$InputPath,
    
    [Parameter(Mandatory=$false, HelpMessage="Path to the output file (optional, defaults to console output)")]
    [string]$OutputFile,
    
    [Parameter(Mandatory=$false, HelpMessage="Include header row in output")]
    [switch]$IncludeHeader,
    
    [Parameter(Mandatory=$false, HelpMessage="Log file path for detailed processing information")]
    [string]$LogFile,
    
    [Parameter(Mandatory=$false, HelpMessage="Include filename column when processing directories")]
    [switch]$IncludeFilename,
    
    [Parameter(Mandatory=$false, HelpMessage="Only show consequences with the strongest impact")]
    [switch]$StrongestImpactOnly
)

# Logging function
function Write-Log {
    param(
        [string]$Message,
        [ValidateSet("INFO", "WARNING", "ERROR")]
        [string]$Level = "INFO",
        [switch]$ToConsole
    )
    
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logEntry = "[$timestamp] [$Level] $Message"
    
    if ($LogFile) {
        $logEntry | Out-File -FilePath $LogFile -Append -Encoding UTF8
    }
    
    if ($ToConsole) {
        switch ($Level) {
            "INFO" { Write-Host $logEntry -ForegroundColor Green }
            "WARNING" { Write-Host $logEntry -ForegroundColor Yellow }
            "ERROR" { Write-Host $logEntry -ForegroundColor Red }
        }
    }
}

# Impact hierarchy for strongest impact filtering
$ImpactHierarchy = @{
    'HIGH' = 4
    'MODERATE' = 3
    'LOW' = 2
    'MODIFIER' = 1
}

# Function to get strongest impact from consequences
function Get-StrongestImpact {
    param([array]$Consequences)
    
    $maxImpactValue = 0
    foreach ($consequence in $Consequences) {
        $impactValue = $ImpactHierarchy[$consequence.impact]
        if ($impactValue -gt $maxImpactValue) {
            $maxImpactValue = $impactValue
        }
    }
    
    foreach ($impact in $ImpactHierarchy.Keys) {
        if ($ImpactHierarchy[$impact] -eq $maxImpactValue) {
            return $impact
        }
    }
    return 'MODIFIER'
}

# Function to filter consequences by strongest impact
function Filter-ByStrongestImpact {
    param([array]$Consequences)
    
    $strongestImpact = Get-StrongestImpact -Consequences $Consequences
    return $Consequences | Where-Object { $_.impact -eq $strongestImpact }
}

# Function to process a single JSON file
function Process-JsonFile {
    param(
        [string]$FilePath,
        [string]$FileName = ""
    )
    
    $results = @()
    $errorResults = @()
    
    try {
        Write-Log "Processing file: $FilePath" -Level "INFO" -ToConsole:$($VerbosePreference -eq "Continue")
        
        # Read and parse JSON
        $json = Get-Content $FilePath -Raw | ConvertFrom-Json
        
        if (-not $json.annotationData) {
            $errorMsg = "No annotationData found in file"
            Write-Log "$FilePath - $errorMsg" -Level "WARNING" -ToConsole
            
            if ($IncludeFilename) {
                $errorResults += "$FileName`tERROR`t$errorMsg`tN/A`tN/A"
            } else {
                $errorResults += "ERROR`t$errorMsg`tN/A`tN/A"
            }
            return @{ Results = $errorResults; ProcessedCount = 0; ErrorCount = 1 }
        }
        
        # Extract and filter transcript consequences
        $transcriptResults = $json.annotationData | ForEach-Object {
            $anno = $_
            
            # Filter for RefSeq/NCBI transcripts first
            $refseqConsequences = $anno.transcript_consequences | Where-Object {
                $_.transcript_id -and (($_.transcript_id -like "NM_*") -or 
                                      ($_.transcript_id -like "NR_*") -or 
                                      ($_.transcript_id -like "NP_*") -or 
                                      ($_.source -eq "RefSeq"))
            }
            
            # Prefer MANE Select transcripts if available
            $maneConsequences = $refseqConsequences | Where-Object {
                $_.mane -and ($_.mane -contains "MANE_Select")
            }
            
            $consequencesToProcess = if ($maneConsequences.Count -gt 0) { $maneConsequences } else { $refseqConsequences }
            
            # Apply strongest impact filter if requested
            if ($StrongestImpactOnly -and $consequencesToProcess.Count -gt 0) {
                $consequencesToProcess = Filter-ByStrongestImpact -Consequences $consequencesToProcess
            }
            
            # Format output for each consequence
            $consequencesToProcess | ForEach-Object {
                if ($IncludeFilename) {
                    "$FileName`t$($anno.originalInput)`t$($_.hgvsc)`t$(if ($_.hgvsp) { $_.hgvsp } else { 'N/A' })`t$($anno.variantKey)"
                } else {
                    "$($anno.originalInput)`t$($_.hgvsc)`t$(if ($_.hgvsp) { $_.hgvsp } else { 'N/A' })`t$($anno.variantKey)"
                }
            }
        }
        
        if ($transcriptResults.Count -eq 0) {
            $warningMsg = "No RefSeq/NCBI transcripts found"
            Write-Log "$FilePath - $warningMsg" -Level "WARNING" -ToConsole
            
            if ($IncludeFilename) {
                $results += "$FileName`tWARNING`t$warningMsg`tN/A`tN/A"
            } else {
                $results += "WARNING`t$warningMsg`tN/A`tN/A"
            }
        } else {
            $results += $transcriptResults
            $filterMsg = if ($StrongestImpactOnly) { " (strongest impact only)" } else { "" }
            Write-Log "$FilePath - Found $($transcriptResults.Count) RefSeq transcript(s)$filterMsg" -Level "INFO"
        }
        
        return @{ Results = $results; ProcessedCount = $transcriptResults.Count; ErrorCount = 0 }
        
    } catch {
        $errorMsg = "Failed to process: $($_.Exception.Message)"
        Write-Log "$FilePath - $errorMsg" -Level "ERROR" -ToConsole
        
        if ($IncludeFilename) {
            $errorResults += "$FileName`tERROR`t$errorMsg`tN/A`tN/A"
        } else {
            $errorResults += "ERROR`t$errorMsg`tN/A`tN/A"
        }
        
        return @{ Results = $errorResults; ProcessedCount = 0; ErrorCount = 1 }
    }
}

# Main processing logic
try {
    # Initialize logging
    if ($LogFile) {
        "=== MANE Extract PowerShell Script Log ===" | Out-File -FilePath $LogFile -Encoding UTF8
        Write-Log "Script started with parameters: InputPath='$InputPath', OutputFile='$OutputFile'" -Level "INFO"
    }
    
    # Validate input path
    if (-not (Test-Path $InputPath)) {
        Write-Error "Input path '$InputPath' not found."
        exit 1
    }
    
    $allResults = @()
    $totalProcessed = 0
    $totalErrors = 0
    $filesProcessed = 0
    
    # Determine if input is file or directory
    if (Test-Path $InputPath -PathType Container) {
        # Directory processing
        Write-Log "Processing directory: $InputPath" -Level "INFO" -ToConsole
        
        $jsonFiles = Get-ChildItem -Path $InputPath -Filter "*.json" -File
        
        if ($jsonFiles.Count -eq 0) {
            Write-Error "No JSON files found in directory '$InputPath'."
            exit 1
        }
        
        Write-Log "Found $($jsonFiles.Count) JSON files to process" -Level "INFO" -ToConsole
        
        # Force include filename for directory mode
        $IncludeFilename = $true
        
        foreach ($file in $jsonFiles) {
            $filesProcessed++
            Write-Progress -Activity "Processing JSON files" -Status "File $filesProcessed of $($jsonFiles.Count): $($file.Name)" -PercentComplete (($filesProcessed / $jsonFiles.Count) * 100)
            
            $result = Process-JsonFile -FilePath $file.FullName -FileName $file.Name
            $allResults += $result.Results
            $totalProcessed += $result.ProcessedCount
            $totalErrors += $result.ErrorCount
        }
        
        Write-Progress -Activity "Processing JSON files" -Completed
        
    } else {
        # Single file processing
        if (-not $InputPath.EndsWith(".json")) {
            Write-Warning "Input file does not have .json extension: $InputPath"
        }
        
        $fileName = if ($IncludeFilename) { Split-Path $InputPath -Leaf } else { "" }
        $result = Process-JsonFile -FilePath $InputPath -FileName $fileName
        $allResults += $result.Results
        $totalProcessed += $result.ProcessedCount
        $totalErrors += $result.ErrorCount
        $filesProcessed = 1
    }
    
    # Prepare output with optional header
    $output = @()
    if ($IncludeHeader) {
        if ($IncludeFilename) {
            $output += "Source_File`tOriginal_Input`tHGVS_Coding`tHGVS_Protein`tVCF_Coordinates"
        } else {
            $output += "Original_Input`tHGVS_Coding`tHGVS_Protein`tVCF_Coordinates"
        }
    }
    $output += $allResults
    
    # Output to file or console
    if ($OutputFile) {
        $output | Out-File -FilePath $OutputFile -Encoding UTF8
        Write-Host "Results written to: $OutputFile" -ForegroundColor Green
        Write-Log "Results written to: $OutputFile" -Level "INFO"
    } else {
        $output | Write-Output
    }
    
    # Summary reporting
    $summaryMsg = "Processing complete: $filesProcessed file(s) processed, $totalProcessed transcript(s) found, $totalErrors error(s)"
    Write-Host $summaryMsg -ForegroundColor Green
    Write-Log $summaryMsg -Level "INFO"
    
    if ($totalErrors -gt 0) {
        Write-Host "Check output for ERROR/WARNING entries or log file for details" -ForegroundColor Yellow
    }
    
} catch {
    $fatalError = "Fatal error: $($_.Exception.Message)"
    Write-Error $fatalError
    Write-Log $fatalError -Level "ERROR"
    exit 1
}