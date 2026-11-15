import assert from 'node:assert/strict';
import { test } from 'node:test';
import { retryRequest } from './retry.js';

test('retryRequest waits for Retry-After on HTTP rate limits', async () => {
  const waits: number[] = [];
  let calls = 0;
  const result = await retryRequest(
    async () => {
      calls += 1;
      if (calls === 1) {
        const error = new Error('rate limited') as Error & {
          status: number;
          response: { headers: Record<string, string> };
        };
        error.status = 429;
        error.response = { headers: { 'retry-after': '7' } };
        throw error;
      }
      return 'ok';
    },
    async (milliseconds) => {
      waits.push(milliseconds);
    },
  );

  assert.equal(result, 'ok');
  assert.deepEqual(waits, [7000]);
});

test('retryRequest recognizes GraphQL rate-limit errors', async () => {
  const waits: number[] = [];
  let calls = 0;
  await assert.doesNotReject(() =>
    retryRequest(
      async () => {
        calls += 1;
        if (calls === 1) {
          throw {
            errors: [{ type: 'RATE_LIMITED', message: 'API rate limit exceeded' }],
          };
        }
        return undefined;
      },
      async (milliseconds) => {
        waits.push(milliseconds);
      },
    ),
  );

  assert.equal(calls, 2);
  assert.deepEqual(waits, [1000]);
});

test('retryRequest caps excessive rate-limit waits', async () => {
  const waits: number[] = [];
  let calls = 0;
  await assert.doesNotReject(() =>
    retryRequest(
      async () => {
        calls += 1;
        if (calls === 1) {
          const error = Object.assign(new Error('rate limited'), {
            status: 429,
            response: { headers: { 'retry-after': '3600' } },
          });
          throw error;
        }
        return undefined;
      },
      async (milliseconds) => {
        waits.push(milliseconds);
      },
    ),
  );

  assert.deepEqual(waits, [60_000]);
});

test('retryRequest reads case-insensitive plain-object rate-limit headers', async () => {
  const waits: number[] = [];
  let calls = 0;
  await assert.doesNotReject(() =>
    retryRequest(
      async () => {
        calls += 1;
        if (calls === 1) {
          const error = Object.assign(new Error('rate limited'), {
            status: 429,
            response: { headers: { 'Retry-After': '3' } },
          });
          throw error;
        }
        return undefined;
      },
      async (milliseconds) => {
        waits.push(milliseconds);
      },
    ),
  );

  assert.deepEqual(waits, [3000]);
});
