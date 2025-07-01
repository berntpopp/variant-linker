// test/apiHelper.test.js

const chai = require('chai');
const expect = chai.expect;
const nock = require('nock');
const apiHelper = require('../src/apiHelper');
const apiConfig = require('../config/apiConfig.json');

describe('apiHelper', () => {
  const apiBaseUrl = process.env.ENSEMBL_BASE_URL || apiConfig.ensembl.baseUrl;
  const testEndpoint = '/test/endpoint';
  const mockResponse = { success: true, data: 'test data' };

  afterEach(() => {
    // Clean up nock interceptors
    nock.cleanAll();
  });

  it('should successfully fetch data on first attempt', async () => {
    // Mock successful response
    nock(apiBaseUrl).get(testEndpoint).reply(200, mockResponse);

    const result = await apiHelper.fetchApi(testEndpoint);
    expect(result).to.deep.equal(mockResponse);
  });

  // Use real timers for this test to allow the retry mechanism to work naturally
  it('should retry on 500 error and succeed on second attempt', async function () {
    this.timeout(process.env.CI ? 60000 : 5000); // Increase timeout to allow for retries

    // First request fails with 500, second succeeds
    nock(apiBaseUrl).get(testEndpoint).reply(500, { error: 'Internal Server Error' });
    nock(apiBaseUrl).get(testEndpoint).reply(200, mockResponse);

    const result = await apiHelper.fetchApi(testEndpoint);
    expect(result).to.deep.equal(mockResponse);
  });

  it('should retry on network error and succeed on third attempt', async function () {
    this.timeout(process.env.CI ? 60000 : 10000); // Increase timeout to allow for multiple retries

    // First two requests fail with network errors, third succeeds
    nock(apiBaseUrl)
      .get(testEndpoint)
      .replyWithError({ code: 'ECONNRESET', message: 'Connection reset' });
    nock(apiBaseUrl)
      .get(testEndpoint)
      .replyWithError({ code: 'ETIMEDOUT', message: 'Connection timed out' });
    nock(apiBaseUrl).get(testEndpoint).reply(200, mockResponse);

    const result = await apiHelper.fetchApi(testEndpoint);
    expect(result).to.deep.equal(mockResponse);
  });

  it('should retry on 429 with Retry-After header', async function () {
    this.timeout(process.env.CI ? 60000 : 5000); // Increase timeout

    // Mock 429 response with Retry-After header, then success
    nock(apiBaseUrl)
      .get(testEndpoint)
      .reply(429, { error: 'Too Many Requests' }, { 'Retry-After': '1' });
    nock(apiBaseUrl).get(testEndpoint).reply(200, mockResponse);

    const result = await apiHelper.fetchApi(testEndpoint);
    expect(result).to.deep.equal(mockResponse);
  });

  it('should not retry on 400 error', async () => {
    // Mock 400 Bad Request (client error)
    nock(apiBaseUrl).get(testEndpoint).reply(400, { error: 'Bad Request' });

    try {
      await apiHelper.fetchApi(testEndpoint);
      throw new Error('Expected fetchApi to throw an error for 400 status code');
    } catch (error) {
      expect(error.response.status).to.equal(400);
    }
  });

  it('should fail after exhausting all retries', async function () {
    this.timeout(process.env.CI ? 60000 : 20000); // Increase timeout for all retries

    // Get retry configuration values for testing
    const maxRetries = apiConfig.requests?.retry?.maxRetries ?? 4;

    // Setup enough mocks to handle all retry attempts plus one extra to be safe
    for (let i = 0; i <= maxRetries + 1; i++) {
      nock(apiBaseUrl).get(testEndpoint).reply(503, { error: 'Service Unavailable' });
    }

    // Make the request and expect it to fail
    let errorThrown = false;
    try {
      await apiHelper.fetchApi(testEndpoint);
    } catch (error) {
      errorThrown = true;
      // Verify it's the right kind of error
      expect(error).to.have.property('response');
      expect(error.response).to.have.property('status', 503);
    }

    // Ensure an error was actually thrown
    expect(errorThrown).to.be.true;

    // Verify that the right number of requests were made
    // (allowing for a tiny bit of flexibility)
    const pendingMocks = nock.pendingMocks();
    expect(pendingMocks.length).to.be.at.most(
      1,
      'Expected all or all but one mocks to be consumed (showing all requests were made)'
    );
  });

  it('should use caching when enabled', async () => {
    // Set up nock to only reply once
    nock(apiBaseUrl).get(testEndpoint).reply(200, mockResponse);

    // First call should make the request
    const result1 = await apiHelper.fetchApi(testEndpoint, {}, true); // cacheEnabled = true

    // Second call should use the cache
    const result2 = await apiHelper.fetchApi(testEndpoint, {}, true);

    expect(result1).to.deep.equal(mockResponse);
    expect(result2).to.deep.equal(mockResponse);

    // Nock should have no pending mocks (only one actual request was made)
    expect(nock.pendingMocks()).to.be.empty;
  });

  it('should handle POST requests correctly', async () => {
    const requestBody = { test: 'data' };
    nock(apiBaseUrl).post(testEndpoint, requestBody).reply(200, mockResponse);

    const result = await apiHelper.fetchApi(testEndpoint, {}, false, 'POST', requestBody);

    expect(result).to.deep.equal(mockResponse);
  });

  it('should handle POST requests with retries', async function () {
    this.timeout(process.env.CI ? 60000 : 5000); // Increase timeout

    const requestBody = { test: 'data' };

    // First attempt fails
    nock(apiBaseUrl).post(testEndpoint, requestBody).reply(502, { error: 'Bad Gateway' });

    // Second attempt succeeds
    nock(apiBaseUrl).post(testEndpoint, requestBody).reply(200, mockResponse);

    const result = await apiHelper.fetchApi(testEndpoint, {}, false, 'POST', requestBody);

    expect(result).to.deep.equal(mockResponse);
  });
});
