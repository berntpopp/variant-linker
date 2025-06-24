// test/genotypeUtils.test.js
'use strict';

const { expect } = require('chai');

const {
  isRef,
  isHet,
  isHomAlt,
  isVariant,
  isMissing,
} = require('../src/inheritance/genotypeUtils');

describe('Genotype Utils', () => {
  describe('isRef', () => {
    it('should correctly identify reference homozygous genotypes', () => {
      expect(isRef('0/0')).to.be.true;
      expect(isRef('0|0')).to.be.true;
      expect(isRef('0-0')).to.be.true;
    });

    it('should return false for non-reference genotypes', () => {
      expect(isRef('0/1')).to.be.false;
      expect(isRef('1/1')).to.be.false;
      expect(isRef('./.')).to.be.false;
      expect(isRef('')).to.be.false;
      expect(isRef(null)).to.be.false;
    });
  });

  describe('isHet', () => {
    it('should correctly identify heterozygous genotypes', () => {
      expect(isHet('0/1')).to.be.true;
      expect(isHet('1/0')).to.be.true;
      expect(isHet('0|1')).to.be.true;
      expect(isHet('1|0')).to.be.true;
      expect(isHet('0-1')).to.be.true;
      expect(isHet('1-0')).to.be.true;
    });

    it('should return false for non-heterozygous genotypes', () => {
      expect(isHet('0/0')).to.be.false;
      expect(isHet('1/1')).to.be.false;
      expect(isHet('./.')).to.be.false;
      expect(isHet('')).to.be.false;
      expect(isHet(null)).to.be.false;
    });
  });

  describe('isHomAlt', () => {
    it('should correctly identify alternate homozygous genotypes', () => {
      expect(isHomAlt('1/1')).to.be.true;
      expect(isHomAlt('1|1')).to.be.true;
      expect(isHomAlt('1-1')).to.be.true;
    });

    it('should return false for non-alternate homozygous genotypes', () => {
      expect(isHomAlt('0/0')).to.be.false;
      expect(isHomAlt('0/1')).to.be.false;
      expect(isHomAlt('./.')).to.be.false;
      expect(isHomAlt('')).to.be.false;
      expect(isHomAlt(null)).to.be.false;
    });
  });

  describe('isVariant', () => {
    it('should correctly identify variant genotypes', () => {
      expect(isVariant('0/1')).to.be.true;
      expect(isVariant('1/0')).to.be.true;
      expect(isVariant('1/1')).to.be.true;
      expect(isVariant('0|1')).to.be.true;
      expect(isVariant('1|1')).to.be.true;
    });

    it('should return false for reference and missing genotypes', () => {
      expect(isVariant('0/0')).to.be.false;
      expect(isVariant('./.')).to.be.false;
      expect(isVariant('')).to.be.false;
      expect(isVariant(null)).to.be.false;
    });
  });

  describe('isMissing', () => {
    it('should correctly identify missing genotypes', () => {
      expect(isMissing('./.')).to.be.true;
      expect(isMissing('.|.')).to.be.true;
      expect(isMissing('.-.')).to.be.true;
      expect(isMissing('')).to.be.true;
      expect(isMissing(null)).to.be.true;
      expect(isMissing(undefined)).to.be.true;
    });

    it('should return false for valid genotypes', () => {
      expect(isMissing('0/0')).to.be.false;
      expect(isMissing('0/1')).to.be.false;
      expect(isMissing('1/1')).to.be.false;
    });
  });
});
