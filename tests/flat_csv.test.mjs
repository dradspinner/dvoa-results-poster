import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const compilerOptions = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext };
const serviceSource = readFileSync(new URL('../src/services/resultsExportService.ts', import.meta.url), 'utf8');
const serviceJs = ts.transpileModule(serviceSource, { compilerOptions }).outputText;
const { resultsExportService } = await import(`data:text/javascript;base64,${Buffer.from(serviceJs).toString('base64')}`);
const header = 'Last Name,First Name,Year of Birth,Sex,Club,Chip #,Group/Solo,Time,Place,Status,Course';
const runner = (overrides = {}) => ({
  name: 'Alice Smith', firstName: 'Alice', lastName: 'Smith',
  yearOfBirth: 1990, sex: 'F', club: 'DVOA',
  status: 'OK', runTime: '1800', place: '1', ...overrides
});
const course = (runners, className = 'White') => ({ classId: '1', className, runners });
const exportRows = (runners, overrides) => resultsExportService.generateFlatCSV([course(runners)], overrides).split('\r\n').slice(1);

// ── Header ──────────────────────────────────────────────────────────────────

test('exports the exact eleven-column header, including empty events', () => {
  assert.equal(resultsExportService.generateFlatCSV([]), header);
  assert.equal(resultsExportService.generateFlatCSV([course([])]), header);
});

// ── Basic export ────────────────────────────────────────────────────────────

test('exports finishers with an Excel day fraction and CRLF records', () => {
  assert.equal(resultsExportService.generateFlatCSV([course([runner()])]),
    `${header}\r\nSmith,Alice,1990,F,DVOA,,Solo,0.0208333333,1,,White`);
});

// ── Group detection ─────────────────────────────────────────────────────────

test('empty Family + non-empty Given is a structural group (regardless of nationality)', () => {
  const rows = exportRows([
    runner({ firstName: 'Alice & Bob', lastName: '', yearOfBirth: undefined, sex: undefined }),
    runner({ firstName: 'Team Fun', lastName: '', yearOfBirth: undefined, sex: undefined, nationality: '2' }),
  ]);
  assert.match(rows[0], /^,Alice & Bob.*Group/);
  assert.match(rows[1], /^,Team Fun.*Group/);
});

test('no YOB + no sex with non-empty lastName defaults to Group', () => {
  const rows = exportRows([
    runner({ yearOfBirth: undefined, sex: undefined }),
  ]);
  assert.equal(rows[0], 'Smith,Alice,,,DVOA,,Group,0.0208333333,1,,White');
});

test('having YOB makes an entry Solo even without sex', () => {
  const rows = exportRows([
    runner({ yearOfBirth: 1990, sex: undefined }),
  ]);
  assert.match(rows[0], /Solo/);
});

test('having sex makes an entry Solo even without YOB', () => {
  const rows = exportRows([
    runner({ yearOfBirth: undefined, sex: 'F' }),
  ]);
  assert.match(rows[0], /Solo/);
});

test('groupOverrides override the default group detection', () => {
  // Default would be Group (no YOB, no sex)
  const predicted = runner({ yearOfBirth: undefined, sex: undefined });
  const overrides = new Map([['White|Alice|Smith', false]]);
  const rows = exportRows([predicted], overrides);
  assert.match(rows[0], /Solo/);

  // Default would be Solo (has YOB), override to Group
  const solo = runner();
  const overrides2 = new Map([['White|Alice|Smith', true]]);
  const rows2 = exportRows([solo], overrides2);
  assert.match(rows2[0], /Group/);
});

test('nationality and bibNumber do NOT affect group detection', () => {
  // nationality='0' but has YOB+sex → Solo
  const rows1 = exportRows([runner({ nationality: '0' })]);
  assert.match(rows1[0], /Solo/);

  // bibNumber present but has YOB+sex → Solo
  const rows2 = exportRows([runner({ bibNumber: '2' })]);
  assert.match(rows2[0], /Solo/);

  // nationality='2' + no YOB + no sex → Group (by heuristic, not nationality)
  const rows3 = exportRows([runner({ nationality: '2', yearOfBirth: undefined, sex: undefined })]);
  assert.match(rows3[0], /Group/);
});

// ── detectPredictedGroups ───────────────────────────────────────────────────

test('detectPredictedGroups flags entries needing validation', () => {
  const results = [course([
    runner(),                                                        // has YOB+sex → skip
    runner({ yearOfBirth: undefined, sex: undefined }),              // no YOB, no sex, non-empty lastName → predicted
    runner({ firstName: 'GroupName', lastName: '', yearOfBirth: undefined, sex: undefined }), // empty lastName → structural group, skip
    runner({ yearOfBirth: undefined, sex: 'M' }),                    // has sex → skip
  ])];
  const predictions = resultsExportService.detectPredictedGroups(results);
  assert.equal(predictions.length, 1);
  assert.equal(predictions[0].name, 'Alice Smith');
  assert.equal(predictions[0].className, 'White');
});

// ── DNS inclusion ───────────────────────────────────────────────────────────

test('DNS entries are included with Status DNS', () => {
  const rows = exportRows([
    runner({ status: 'DidNotStart', runTime: '0', place: '' }),
    runner({ status: 'DNS', runTime: '0', place: '', firstName: 'Bob', lastName: 'Jones' }),
  ]);
  assert.equal(rows.length, 2);
  assert.match(rows[0], /,DNS,White$/);
  assert.match(rows[1], /,DNS,White$/);
});

// ── Status column ───────────────────────────────────────────────────────────

test('Status is blank for OK finishers', () => {
  const rows = exportRows([runner()]);
  assert.equal(rows[0].split(',')[9], '');
});

test('Status shows short labels for non-finishers', () => {
  const cases = [
    ['MissingPunch', 'MP'],
    ['DidNotFinish', 'DNF'],
    ['DidNotStart', 'DNS'],
    ['Disqualified', 'Disqualified'],
    ['NotCompeting', 'NotCompeting'],
  ];
  for (const [xmlStatus, expected] of cases) {
    const rows = exportRows([runner({ status: xmlStatus, runTime: '0', place: '' })]);
    assert.equal(rows[0].split(',')[9], expected, xmlStatus);
  }
});

test('non-finishers have blank time and place', () => {
  for (const status of ['MissingPunch', 'DidNotFinish', 'DidNotStart']) {
    const row = exportRows([runner({ status, runTime: '0', place: '' })])[0].split(',');
    assert.equal(row[7], '', `time for ${status}`);
    assert.equal(row[8], '', `place for ${status}`);
  }
});

// ── Time formatting ─────────────────────────────────────────────────────────

test('preserves fractional times, zero, and durations longer than one day', () => {
  for (const seconds of [0, 0.5, 1800.75, 90000]) {
    const row = exportRows([runner({ runTime: String(seconds) })])[0].split(',');
    assert.ok(Math.abs(Number(row[7]) * 86400 - seconds) < 0.00001);
  }
});

test('rejects negative, nonfinite, blank, and partially numeric times', () => {
  for (const runTime of ['-1', 'Infinity', 'NaN', '', ' ', '1800junk']) {
    assert.equal(exportRows([runner({ runTime })])[0].split(',')[7], '', runTime);
  }
});

// ── Place formatting ────────────────────────────────────────────────────────

test('only writes positive integer finishing places', () => {
  for (const place of ['', 'MP', '0', '-1', '1.5', '1,2']) {
    assert.equal(exportRows([runner({ place })])[0].split(',')[8], '', place);
  }
  assert.equal(exportRows([runner({ place: ' 12 ' })])[0].split(',')[8], '12');
});

// ── CSV escaping ────────────────────────────────────────────────────────────

test('escapes commas, quotes, CR and LF in every text column', () => {
  const csv = resultsExportService.generateFlatCSV([course([runner({
    lastName: 'Smith, Jr.', firstName: 'Al"ice', club: 'North\rSouth\nClub', sex: 'F,M'
  })], 'White, "Short"')]);
  assert.equal(csv, `${header}\r\n"Smith, Jr.","Al""ice",1990,"F,M","North\rSouth\nClub",,Solo,0.0208333333,1,,"White, ""Short"""`);
});

// ── buildFlatRowData ────────────────────────────────────────────────────────

test('buildFlatRowData returns typed values for XLSX consumption', () => {
  const { headers, rows } = resultsExportService.buildFlatRowData([course([runner()])]);
  assert.equal(headers.length, 11);
  assert.equal(headers[5], 'Chip #');
  assert.equal(headers[9], 'Status');
  assert.equal(rows.length, 1);
  // Chip # should be empty for the default runner
  assert.equal(rows[0][5], '');
  // Time should be a number, not a string
  assert.equal(typeof rows[0][7], 'number');
  assert.ok(Math.abs(rows[0][7] * 86400 - 1800) < 0.00001);
  // Place should be a number
  assert.equal(rows[0][8], 1);
  // Status should be empty string for OK
  assert.equal(rows[0][9], '');
});

test('buildFlatRowData returns null for missing time and place', () => {
  const { rows } = resultsExportService.buildFlatRowData([course([
    runner({ status: 'MissingPunch', runTime: '0', place: '' })
  ])]);
  assert.equal(rows[0][7], null); // time
  assert.equal(rows[0][8], null); // place
  assert.equal(rows[0][9], 'MP'); // status
});

// ── Immutability ────────────────────────────────────────────────────────────

test('does not mutate the input data', () => {
  const data = [course([runner()])];
  const before = structuredClone(data);
  resultsExportService.generateFlatCSV(data);
  assert.deepEqual(data, before);
});
