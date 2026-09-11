'use strict';

const path = require('node:path');
require('./offline-guard.cjs');
const preload = path.resolve(__dirname, 'offline-guard.cjs').replace(/\\/g, '/');
const existing = process.env.NODE_OPTIONS || '';
if (!existing.includes(preload)) {
  process.env.NODE_OPTIONS = `${existing} --require "${preload}"`.trim();
}
