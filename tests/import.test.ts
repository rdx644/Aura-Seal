import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { eventInput, importResults } from '../lib/domain';

test('TEST-01 validates dates and requires public disclosure consent', () => {
  assert.equal(eventInput.safeParse({ title: 'Nova Labs', issuer: 'Nova Studio', date: '2026-02-30', demo: true, disclose: true }).success, false);
  assert.equal(eventInput.safeParse({ title: 'Nova Labs', issuer: 'Nova Studio', date: '2026-11-24', demo: true, disclose: false }).success, false);
});

test('TEST-02 preserves Unicode and diagnoses invalid and duplicate rows', async () => {
  const csv = 'participant_ref,display_name,tier,rank\n1,"Ana, 李",winner,1\n1,Ana,winner,1\n2,,finalist,2\n3,Sam,participant,1\n4,Noor,participant,';
  const result = await importResults('results.csv', Buffer.from(csv));
  assert.deepEqual(result.rows.map(({ displayName, rank }) => [displayName, rank]), [['Ana, 李', 1], ['Noor', null]]);
  assert.deepEqual(result.errors.map(({ row }) => row), [3, 4, 5]);
});

test('TEST-12 reads a real XLSX worksheet with validated rank and Unicode names', async () => {
  const file = await readFile(new URL('./fixtures/demo.xlsx', import.meta.url));
  const report = await importResults('demo.xlsx', file);
  assert.deepEqual(report.rows.map(row => [row.displayName, row.rank]), [['Míra Ko', 3], ['Lei 吴', null]]);
  assert.deepEqual(report.errors, []);
});
