'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { fetchDbSecret } = require('../src/db/secrets');

// fetchDbSecret must read ONLY DB_SECRET_NAME + AWS_REGION and fail loudly when
// either is absent — before any AWS call and with no fallback credential.

test('fetchDbSecret rejects when DB_SECRET_NAME is missing', async () => {
  const prev = { name: process.env.DB_SECRET_NAME, region: process.env.AWS_REGION };
  delete process.env.DB_SECRET_NAME;
  process.env.AWS_REGION = 'us-east-1';
  try {
    await assert.rejects(fetchDbSecret(), /DB_SECRET_NAME/);
  } finally {
    if (prev.name === undefined) delete process.env.DB_SECRET_NAME;
    else process.env.DB_SECRET_NAME = prev.name;
    if (prev.region === undefined) delete process.env.AWS_REGION;
    else process.env.AWS_REGION = prev.region;
  }
});

test('fetchDbSecret rejects when AWS_REGION is missing', async () => {
  const prev = { name: process.env.DB_SECRET_NAME, region: process.env.AWS_REGION };
  process.env.DB_SECRET_NAME = 'crypto-tracker/nonprod/db';
  delete process.env.AWS_REGION;
  try {
    await assert.rejects(fetchDbSecret(), /AWS_REGION/);
  } finally {
    if (prev.name === undefined) delete process.env.DB_SECRET_NAME;
    else process.env.DB_SECRET_NAME = prev.name;
    if (prev.region === undefined) delete process.env.AWS_REGION;
    else process.env.AWS_REGION = prev.region;
  }
});
