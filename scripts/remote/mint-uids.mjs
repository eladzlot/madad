#!/usr/bin/env node
/**
 * mint-uids.mjs — operator tool for the remote deployment (REMOTE_SPEC §3, D-5).
 *
 * Reads a CSV of therapists and mints uids for each, emitting:
 *   • a SQL file of INSERTs for the `registry` table (apply with
 *     `wrangler d1 execute madad-remote --remote --file=<sql>`)
 *   • one handout CSV per therapist (uid list to give their patients)
 *   • a summary CSV (therapist_email, course, uid) for the operator's records
 *
 * Input CSV columns (header required): email,course,count[,label]
 *
 * Usage:
 *   node scripts/remote/mint-uids.mjs therapists.csv --out ./minted/2026-10
 *
 * The random source is WebCrypto; the check symbol comes from the shared uid
 * module, so anything minted here validates everywhere the uid is used.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { generateUid, normalizeUid } from '../../shared/remote/uid.js';

export function parseTherapistsCsv(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  if (lines.length === 0) throw new Error('empty CSV');
  const header = lines[0].split(',').map(h => h.trim().toLowerCase());
  const col = (name) => header.indexOf(name);
  for (const required of ['email', 'course', 'count']) {
    if (col(required) === -1) throw new Error(`CSV header must include "${required}" (got: ${header.join(',')})`);
  }
  return lines.slice(1).map((line, i) => {
    const cells = line.split(',').map(c => c.trim());
    const row = {
      email: cells[col('email')],
      course: cells[col('course')],
      count: Number(cells[col('count')]),
      label: col('label') === -1 ? '' : (cells[col('label')] ?? ''),
    };
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(row.email ?? '')) throw new Error(`line ${i + 2}: bad email "${row.email}"`);
    if (!row.course) throw new Error(`line ${i + 2}: missing course`);
    if (!Number.isInteger(row.count) || row.count < 1 || row.count > 500) throw new Error(`line ${i + 2}: count must be 1–500`);
    return row;
  });
}

/** Pure: therapists → { rows: [{email, course, label, uid}], sql, handouts: Map(email → csv), summary } */
export function mint(therapists, { generate = generateUid, now = new Date() } = {}) {
  const seen = new Set();
  const rows = [];
  for (const t of therapists) {
    for (let i = 0; i < t.count; i++) {
      let uid, attempts = 0;
      do {
        uid = generate();
        if (++attempts > 100) throw new Error('uid generator keeps colliding — is the random source broken?');
      } while (seen.has(uid));
      seen.add(uid);
      rows.push({ email: t.email, course: t.course, label: t.label, uid });
    }
  }
  const createdAt = now.toISOString();
  const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
  const sql = [
    `-- minted ${createdAt}; ${rows.length} uid(s) for ${therapists.length} therapist(s)`,
    ...rows.map(r =>
      `INSERT INTO registry (uid, therapist_email, course, label, created_at) VALUES (${q(normalizeUid(r.uid))}, ${q(r.email)}, ${q(r.course)}, ${r.label ? q(r.label) : 'NULL'}, ${q(createdAt)});`),
    '',
  ].join('\n');
  const handouts = new Map();
  for (const t of therapists) {
    const mine = rows.filter(r => r.email === t.email && r.course === t.course);
    handouts.set(`${t.email}`, ['uid,patient (fill in yourself; never send this column anywhere)', ...mine.map(r => `${r.uid},`)].join('\n') + '\n');
  }
  const summary = ['therapist_email,course,uid', ...rows.map(r => `${r.email},${r.course},${r.uid}`)].join('\n') + '\n';
  return { rows, sql, handouts, summary };
}

function main(argv) {
  const [input] = argv.filter(a => !a.startsWith('--'));
  const outIdx = argv.indexOf('--out');
  const out = outIdx === -1 ? 'minted' : argv[outIdx + 1];
  if (!input) {
    console.error('usage: node scripts/remote/mint-uids.mjs <therapists.csv> [--out <dir>]');
    process.exit(2);
  }
  const therapists = parseTherapistsCsv(readFileSync(input, 'utf8'));
  const { rows, sql, handouts, summary } = mint(therapists);
  mkdirSync(join(out, 'handouts'), { recursive: true });
  writeFileSync(join(out, 'registry.sql'), sql);
  writeFileSync(join(out, 'summary.csv'), summary);
  for (const [email, csv] of handouts) {
    writeFileSync(join(out, 'handouts', `${email.replace(/[^a-z0-9@._-]/gi, '_')}.csv`), csv);
  }
  console.log(`✓ minted ${rows.length} uid(s) for ${therapists.length} therapist(s) → ${out}/`);
  console.log(`  apply: npx wrangler d1 execute madad-remote --remote --file=${join(out, 'registry.sql')}`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main(process.argv.slice(2));
}
