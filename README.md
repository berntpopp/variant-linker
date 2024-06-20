# Variant-Linker

## Introduction
Variant-Linker is a command-line interface (CLI) tool designed to facilitate the retrieval of genetic variant annotations. It integrates with Ensembl's Variant Recoder and Variant Effect Predictor (VEP) REST APIs to provide a streamlined process for obtaining detailed annotations for a given genetic variant.

## Features
- **Variant Translation**: Converts genetic variant inputs into various formats to all possible variant IDs and HGVS notations.
- **VEP Annotations**: Retrieves detailed variant annotations from the VEP API.
- **Filtering**: Filters VEP annotations based on transcript specifications.
- **Modular Design**: Structured to facilitate the reuse of core functionalities in other projects.
- **Extensibility**: Prepared for future extensions to include local installations of VEP and Variant Recoder.
- **Output Customization**: Users can specify the output format (e.g., JSON, CSV).
- **VCF Handling**: Detects and processes VCF formatted input, converting it to the necessary format for Ensembl region-based annotation.
- **Configuration File Support**: Allows users to provide parameters through a structured configuration file.

## Installation

Before installing Variant-Linker, ensure you have [Node.js](https://nodejs.org/) and npm (Node Package Manager) installed on your system.

To set up Variant-Linker, follow these steps:

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-github-username/variant-linker.git
   cd variant-linker
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Link the package globally** (optional but recommended):
   ```bash
   npm link
   ```

## Usage

After installation, you can run Variant-Linker using the following command:

```bash
variant-linker --variant <variant_input> --output <output_format> [--debug]
```

### Command-Line Options
- `--config`, `-c`: Path to the configuration file.
- `--variant`, `-v`: Specify the genetic variant to be analyzed. This can be provided via command line or configuration file.
- `--output`, `-o`: Define the desired output format (e.g., JSON, CSV). Default is JSON.
- `--save`, `-s`: Filename to save the results. If not specified, results will be printed to the console.
- `--debug`, `-d`: Enable debug mode for detailed logging. This is optional and is not enabled by default.
- `--vep_params`, `-vp`: Optional parameters for VEP annotation in key=value format, separated by commas (default: "CADD=1").
- `--recoder_params`, `-rp`: Optional parameters for Variant Recoder in key=value format, separated by commas (default: "vcf_string=1").
- `--scoring_config_path`, `-scp`: Path to the scoring configuration directory.

### Configuration File

Variant-Linker can accept a JSON configuration file to specify parameters. Command-line parameters will override configuration file parameters if both are provided.

#### Example Configuration File (`example_input.json`):

```json
{
  "variant": "ENST00000366667:c.803C>T",
  "output": "JSON",
  "save": "output/example_output.json",
  "debug": 3,
  "scoring_config_path": "scoring/meta_score/"
}
```

### VCF Handling
Variant-Linker can detect and process variants provided in VCF format. When a VCF formatted variant is detected, the tool:
- Converts the VCF notation to Ensembl region and allele format.
- Uses the converted format to fetch annotations via the VEP API.

#### VCF Format Example
- Input: `1-65568-A-C`
- Ensembl region format: `1:65568-65568:1`
- Allele: `C`

### Example Usage

Using command-line parameters:
```bash
variant-linker --variant 'ENST00000366667:c.803C>T' --output JSON
```

Using a configuration file:
```bash
variant-linker --config example_input.json
```

## Contributing
Contributions to Variant-Linker are welcome. Please feel free to fork the repository, make your changes, and submit a pull request.

## License
This project is licensed under the [MIT License](LICENSE.md).

## Acknowledgements
This tool utilizes the Ensembl Variant Recoder and Variant Effect Predictor APIs, provided by the Ensembl project.
