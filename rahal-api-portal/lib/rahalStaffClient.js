/**
 * rahalStaffClient — staff account CRUD against the RAHAL frontend
 * ─────────────────────────────────────────────────────────────────────────
 * All staff account data lives in https://stafftravel.qatarairways.com.qa.
 * This module is the single place in the portal that reads and writes
 * staff records — every route goes through here so auth headers and error
 * normalisation are applied consistently.
 *
 * Endpoints consumed:
 *   GET  /api/v1/staff/{staffNumber}   → getStaffAccount()
 *   POST /api/admin/staff/provision    → createStaffAccount()
 *   PUT  /api/v1/staff/{staffNumber}   → updateStaffAccount()
 *
 * ENV VARS (add to Render environment):
 *   RAHAL_FRONTEND_URL      Base URL, default https://stafftravel.qatarairways.com.qa
 *   RAHAL_FRONTEND_API_KEY  API key for service-to-service calls (x-api-key header)
 *   RAHAL_FRONTEND_BEARER   Bearer token if required alongside the API key
 *   RAHAL_FRONTEND_TIMEOUT  Per-request timeout ms (default 10000)
 * ─────────────────────────────────────────────────────────────────────────
 */

'use strict';

const BASE = (process.env.RAHAL_FRONTEND_URL || 'https://stafftravel.qatarairways.com.qa').replace(/\/$/, '');
const TIMEOUT_MS = parseInt(process.env.RAHAL_FRONTEND_TIMEOUT || '10000', 10);

function buildHeaders() {
  const h = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
  if (process.env.RAHAL_FRONTEND_API_KEY) h['x-api-key'] = process.env.RAHAL_FRONTEND_API_KEY;
  if (process.env.RAHAL_FRONTEND_BEARER)  h['Authorization'] = `Bearer ${process.env.RAHAL_FRONTEND_BEARER}`;
  return h;
}

async function rahalFetch(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res;
  try {
    res = await fetch(BASE + path, {
      ...options,
      headers: { ...buildHeaders(), ...(options.headers || {}) },
      signal: controller.signal,
    });
  } catch (err) {
    const e = new Error(`RAHAL frontend unreachable: ${err.message}`);
    e.code = 'RAHAL_FRONTEND_UNREACHABLE';
    throw e;
  } finally {
    clearTimeout(timer);
  }

  // Parse body once — avoids the "body stream already read" crash
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }

  if (!res.ok) {
    const e = new Error(`RAHAL frontend returned ${res.status}`);
    e.status = res.status;
    e.body   = body;
    e.code   = body?.code || 'RAHAL_FRONTEND_ERROR';
    throw e;
  }

  return body;
}

/**
 * Fetch a staff account by staff number.
 * Returns null when the account does not exist (404).
 * Throws on any other error.
 */
async function getStaffAccount(staffNumber) {
  try {
    return await rahalFetch(`/api/v1/staff/${encodeURIComponent(staffNumber)}`);
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

/**
 * Create a new staff account on the RAHAL frontend (provisioning step).
 * Throws with err.code === 'DUPLICATE_STAFF_NUMBER' on 409.
 */
async function createStaffAccount(record) {
  try {
    return await rahalFetch('/api/admin/staff/provision', {
      method: 'POST',
      body: JSON.stringify(record),
    });
  } catch (err) {
    if (err.status === 409) {
      err.code = 'DUPLICATE_STAFF_NUMBER';
    }
    throw err;
  }
}

/**
 * Partial-update a staff account (activation, password hash, status).
 * Returns the updated record.
 */
async function updateStaffAccount(staffNumber, updates) {
  return rahalFetch(`/api/v1/staff/${encodeURIComponent(staffNumber)}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

module.exports = { getStaffAccount, createStaffAccount, updateStaffAccount };
