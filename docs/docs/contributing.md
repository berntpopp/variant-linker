# Contributing

Thank you for your interest in contributing to Variant-Linker! This guide will help you get started with contributing to the project, whether you're fixing bugs, adding features, or improving documentation.

## Getting Started

### Development Setup

1. **Fork and Clone the Repository**
   ```bash
   git clone https://github.com/your-username/variant-linker.git
   cd variant-linker
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Run Tests**
   ```bash
   npm test
   ```

4. **Check Code Style**
   ```bash
   npm run lint
   ```

### Development Workflow

1. **Create a Feature Branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make Your Changes**
   - Write code following the project's style guidelines
   - Add tests for new functionality
   - Update documentation as needed

3. **Test Your Changes**
   ```bash
   npm test
   npm run lint
   npm run benchmark  # If performance-related changes
   ```

4. **Commit Your Changes**
   ```bash
   git add .
   git commit -m "feat: add new feature description"
   ```

5. **Push and Create Pull Request**
   ```bash
   git push origin feature/your-feature-name
   ```

## Code Style & Guidelines

### ESLint Configuration

Variant-Linker uses ESLint with the Google JavaScript Style Guide as the base configuration. The linting setup includes:

- **Base Configuration**: Google JavaScript Style Guide
- **Node.js Rules**: Node.js specific linting rules
- **Test File Overrides**: Special rules for test files using Mocha/Chai

### Running Linting

```bash
# Check for linting issues
npm run lint

# Fix automatically fixable issues
npm run lint:fix
```

### Style Guidelines

When contributing code, please follow these guidelines:

#### Naming Conventions
- Use **camelCase** for variable and function names
- Use **PascalCase** for constructor functions and classes
- Use **UPPER_SNAKE_CASE** for constants
- Use descriptive names that clearly indicate purpose

#### Code Structure
- Keep functions small and focused (KISS principle)
- Avoid code duplication (DRY principle)
- Use consistent indentation (2 spaces)
- Maintain line length under 100 characters

#### Documentation
- Provide clear JSDoc comments for all functions
- Include parameter and return type information
- Document complex algorithms and business logic
- Keep comments up-to-date with code changes

#### Example Code Style

```javascript
/**
 * Processes a single variant through the annotation pipeline.
 * @param {string} variant - The variant identifier (rsID, HGVS, or VCF format)
 * @param {Object} options - Configuration options for processing
 * @param {string} options.output - Output format (JSON, CSV, TSV, VCF)
 * @param {boolean} options.debug - Enable debug logging
 * @returns {Promise<Object>} Processed variant annotation data
 */
async function processVariant(variant, options = {}) {
  const {output = 'JSON', debug = false} = options;
  
  if (debug) {
    console.log(`Processing variant: ${variant}`);
  }
  
  try {
    const annotation = await getVariantAnnotation(variant);
    return formatOutput(annotation, output);
  } catch (error) {
    throw new Error(`Failed to process variant ${variant}: ${error.message}`);
  }
}
```

## Testing

### Test Framework

Variant-Linker uses a comprehensive testing stack:

- **Mocha** (^10.4.0) - Test runner with 30-second timeout
- **Chai** (^4.3.4) - BDD/TDD assertion library
- **Sinon** (^18.0.1) - Test spies, stubs, and mocks
- **Nock** (^13.5.4) - HTTP request mocking
- **Proxyquire** (^2.1.3) - Module mocking and dependency injection

### Running Tests

```bash
# Run all tests
npm test

# Run tests with coverage (if configured)
npm run test:coverage

# Run specific test file
npx mocha test/variantLinkerCore.test.js

# Run tests with debugging
npx mocha test/variantLinkerCore.test.js --inspect-brk
```

### Test Structure

Tests are organized in the `test/` directory:

```
test/
├── helpers.js                     # Common test utilities and mock data
├── apiHelper.test.js             # HTTP client and retry logic tests
├── variantLinkerCore.test.js     # Core functionality tests
├── variantLinkerProcessor.test.js # Result processing tests
├── scoring.test.js               # Scoring system tests
├── inheritance-integration.test.js # Family analysis tests
└── fixtures/                     # Test data and expected results
    ├── README.md
    ├── test.vcf
    └── inheritance/
        ├── trio_ar_homozygous.ped
        └── trio_ar_homozygous.vcf
```

### Writing Tests

#### Test Patterns

Follow these patterns when writing tests:

```javascript
describe('Module Name', () => {
  let sandbox;
  
  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });
  
  afterEach(() => {
    sandbox.restore();
    nock.cleanAll();
  });
  
  describe('functionName', () => {
    it('should handle normal input correctly', async () => {
      // Arrange
      const input = 'test-input';
      const expected = 'expected-output';
      
      // Act
      const result = await functionName(input);
      
      // Assert
      expect(result).to.equal(expected);
    });
    
    it('should handle error conditions gracefully', async () => {
      // Arrange
      const invalidInput = null;
      
      // Act & Assert
      await expect(functionName(invalidInput)).to.be.rejected;
    });
  });
});
```

#### Mock API Responses

Use Nock for mocking HTTP requests:

```javascript
const nock = require('nock');

beforeEach(() => {
  nock('https://rest.ensembl.org')
    .get('/variant_recoder/human/rs6025')
    .reply(200, {
      "rs6025": [{
        "id": "rs6025",
        "input": "rs6025",
        "vcf_string": "1\t169519049\trs6025\tT\tC\t.\t.\t."
      }]
    });
});
```

### Adding New Tests

When adding new features:

1. **Write Tests First** (TDD approach when possible)
2. **Cover Edge Cases** - Test boundary conditions and error scenarios
3. **Mock External Dependencies** - Don't make real API calls in tests
4. **Use Descriptive Names** - Test names should clearly describe what's being tested
5. **Keep Tests Focused** - Each test should verify one specific behavior

## Commit Message Guidelines

### Conventional Commits

This project uses [Conventional Commits](https://www.conventionalcommits.org/) with [semantic-release](https://github.com/semantic-release/semantic-release) for automated versioning and releases.

**Commit message format:**
```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Commit Types

| Type | Description | Version Impact |
|------|-------------|----------------|
| `feat` | New feature | Minor version bump |
| `fix` | Bug fix | Patch version bump |
| `docs` | Documentation changes | No release |
| `style` | Code style changes | No release |
| `refactor` | Code refactoring | No release |
| `perf` | Performance improvements | Patch version bump |
| `test` | Test additions/changes | No release |
| `build` | Build system changes | No release |
| `ci` | CI configuration changes | No release |
| `chore` | Other maintenance | No release |

### Breaking Changes

For breaking changes, add `!` after the type or include `BREAKING CHANGE:` in the footer:

```bash
# With !
git commit -m "feat!: drop support for Node.js 12"

# With footer
git commit -m "feat: update API interface

BREAKING CHANGE: API now requires authentication token"
```

### Examples

```bash
# New feature
git commit -m "feat: add support for compound heterozygous analysis"

# Bug fix
git commit -m "fix: resolve VCF parsing issue with multi-allelic variants"

# Documentation
git commit -m "docs: update installation instructions for Windows"

# Performance improvement
git commit -m "perf: optimize batch processing for large variant sets"
```

## Development Guidelines

### Architecture Principles

- **Modular Design**: Keep components focused and loosely coupled
- **API First**: Design for both CLI and library usage
- **Error Handling**: Provide clear, actionable error messages
- **Performance**: Consider performance implications of changes
- **Backward Compatibility**: Avoid breaking changes when possible

### Code Organization

```
src/
├── main.js                    # CLI entry point
├── index.js                   # Library exports
├── variantLinkerCore.js       # Core processing logic
├── variantLinkerProcessor.js  # Result processing
├── apiHelper.js              # HTTP client utilities
├── inheritance/              # Inheritance analysis modules
│   ├── inheritanceAnalyzer.js
│   └── patternDeducer.js
└── scoring.js                # Scoring engine
```

### Adding New Features

1. **Design Phase**
   - Document the feature requirements
   - Design the API interface
   - Consider backward compatibility

2. **Implementation Phase**
   - Follow existing patterns and conventions
   - Add comprehensive error handling
   - Include debug logging where appropriate

3. **Testing Phase**
   - Write unit tests for all new functions
   - Add integration tests for complete workflows
   - Test error conditions and edge cases

4. **Documentation Phase**
   - Update CLI help text if needed
   - Add JSDoc comments to all functions
   - Update README and guide documentation

### Performance Considerations

- **API Efficiency**: Minimize API calls through batching
- **Memory Usage**: Consider memory impact of large datasets
- **Async Patterns**: Use proper async/await patterns
- **Error Recovery**: Implement retry logic for transient failures

## Documentation

### Documentation Types

1. **Code Documentation** - JSDoc comments in source code
2. **API Documentation** - Generated from JSDoc comments
3. **User Guides** - Markdown files in `docs/docs/`
4. **README Files** - Overview and quick start information

### Writing Documentation

- **Be Clear and Concise** - Explain concepts in simple terms
- **Include Examples** - Provide practical usage examples
- **Keep Updated** - Update documentation with code changes
- **Consider Audience** - Write for both beginners and advanced users

### Documentation Build

The documentation site is built with Docusaurus:

```bash
# Install documentation dependencies
cd docs && npm install

# Start development server
cd docs && npm start

# Build for production
cd docs && npm run build
```

## Pull Request Process

### Before Submitting

1. **Code Quality Checks**
   ```bash
   npm run lint
   npm test
   npm run benchmark  # If performance-related
   ```

2. **Documentation Updates**
   - Update relevant documentation
   - Add JSDoc comments for new functions
   - Update CLI help text if needed

3. **Testing**
   - Ensure all tests pass
   - Add tests for new functionality
   - Test edge cases and error conditions

### Pull Request Template

When submitting a pull request, include:

1. **Description** - Clear description of changes
2. **Motivation** - Why the change is needed
3. **Testing** - How the changes were tested
4. **Breaking Changes** - Any breaking changes and migration guide
5. **Checklist** - Confirmation of code quality checks

### Review Process

- All pull requests require review before merging
- Address reviewer feedback promptly
- Keep pull requests focused and reasonably sized
- Squash commits when merging to maintain clean history

## Getting Help

### Communication Channels

- **GitHub Issues** - Bug reports and feature requests
- **GitHub Discussions** - General questions and community discussions
- **Pull Request Comments** - Code review and implementation discussions

### Common Questions

**Q: How do I test my changes against real API data?**
A: Use the debug mode and small test datasets to validate against live APIs. Avoid making excessive API calls during development.

**Q: How do I add support for a new annotation source?**
A: Follow the existing API helper patterns and add appropriate tests with mocked responses.

**Q: How do I handle breaking changes?**
A: Document breaking changes clearly and provide migration guidance. Use semantic versioning to communicate the impact.

## Recognition

Contributors are recognized in:
- GitHub contributor list
- Release notes for significant contributions
- Documentation acknowledgments

Thank you for contributing to Variant-Linker! Your efforts help make genetic variant analysis more accessible and reliable for the research community.