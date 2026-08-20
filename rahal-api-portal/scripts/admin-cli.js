#!/usr/bin/env node
/**
 * Admin CLI — calls the admin-gated diagnostic/provisioning endpoints
 * without needing to hand-craft curl commands. Uses only Node's
 * built-in fetch (Node 18+; Render's current runtime is Node 24, so
 * no dependency needed).
 *
 * Usage:
 *   node scripts/admin-cli.js auth-check
 *   node scripts/admin-cli.js npm-audit
 *   node scripts/admin-cli.js provision '{"staffNumber":"778899",...}'
 *
 * The key is read from the INTERNAL_API_KEY env var by default, or
 * pass --key=<value> explicitly. Base URL defaults to the deployed
 * Render URL; override with --url=<value> or the RAHAL_BASE_URL env
 * var, e.g. for testing against localhost during development.
 *
 * Examples:
 *   INTERNAL_API_KEY=abc123 node scripts/admin-cli.js auth-check
 *   node scripts/admin-cli.js auth-check --key=abc123
 *   node scripts/admin-cli.js auth-check --key=abc123 --url=http://localhost:3000
 */

const DEFAULT_BASE_URL = 'https://qr-rahal-portal.onrender.com';

function parseArgs(argv) {
  const args = { command: argv[0], flags: {} };
  for (const arg of argv.slice(1)) {
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (match) args.flags[match[1]] = match[2];
  }
  return args;
}

function usage() {
  console.log(`
Admin CLI — RAHAL API Portal

Commands:
  auth-check              Check whether INTERNAL_API_KEY is configured correctly
  npm-audit                Run real npm audit on the deployed server
  provision <json>         Provision a new staff account (JSON string as argument)

Flags:
  --key=<value>            Internal API key (or set INTERNAL_API_KEY env var)
  --url=<value>            Base URL (default: ${DEFAULT_BASE_URL})

Examples:
  node scripts/admin-cli.js auth-check --key=YOUR_KEY_HERE
  INTERNAL_API_KEY=YOUR_KEY_HERE node scripts/admin-cli.js npm-audit
  node scripts/admin-cli.js provision '{"staffNumber":"778899","staffType":"FORMER_STAFF","firstName":"A","lastName":"B","email":"a@b.com","dateOfBirth":"1990-01-01","passportNumber":"P123","createdBy":"cli"}' --key=YOUR_KEY_HERE
`);
}

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));

  if (!command || command === 'help' || command === '--help') {
    usage();
    process.exit(0);
  }

  const key = flags.key || process.env.INTERNAL_API_KEY;
  const baseUrl = flags.url || process.env.RAHAL_BASE_URL || DEFAULT_BASE_URL;

  if (!key) {
    console.error('ERROR: No API key provided. Use --key=<value> or set INTERNAL_API_KEY env var.');
    process.exit(1);
  }

  const routes = {
    'auth-check': { path: '/api/admin/auth-check', method: 'GET' },
    'npm-audit': { path: '/api/admin/npm-audit', method: 'GET' },
    'provision': { path: '/api/admin/staff/provision', method: 'POST' },
  };

  const route = routes[command];
  if (!route) {
    console.error(`Unknown command "${command}".`);
    usage();
    process.exit(1);
  }

  const url = baseUrl.replace(/\/$/, '') + route.path;
  const headers = { 'x-internal-api-key': key };

  let body;
  if (command === 'provision') {
    const jsonArg = process.argv.slice(3).find(a => !a.startsWith('--'));
    if (!jsonArg) {
      console.error('ERROR: provision requires a JSON body as an argument. See --help.');
      process.exit(1);
    }
    try {
      JSON.parse(jsonArg); // validate before sending
    } catch (err) {
      console.error('ERROR: provided argument is not valid JSON:', err.message);
      process.exit(1);
    }
    headers['Content-Type'] = 'application/json';
    body = jsonArg;
  }

  console.log(`→ ${route.method} ${url}`);

  try {
    const res = await fetch(url, { method: route.method, headers, body });
    const text = await res.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = text; }

    console.log(`← ${res.status} ${res.statusText}`);
    console.log(JSON.stringify(parsed, null, 2));

    if (!res.ok) process.exit(1);
  } catch (err) {
    console.error('Request failed:', err.message);
    process.exit(1);
  }
}

main();
