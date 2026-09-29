'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

describe('Annotation error contract (unannotated inputs)', () => {
  it('declares error as an optional string on the Annotation type', () => {
    const file = path.join(root, 'src', 'dataTypes.d.ts');
    const program = ts.createProgram([file], { strict: true, noEmit: true, skipLibCheck: true });
    const checker = program.getTypeChecker();
    const source = program.getSourceFile(file);
    const symbol = checker.getSymbolAtLocation(source);
    const annotation = checker.getExportsOfModule(symbol).find((s) => s.name === 'Annotation');
    assert.ok(annotation, 'Annotation is exported');
    const type = checker.getDeclaredTypeOfSymbol(annotation);
    const error = type.getProperty('error');
    assert.ok(error, 'Annotation declares an explicit error property');
    assert.equal(checker.typeToString(checker.getTypeOfSymbol(error)), 'string | undefined');
  });

  it('documents the 3.x to 4.x change in the reliable-processing guide', () => {
    const guide = fs.readFileSync(
      path.join(root, 'docs', 'guide', 'reliable-processing.md'),
      'utf8'
    );
    assert.match(guide, /Upgrading from 3\.x/);
    assert.match(guide, /annotation\.error/);
  });
});
