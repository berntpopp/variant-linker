'use strict';
const assert = require('node:assert/strict');
const sinon = require('sinon');
const axios = require('axios').default;
const { fetchApi, resolveRequestOptions } = require('../src/apiHelper');
const { parseRetryAfter } = require('../src/api/requestContext');

describe('Ensembl Retry-After compliance', () => {
  afterEach(() => sinon.restore());

  it('does not reinterpret malformed numeric Retry-After values as calendar dates', () => {
    for (const value of ['-1', '4e1', '0x10', '', null, undefined]) {
      assert.equal(parseRetryAfter(value, 0), 0);
    }
  });

  it('allows long full-size POST batches by default while preserving explicit budgets', () => {
    const defaults = resolveRequestOptions();
    assert.equal(defaults.timeoutMs, 60000);
    assert.equal(defaults.deadlineMs, 120000);
    assert.equal(resolveRequestOptions({ timeoutMs: 125 }).timeoutMs, 125);
    assert.equal(resolveRequestOptions({ timeout: 250 }).timeoutMs, 250);
    assert.equal(resolveRequestOptions({ timeout: 250, timeoutMs: 125 }).timeoutMs, 125);
  });

  for (const header of ['40.5', 'Fri, 11 Sep 2026 00:00:41 GMT']) {
    it(`honors full server wait ${header} beyond the client backoff cap`, async () => {
      const clock = sinon.useFakeTimers({ now: Date.parse('2026-09-11T00:00:00Z') });
      const wait = header === '40.5' ? 40500 : 41000;
      const transport = sinon.stub(axios, 'get');
      transport
        .onFirstCall()
        .rejects({ response: { status: 429, headers: { 'retry-after': header } } });
      transport.onSecondCall().resolves({ data: 'done' });
      const result = fetchApi('/limited', {}, false, 'GET', null, null, {
        maxRetryDelayMs: 10,
        deadlineMs: 60000,
      });
      await clock.tickAsync(wait - 1);
      assert.equal(transport.callCount, 1, 'must not retry before the server delay');
      await clock.tickAsync(1);
      assert.equal(await result, 'done');
      assert.equal(transport.callCount, 2);
    });
  }

  it('rejects immediately when Retry-After cannot fit the remaining overall deadline', async () => {
    const clock = sinon.useFakeTimers();
    const transport = sinon.stub(axios, 'get').callsFake(async () => {
      clock.setSystemTime(5000);
      throw { response: { status: 429, headers: { 'retry-after': '10' } } };
    });
    const rejection = assert.rejects(
      fetchApi('/limited', {}, false, 'GET', null, null, {
        deadlineMs: 12000,
        maxRetryDelayMs: 10,
      }),
      /deadline/i
    );
    await clock.tickAsync(0);
    assert.equal(
      clock.countTimers(),
      0,
      'no premature retry or unusable delay may remain scheduled'
    );
    await rejection;
    assert.equal(transport.callCount, 1);
  });

  it('cancels while waiting without sending another request', async () => {
    const clock = sinon.useFakeTimers();
    const controller = new AbortController();
    const transport = sinon
      .stub(axios, 'get')
      .rejects({ response: { status: 429, headers: { 'retry-after': '40' } } });
    const rejection = assert.rejects(
      fetchApi('/limited', {}, false, 'GET', null, null, { signal: controller.signal }),
      /stop/
    );
    await clock.tickAsync(100);
    controller.abort(new Error('stop'));
    await rejection;
    assert.equal(transport.callCount, 1);
    assert.equal(clock.countTimers(), 0);
  });

  it('uses bounded client backoff for an invalid Retry-After value', async () => {
    const clock = sinon.useFakeTimers();
    const transport = sinon.stub(axios, 'get');
    transport
      .onFirstCall()
      .rejects({ response: { status: 503, headers: { 'retry-after': 'invalid' } } });
    transport.onSecondCall().resolves({ data: 'done' });
    const result = fetchApi('/limited', {}, false, 'GET', null, null, { maxRetryDelayMs: 10 });
    await clock.tickAsync(9);
    assert.equal(transport.callCount, 1);
    await clock.tickAsync(1);
    assert.equal(await result, 'done');
  });
});
