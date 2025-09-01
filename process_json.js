#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const IMPACT_HIERARCHY = {
  'HIGH': 4,
  'MODERATE': 3,
  'LOW': 2,
  'MODIFIER': 1
};

function getStrongestImpact(consequences) {
  let maxImpactValue = 0;
  for (const consequence of consequences) {
    const impactValue = IMPACT_HIERARCHY[consequence.impact] || 0;
    if (impactValue > maxImpactValue) {
      maxImpactValue = impactValue;
    }
  }
  
  for (const [impact, value] of Object.entries(IMPACT_HIERARCHY)) {
    if (value === maxImpactValue) {
      return impact;
    }
  }
  return 'MODIFIER';
}

function filterByStrongestImpact(consequences) {
  const strongestImpact = getStrongestImpact(consequences);
  return consequences.filter(c => c.impact === strongestImpact);
}

function processJsonFile(filePath, options = {}) {
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    if (!data.annotationData || !Array.isArray(data.annotationData)) {
      console.error('Invalid JSON format: missing annotationData array');
      return;
    }

    const fileName = path.basename(filePath);
    
    for (const annotation of data.annotationData) {
      let consequences = annotation.transcript_consequences || [];
      
      // Filter for RefSeq/NCBI transcripts (NM_, NR_, etc.)
      consequences = consequences.filter(c => 
        c.transcript_id && (c.transcript_id.startsWith('NM_') || 
                           c.transcript_id.startsWith('NR_') || 
                           c.transcript_id.startsWith('NP_') ||
                           c.source === 'RefSeq')
      );
      
      // Filter for MANE transcripts if available
      const maneConsequences = consequences.filter(c => c.mane && c.mane.length > 0);
      if (maneConsequences.length > 0) {
        consequences = maneConsequences;
      }

      // Apply strongest impact filter if requested
      if (options.strongestImpactOnly) {
        consequences = filterByStrongestImpact(consequences);
      }

      // Output each consequence as a row
      for (const consequence of consequences) {
        const hgvsc = consequence.hgvsc || 'N/A';
        const hgvsp = consequence.hgvsp || 'N/A';
        const vcfString = annotation.variantKey || 'N/A';
        
        console.log(`${fileName.padEnd(30)} ${hgvsc.padEnd(40)} ${hgvsp.padEnd(40)} ${vcfString}`);
      }
    }
  } catch (error) {
    console.error(`Error processing file ${filePath}:`, error.message);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
let filePath = 'test.json';
let strongestImpactOnly = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--strongest-impact' || args[i] === '-s') {
    strongestImpactOnly = true;
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log(`
Usage: node process_json.js [file.json] [options]

Options:
  --strongest-impact, -s    Only show consequences with the strongest impact
  --help, -h               Show this help message

Examples:
  node process_json.js test.json                    # Show all consequences
  node process_json.js test.json --strongest-impact # Show only strongest impact consequences
`);
    process.exit(0);
  } else if (!args[i].startsWith('-')) {
    filePath = args[i];
  }
}

// Process the file
processJsonFile(filePath, { strongestImpactOnly });