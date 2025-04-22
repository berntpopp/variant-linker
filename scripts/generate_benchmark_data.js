/**
 * Script to generate benchmark data files for variant-linker benchmarks
 */

const fs = require('fs');
const path = require('path');

// Define the benchmark data directory
const benchmarkDataDir = path.join(__dirname, '..', 'examples', 'benchmark_data');

// Ensure directory exists
if (!fs.existsSync(benchmarkDataDir)) {
  fs.mkdirSync(benchmarkDataDir, { recursive: true });
}

// Small batch of HGVS/rsID variants (50 entries)
const smallBatchTxt = `rs2691305
rs9651229
rs9651231
rs13303368
rs13303369
rs114525117
rs4970441
rs4970442
rs77553444
rs4970721
rs6672356
rs6672356
rs2272757
rs2272756
rs3748592
rs7605713
rs7583637
rs11127467
rs13424148
rs13431165
rs3115850
rs3813199
rs7601832
rs11127788
rs12185668
NM_000088.3:c.589G>T
NM_000088.3:c.1149+1G>A
NM_000088.3:c.1350G>C
NM_000088.3:c.1821G>A
NM_000088.3:c.2005G>C
NM_000088.3:c.2113G>C
NM_000088.3:c.2150G>C
NM_000088.3:c.2235G>C
NM_000088.3:c.2461G>A
NM_000088.3:c.3369+1G>A
ENST00000225964.9:c.1649G>A
ENST00000225964.9:c.2338C>T
ENST00000225964.9:c.4070C>T
ENST00000341560.6:c.2386G>A
ENST00000341560.6:c.3556G>T
ENST00000372839.7:c.2149G>A
ENST00000398822.7:c.6136G>A
ENST00000399012.5:c.1648C>T
ENST00000399410.7:c.2953T>C
ENST00000409827.6:c.214G>A`;

// Large batch of HGVS/rsID variants (start with 50, replicate 10x for 500 entries)
let largeBatchTxt = '';
for (let i = 0; i < 10; i++) {
  largeBatchTxt += smallBatchTxt + '\n';
  // Add a few variants with modified IDs to avoid exact duplicates
  largeBatchTxt += `rs${9651229 + i}\nrs${13303368 + i}\nENST00000225964.9:c.${1649 + i}G>A\n`;
}

// Large batch of VCF variants (500 entries)
const largeBatchVcfHeader = `##fileformat=VCFv4.2
##INFO=<ID=SVTYPE,Number=1,Type=String,Description="Type of structural variant">
##INFO=<ID=SVLEN,Number=.,Type=Integer,
Description="Difference in length between REF and ALT alleles">
##contig=<ID=1,length=249250621>
##contig=<ID=2,length=243199373>
##contig=<ID=3,length=198022430>
##contig=<ID=4,length=191154276>
##contig=<ID=5,length=180915260>
##contig=<ID=6,length=171115067>
##contig=<ID=7,length=159138663>
##contig=<ID=8,length=146364022>
##contig=<ID=9,length=141213431>
##contig=<ID=10,length=135534747>
##contig=<ID=11,length=135006516>
##contig=<ID=12,length=133851895>
##contig=<ID=13,length=115169878>
##contig=<ID=14,length=107349540>
##contig=<ID=15,length=102531392>
##contig=<ID=16,length=90354753>
##contig=<ID=17,length=81195210>
##contig=<ID=18,length=78077248>
##contig=<ID=19,length=59128983>
##contig=<ID=20,length=63025520>
##contig=<ID=21,length=48129895>
##contig=<ID=22,length=51304566>
##contig=<ID=X,length=155270560>
##contig=<ID=Y,length=59373566>
##FILTER=<ID=PASS,Description="All filters passed">
#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO`;

// Base VCF variants for replication
const baseVcfVariants = [
  '1\t69270\trs2691305\tA\tG\t.\tPASS\t.',
  '1\t865584\trs9651229\tA\tG\t.\tPASS\t.',
  '1\t865628\trs9651231\tA\tG\t.\tPASS\t.',
  '1\t866319\trs13303368\tT\tC\t.\tPASS\t.',
  '1\t866422\trs13303369\tG\tA\t.\tPASS\t.',
  '1\t871184\trs114525117\tG\tA\t.\tPASS\t.',
  '1\t874779\trs4970441\tC\tT\t.\tPASS\t.',
  '1\t874829\trs4970442\tA\tG\t.\tPASS\t.',
  '1\t874956\trs77553444\tC\tT\t.\tPASS\t.',
  '1\t876499\trs4970721\tG\tA\t.\tPASS\t.',
  '2\t38298\trs7605713\tT\tC\t.\tPASS\t.',
  '2\t138741\trs7583637\tG\tA\t.\tPASS\t.',
  '2\t232195\trs11127467\tT\tC\t.\tPASS\t.',
  '2\t278192\trs13424148\tG\tA\t.\tPASS\t.',
  '2\t700015\trs13431165\tA\tG\t.\tPASS\t.',
  '3\t150928\trs7638345\tG\tA\t.\tPASS\t.',
  '3\t152255\trs10510162\tC\tT\t.\tPASS\t.',
  '3\t433703\trs7627305\tA\tG\t.\tPASS\t.',
  '3\t493224\trs6801524\tG\tA\t.\tPASS\t.',
  '3\t510912\trs6807834\tT\tC\t.\tPASS\t.',
  '4\t368623\trs12511319\tG\tA\t.\tPASS\t.',
  '4\t370355\trs7442705\tG\tA\t.\tPASS\t.',
  '4\t370357\trs12640122\tG\tA\t.\tPASS\t.',
  '4\t370414\trs6826070\tA\tG\t.\tPASS\t.',
  '4\t380915\trs34072724\tG\tA\t.\tPASS\t.',
  '5\t112136\trs7735382\tC\tT\t.\tPASS\t.',
  '5\t259068\trs1480052\tG\tA\t.\tPASS\t.',
  '6\t259100\trs1967815\tT\tC\t.\tPASS\t.',
  '6\t283092\trs55873391\tC\tT\t.\tPASS\t.',
  '6\t286102\trs6918166\tA\tG\t.\tPASS\t.',
  '7\t41155\trs57181708\tG\tA\t.\tPASS\t.',
  '7\t45896\trs114947036\tG\tA\t.\tPASS\t.',
  '7\t45933\trs1055403\tT\tC\t.\tPASS\t.',
  '7\t48260\trs1479279\tT\tC\t.\tPASS\t.',
  '7\t61552\trs2905036\tT\tC\t.\tPASS\t.',
  '8\t183635\trs1134190\tT\tC\t.\tPASS\t.',
  '8\t183832\trs6601958\tC\tT\t.\tPASS\t.',
  '8\t183901\trs4072391\tG\tT\t.\tPASS\t.',
  '8\t184214\trs16868961\tG\tA\t.\tPASS\t.',
  '8\t184384\trs34487866\tC\tG\t.\tPASS\t.',
  '9\t124877\trs9644946\tA\tG\t.\tPASS\t.',
  '9\t126204\trs9651608\tG\tA\t.\tPASS\t.',
  '9\t130262\trs6560731\tA\tG\t.\tPASS\t.',
  '9\t133358\trs10465772\tA\tG\t.\tPASS\t.',
  '9\t133698\trs28771204\tC\tG\t.\tPASS\t.',
];

// Generate large batch VCF by repeating the base variants with modified positions
let largeBatchVcfVariants = [];
for (let i = 0; i < 12; i++) {
  // 12 repetitions ~= 500 variants
  largeBatchVcfVariants = largeBatchVcfVariants.concat(
    baseVcfVariants.map((variant) => {
      const parts = variant.split('\t');
      // Modify position to avoid exact duplicates
      const newPos = parseInt(parts[1]) + i * 1000;
      parts[1] = newPos.toString();
      // Modify rsID slightly to avoid exact duplicates
      if (parts[2].startsWith('rs')) {
        const rsNum = parseInt(parts[2].substring(2));
        parts[2] = 'rs' + (rsNum + i).toString();
      }
      return parts.join('\t');
    })
  );
}

// Write the files
console.log('Generating benchmark data files...');

// Write small_batch.txt
fs.writeFileSync(
  path.join(benchmarkDataDir, 'small_batch.txt'),
  smallBatchTxt.replace(/\n/g, '\r\n'),
  'utf8'
);
console.log('Created small_batch.txt with 50 variants');

// Reuse the existing small_batch.vcf file which was already created

// Write large_batch.txt
fs.writeFileSync(
  path.join(benchmarkDataDir, 'large_batch.txt'),
  largeBatchTxt.replace(/\n/g, '\r\n'),
  'utf8'
);
console.log('Created large_batch.txt with ~500 variants');

// Write large_batch.vcf
fs.writeFileSync(
  path.join(benchmarkDataDir, 'large_batch.vcf'),
  (largeBatchVcfHeader + '\n' + largeBatchVcfVariants.join('\n')).replace(/\n/g, '\r\n'),
  'utf8'
);
console.log('Created large_batch.vcf with ~500 variants');

console.log('Benchmark data generation complete.');
