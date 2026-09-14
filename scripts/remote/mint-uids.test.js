import { describe, it, expect } from 'vitest';
import { parseTherapistsCsv, mint } from './mint-uids.mjs';
import { isValidUid, generateUid } from '../../shared/remote/uid.js';

const CSV = `email,course,count,label
a@clinic.example,2026-cbt-a,2,batch 1
b@clinic.example,2026-cbt-b,1,
`;

describe('parseTherapistsCsv', () => {
  it('parses rows and validates fields', () => {
    expect(parseTherapistsCsv(CSV)).toEqual([
      { email: 'a@clinic.example', course: '2026-cbt-a', count: 2, label: 'batch 1' },
      { email: 'b@clinic.example', course: '2026-cbt-b', count: 1, label: '' },
    ]);
    expect(() => parseTherapistsCsv('email,course\nx@y.z,c')).toThrow(/count/);
    expect(() => parseTherapistsCsv('email,course,count\nnot-an-email,c,1')).toThrow(/bad email/);
    expect(() => parseTherapistsCsv('email,course,count\nx@y.z,c,0')).toThrow(/1–500/);
  });
});

describe('mint', () => {
  it('mints unique valid uids, SQL with normalised keys, handouts per therapist', () => {
    // Second draw repeats the first on purpose: mint must retry, not duplicate.
    const seq = [0, 0, 1, 2];
    let n = 0;
    const generate = () => generateUid(() => Uint8Array.from([seq[n++ % seq.length], 0, 0, 0, 0, 0, 0]));
    const { rows, sql, handouts, summary } = mint(parseTherapistsCsv(CSV), { generate, now: new Date('2026-09-14T00:00:00Z') });
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map(r => r.uid)).size).toBe(3);
    for (const r of rows) expect(isValidUid(r.uid)).toBe(true);
    expect(sql).toContain("INSERT INTO registry (uid, therapist_email, course, label, created_at) VALUES ('");
    expect(sql).toContain("'a@clinic.example', '2026-cbt-a', 'batch 1', '2026-09-14T00:00:00.000Z'");
    expect(sql).toContain("'b@clinic.example', '2026-cbt-b', NULL,");
    expect(sql).not.toMatch(/VALUES \('[^']*-/);          // keys stored without the hyphen
    expect(handouts.get('a@clinic.example').split('\n').filter(Boolean)).toHaveLength(3);   // header + 2
    expect(handouts.get('b@clinic.example')).toContain(rows[2].uid);
    expect(summary.split('\n').filter(Boolean)).toHaveLength(4);
  });
  it('gives up on a generator that never yields a fresh uid', () => {
    expect(() => mint([{ email: 'a@b.c', course: 'c', count: 2 }], { generate: () => 'AAAA-AAAA' })).toThrow(/colliding/);
  });
  it('escapes quotes in labels', () => {
    const { sql } = mint([{ email: 'a@b.c', course: 'c', count: 1, label: "O'Neil" }]);
    expect(sql).toContain("'O''Neil'");
  });
});
