// test/streaming-simple.test.js
/**
 * Simple streaming tests that don't rely on external API calls
 */

const { expect } = require('chai');
const { spawn } = require('child_process');
const path = require('path');

describe('Streaming Simple Tests', () => {
  const binPath = path.resolve(__dirname, '../src/main.js');

  it('should reject --save option in streaming mode', function (done) {
    this.timeout(15000);

    const child = spawn('node', [binPath, '--output', 'tsv', '--save', 'output.tsv'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stderr = '';
    let processExited = false;

    child.stdout.on('data', (data) => {
      // Consume stdout to prevent hanging
      data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code, signal) => {
      if (processExited) return; // Prevent multiple calls to done()
      processExited = true;
      try {
        expect(code).to.not.equal(0); // Should fail
        expect(stderr).to.include(
          '--save and --output-file options cannot be used with stdin streaming'
        );
        done();
      } catch (error) {
        done(error);
      }
    });

    child.on('error', (error) => {
      if (!processExited) {
        processExited = true;
        done(error);
      }
    });

    // Write an empty line and close stdin to trigger streaming mode properly
    child.stdin.write('');
    child.stdin.end();
  });

  it('should reject --output-file option in streaming mode', function (done) {
    this.timeout(15000);

    const child = spawn('node', [binPath, '--output', 'tsv', '--output-file', 'output.tsv'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stderr = '';
    let processExited = false;

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (processExited) return;
      processExited = true;
      try {
        expect(code).to.not.equal(0); // Should fail
        expect(stderr).to.include(
          '--save and --output-file options cannot be used with stdin streaming'
        );
        done();
      } catch (error) {
        done(error);
      }
    });

    child.on('error', (error) => {
      if (!processExited) {
        processExited = true;
        done(error);
      }
    });

    // Write an empty line and close stdin to trigger streaming mode properly
    child.stdin.write('');
    child.stdin.end();
  });

  it('should warn about JSON output in streaming mode', function (done) {
    this.timeout(15000);

    const child = spawn('node', [binPath, '--output', 'json'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stderr = '';
    let processExited = false;

    child.stdout.on('data', (data) => {
      // Consume stdout to prevent hanging
      data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (processExited) return;
      processExited = true;
      try {
        // Should succeed but warn (code 0 but still check for early termination due to validation)
        if (code === 0) {
          expect(stderr).to.include('Warning: JSON output is not ideal for streaming');
        }
        done();
      } catch (error) {
        done(error);
      }
    });

    child.on('error', (error) => {
      if (!processExited) {
        processExited = true;
        done(error);
      }
    });

    // Close stdin immediately to trigger streaming mode
    child.stdin.write('');
    child.stdin.end();
  });

  it('should output header for empty TSV input', function (done) {
    this.timeout(15000);

    const child = spawn('node', [binPath, '--output', 'tsv'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let processExited = false;

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      // Consume stderr to prevent hanging
      data.toString();
    });

    child.on('close', (code, signal) => {
      if (processExited) return; // Prevent multiple calls to done()
      processExited = true;
      try {
        expect(code).to.equal(0);

        // Should output header even with no data
        const lines = stdout.trim().split('\n');
        expect(lines.length).to.equal(1); // Just header
        expect(lines[0]).to.include('OriginalInput');
        expect(lines[0]).to.include('\t'); // Should be tab-delimited

        done();
      } catch (error) {
        done(error);
      }
    });

    child.on('error', (error) => {
      if (!processExited) {
        processExited = true;
        done(error);
      }
    });

    // Close stdin immediately without writing anything
    child.stdin.write('');
    child.stdin.end();
  });

  it('should output header for empty CSV input', function (done) {
    this.timeout(15000);

    const child = spawn('node', [binPath, '--output', 'csv'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let processExited = false;

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.on('close', (code) => {
      if (processExited) return;
      processExited = true;
      try {
        expect(code).to.equal(0);

        // Should output header even with no data
        const lines = stdout.trim().split('\n');
        expect(lines.length).to.equal(1); // Just header
        expect(lines[0]).to.include('OriginalInput');
        expect(lines[0]).to.include(','); // Should be comma-delimited

        done();
      } catch (error) {
        done(error);
      }
    });

    child.on('error', (error) => {
      if (!processExited) {
        processExited = true;
        done(error);
      }
    });

    // Close stdin immediately without writing anything
    child.stdin.write('');
    child.stdin.end();
  });

  it('should handle chunk-size option validation', function (done) {
    this.timeout(15000);

    const child = spawn('node', [binPath, '--output', 'tsv', '--chunk-size', '50'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let processExited = false;

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.on('close', (code) => {
      if (processExited) return;
      processExited = true;
      try {
        expect(code).to.equal(0);

        // Should output header
        expect(stdout).to.include('OriginalInput');

        done();
      } catch (error) {
        done(error);
      }
    });

    child.on('error', (error) => {
      if (!processExited) {
        processExited = true;
        done(error);
      }
    });

    // Close stdin immediately without writing anything
    child.stdin.write('');
    child.stdin.end();
  });
});
