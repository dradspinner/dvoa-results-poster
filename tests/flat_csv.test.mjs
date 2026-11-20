import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const compilerOptions = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext };
const serviceSource = readFileSync(new URL('../src/services/resultsExportService.ts', import.meta.url), 'utf8');
const serviceJs = ts.transpileModule(serviceSource, { compilerOptions }).outputText;
const { resultsExportService } = await import(`data:text/javascript;base64,${Buffer.from(serviceJs).toString('base64')}`);
const header = 'Last Name,First Name,Year of Birth,Sex,Club,Group/Solo,Time,Place,Course';
const runner = (overrides = {}) => ({
  id: 'runner_1', name: 'Alice Smith', firstName: 'Alice', lastName: 'Smith',
  yearOfBirth: 1990, sex: 'F', club: 'DVOA', nationality: 'USA',
  status: 'OK', startTime: '0', runTime: '1800', place: '1', ...overrides
});
const course = (runners, className = 'White') => ({ classId: '1', className, runners });
const exportRows = runners => resultsExportService.generateFlatCSV([course(runners)]).split('\r\n').slice(1);

test('exports the exact nine-column header, including empty events', () => {
  assert.equal(resultsExportService.generateFlatCSV([]), header);
  assert.equal(resultsExportService.generateFlatCSV([course([])]), header);
});

test('exports finishers with an Excel day fraction and CRLF records', () => {
  assert.equal(resultsExportService.generateFlatCSV([course([runner()])]),
    `${header}\r\nSmith,Alice,1990,F,DVOA,Solo,0.0208333333,1,White`);
});

test('recognizes nationality code zero as Group, without guessing from missing personal data', () => {
  const rows = exportRows([
    runner({ nationality: '0', firstName: 'Alice & Bob', lastName: '', yearOfBirth: undefined }),
    runner({ nationality: '', yearOfBirth: undefined })
  ]);
  assert.equal(rows[0], ',Alice & Bob,,F,DVOA,Group,0.0208333333,1,White');
  assert.equal(rows[1], 'Smith,Alice,,F,DVOA,Solo,0.0208333333,1,White');
});

test('excludes both DNS status spellings', () => {
  assert.equal(resultsExportService.generateFlatCSV([course([
    runner({ status: 'DNS' }), runner({ status: 'DidNotStart' })
  ])]), header);
});

test('leaves finishing time and place blank for non-finishers and unranked statuses', () => {
  for (const status of ['MissingPunch', 'MP', 'DidNotFinish', 'DNF', 'Disqualified', 'NotCompeting']) {
    assert.equal(exportRows([runner({ status })])[0], 'Smith,Alice,1990,F,DVOA,Solo,,,White', status);
  }
});

test('preserves fractional times, zero, and durations longer than one day', () => {
  for (const seconds of [0, 0.5, 1800.75, 90000]) {
    const row = exportRows([runner({ runTime: String(seconds) })])[0].split(',');
    assert.ok(Math.abs(Number(row[6]) * 86400 - seconds) < 0.00001);
  }
});

test('rejects negative, nonfinite, blank, and partially numeric times', () => {
  for (const runTime of ['-1', 'Infinity', 'NaN', '', ' ', '1800junk']) {
    assert.equal(exportRows([runner({ runTime })])[0].split(',')[6], '', runTime);
  }
});

test('only writes positive integer finishing places', () => {
  for (const place of ['', 'MP', '0', '-1', '1.5', '1,2']) {
    assert.equal(exportRows([runner({ place })])[0].split(',')[7], '', place);
  }
  assert.equal(exportRows([runner({ place: ' 12 ' })])[0].split(',')[7], '12');
});

test('escapes commas, quotes, CR and LF in every text column', () => {
  const csv = resultsExportService.generateFlatCSV([course([runner({
    lastName: 'Smith, Jr.', firstName: 'Al"ice', club: 'North\rSouth\nClub', sex: 'F,M'
  })], 'White, "Short"')]);
  assert.equal(csv, `${header}\r\n"Smith, Jr.","Al""ice",1990,"F,M","North\rSouth\nClub",Solo,0.0208333333,1,"White, ""Short"""`);
});

test('supports missing optional fields and Unicode without mutating results', () => {
  const data = [course([runner({
    firstName: 'Zoë', lastName: '李', yearOfBirth: undefined, sex: undefined, club: ''
  })])];
  const before = structuredClone(data);
  assert.equal(resultsExportService.generateFlatCSV(data), `${header}\r\n李,Zoë,,,,Solo,0.0208333333,1,White`);
  assert.deepEqual(data, before);
});

// Extract the component's real handler so its browser/Electron branches can be
// exercised with controlled I/O without installing a second UI testing framework.
const componentSource = readFileSync(new URL('../src/components/ResultsExport.tsx', import.meta.url), 'utf8');
const componentAst = ts.createSourceFile('ResultsExport.tsx', componentSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handlerSource;
function findHandler(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(componentAst) === 'handleGenerateFlatCSV') {
    handlerSource = node.initializer.getText(componentAst);
  }
  ts.forEachChild(node, findHandler);
}
findHandler(componentAst);
assert.ok(handlerSource, 'Flat CSV handler exists in the component');
const handlerJs = ts.transpileModule(`const handler = ${handlerSource};`, { compilerOptions }).outputText;

function exportHarness({ fileName = 'event-results.XML', filePath, bridge = 'electron', saved = { success: true }, canceled = false } = {}) {
  const state = { results: [], loading: [], writes: [], downloads: [], revoked: [], errors: [] };
  const api = { saveFile: async (outputPath, content) => {
    state.writes.push({ outputPath, content });
    if (saved instanceof Error) throw saved;
    return saved;
  } };
  const bindings = {
    fileList: canceled ? [] : [{}], fileContent: '<ResultList/>',
    fileName, filePath: filePath ?? `C:\\events-with-hyphens\\${fileName}`,
    setLoading: value => state.loading.push(value),
    setResult: value => state.results.push(value),
    resultsExportService: { parseOE12XML: () => [course([runner()])], generateFlatCSV: resultsExportService.generateFlatCSV.bind(resultsExportService) },
    window: bridge === 'browser' ? {} : { [bridge]: api },
    message: { warning() {}, success() {}, error: value => state.errors.push(value) },
    console: { error() {} },
    Blob,
    URL: { createObjectURL: () => 'blob:flat-csv-test', revokeObjectURL: value => state.revoked.push(value) },
    document: {
      createElement: () => ({ click() { state.downloads.push({ filename: this.download, url: this.href }); } }),
      body: { appendChild() {}, removeChild() {} }
    }
  };
  const handler = new Function(...Object.keys(bindings), `${handlerJs}\nreturn handler;`)(...Object.values(bindings));
  return { state, run: handler };
}

test('desktop export normalizes basename hyphens but preserves directory names', async () => {
  const { state, run } = exportHarness();
  await run();
  assert.equal(state.writes[0].outputPath, 'C:\\events-with-hyphens\\event_results_flat.csv');
  assert.equal(state.results.at(-1).success, true);
  assert.deepEqual(state.loading, [true, false]);
});

test('a non-XML filename cannot cause the flat export to overwrite the input', async () => {
  const { state, run } = exportHarness({ fileName: 'event-data.txt' });
  await run();
  assert.equal(state.writes[0].outputPath, 'C:\\events-with-hyphens\\event_data.txt_flat.csv');
});

test('filename replacement preserves dollar characters literally', async () => {
  const { state, run } = exportHarness({ fileName: 'event-$&.xml', filePath: '/events-with-hyphens/event-$&.xml' });
  await run();
  assert.equal(state.writes[0].outputPath, '/events-with-hyphens/event_$&_flat.csv');
});

for (const bridge of ['electron', 'electronAPI']) {
  test(`${bridge} reports unsuccessful saves instead of showing a success result`, async () => {
    const { state, run } = exportHarness({ bridge, saved: { success: false, error: 'Disk is read-only' } });
    await run();
    assert.deepEqual(state.results, [null, { success: false, error: 'Disk is read-only' }]);
    assert.deepEqual(state.loading, [true, false]);
    assert.equal(state.errors.length, 1);
  });
}

test('rejected saves reset loading and display the actual error', async () => {
  const { state, run } = exportHarness({ saved: new Error('Disk full') });
  await run();
  assert.equal(state.results.at(-1).error, 'Disk full');
  assert.deepEqual(state.loading, [true, false]);
});

test('browser fallback downloads the normalized filename and revokes its blob URL', async () => {
  const { state, run } = exportHarness({ bridge: 'browser' });
  await run();
  assert.deepEqual(state.downloads, [{ filename: 'event_results_flat.csv', url: 'blob:flat-csv-test' }]);
  assert.deepEqual(state.revoked, ['blob:flat-csv-test']);
  assert.equal(state.results.at(-1).flatCsvPath, 'event_results_flat.csv');
});

test('export without an input does not write or change loading', async () => {
  const { state, run } = exportHarness({ canceled: true });
  await run();
  assert.deepEqual(state.writes, []);
  assert.deepEqual(state.loading, []);
});
