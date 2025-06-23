# Installation

Before installing Variant-Linker, ensure you have [Node.js](https://nodejs.org/) and npm (Node Package Manager) installed on your system.

## Prerequisites

- **Node.js**: Version 14.0 or higher
- **npm**: Usually comes with Node.js installation
- **Git**: For cloning the repository

## Installation Steps

### 1. Clone the Repository

```bash
git clone https://github.com/berntpopp/variant-linker.git
cd variant-linker
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Link the Package Globally (Optional but Recommended)

This step allows you to use `variant-linker` command from anywhere in your system:

```bash
npm link
```

After linking, you can use the tool globally:

```bash
variant-linker --variant "rs6025" --output JSON
```

### 4. Verify Installation

Test your installation by running a simple variant analysis:

```bash
# If you linked globally
variant-linker --variant "rs6025" --output JSON

# Or run directly from the project directory
node src/main.js --variant "rs6025" --output JSON
```

If the installation was successful, you should see JSON output with variant annotation data.

## Alternative Installation Methods

### Using npm (Future Release)

Once published to npm, you'll be able to install Variant-Linker directly:

```bash
# Global installation
npm install -g variant-linker

# Local installation for use as a library
npm install variant-linker
```

### Docker Installation (Future Support)

Docker support is planned for future releases, which will provide an isolated environment with all dependencies pre-configured.

## Troubleshooting

### Common Issues

**Node.js Version Issues**
If you encounter errors related to Node.js version compatibility, ensure you're using Node.js 14.0 or higher:

```bash
node --version
```

**Permission Issues on macOS/Linux**
If you encounter permission errors during global linking, you may need to use `sudo`:

```bash
sudo npm link
```

**Network Issues**
If you experience network-related errors during installation, try:

```bash
npm install --registry https://registry.npmjs.org/
```

**Missing Dependencies**
If some dependencies fail to install, try clearing the npm cache and reinstalling:

```bash
npm cache clean --force
rm -rf node_modules
npm install
```

## Development Installation

If you plan to contribute to Variant-Linker development:

```bash
# Clone the repository
git clone https://github.com/berntpopp/variant-linker.git
cd variant-linker

# Install dependencies
npm install

# Run tests to ensure everything works
npm test

# Run linting
npm run lint
```

## Next Steps

Now that you have Variant-Linker installed, check out the [CLI Usage Guide](./cli-usage.md) to learn how to use the tool effectively.