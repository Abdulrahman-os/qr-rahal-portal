/**
 * GET /api/admin/npm-audit  (TEMPORARY DIAGNOSTIC — remove after use)
 * ─────────────────────────────────────────────────────────────────────────
 * Runs the REAL `npm audit --json` on THIS deployed server, where
 * node_modules actually exists and npm has real registry access —
 * neither of which is true in the sandbox this project was built in.
 * This is how we get real vulnerability data instead of guessing.
 *
 * Admin-gated with the same x-internal-api-key trust boundary as
 * /api/admin/staff/provision — this executes a shell command, so it
 * must never be reachable without that key.
 *
 * DELETE THIS FILE after you've gotten the audit output you need.
 * It has no place in a long-term production deployment — running
 * arbitrary-ish shell commands from an API route, even a gated one,
 * is exactly the kind of thing that should be temporary and
 * deliberately removed once its one job is done.
 * ─────────────────────────────────────────────────────────────────────────
 */
const { execSync } = require('child_process');
const { isAuthorizedAdminRequest } = require('../../../lib/security/adminAuth');

export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ code: 'METHOD_NOT_ALLOWED', message: 'Use GET' });
  if (!isAuthorizedAdminRequest(req)) {
    return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Missing or invalid internal API key.' });
  }

  let rawOutput;
  try {
    // npm audit exits non-zero when vulnerabilities are found — that's
    // not a real error for our purposes, so capture stdout regardless.
    rawOutput = execSync('npm audit --json', { cwd: process.cwd(), encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  } catch (err) {
    // execSync throws on non-zero exit, but npm still writes the JSON
    // to stdout in that case — recover it from the error object.
    rawOutput = err.stdout || null;
    if (!rawOutput) {
      return res.status(500).json({ code: 'AUDIT_FAILED', message: 'npm audit produced no output.', stderr: err.stderr?.toString()?.slice(0, 2000) });
    }
  }

  let parsed;
  try {
    parsed = JSON.parse(rawOutput);
  } catch {
    return res.status(500).json({ code: 'PARSE_FAILED', message: 'Could not parse npm audit output as JSON.', rawPreview: rawOutput.slice(0, 2000) });
  }

  // Summarize to just what's actionable — package name, severity,
  // advisory title/url, fix availability — rather than dumping the
  // entire (often large) raw npm audit tree structure.
  const vulnerabilities = Object.entries(parsed.vulnerabilities || {}).map(([name, info]) => ({
    package: name,
    severity: info.severity,
    via: (info.via || []).map(v => typeof v === 'string' ? v : { title: v.title, url: v.url, severity: v.severity }),
    range: info.range,
    fixAvailable: info.fixAvailable,
  }));

  return res.status(200).json({
    summary: parsed.metadata?.vulnerabilities || null,
    vulnerabilities,
  });
}
