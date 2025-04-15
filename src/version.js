'use strict';
// src/version.js

/**
 * @fileoverview Provides semantic versioning details using the semver module.
 * @module version
 */

const semver = require('semver');
const packageJson = require('../package.json');

/**
 * Returns the semantic version details for the current package.
 *
 * @returns {object} An object containing the version details:
 *   { version: string, major: number, minor: number, patch: number,
 *     prerelease: Array, build: Array }
 * @throws {Error} If the version in package.json is invalid.
 */
function getVersionDetails() {
  const version = packageJson.version;
  const parsed = semver.parse(version);
  if (!parsed) {
    throw new Error(`Invalid version format in package.json: ${version}`);
  }
  return {
    version,
    major: parsed.major,
    minor: parsed.minor,
    patch: parsed.patch,
    prerelease: parsed.prerelease,
    build: parsed.build,
  };
}

module.exports = { getVersionDetails };
