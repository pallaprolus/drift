import * as assert from 'assert';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { parseArgs, renderText, gitignoreToGlobs, HELP } from '../../../cli/index';
import { CodeType, DocType, DriftSeverity, DriftType } from '../../../models/types';

const CLI = path.resolve(__dirname, '../../../cli/index.js');
const FIXTURE = path.resolve(__dirname, '../../../../src/test/fixtures/workspace');

function runCli(args: string[]) {
    const result = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

suite('CLI: parseArgs', () => {
    test('defaults', () => {
        const o = parseArgs([]);
        assert.deepStrictEqual(o.paths, ['.']);
        assert.strictEqual(o.format, 'text');
        assert.strictEqual(o.threshold, 0.3);
        assert.strictEqual(o.failOn, 'low');
        assert.ok(o.git && o.markdown);
    });

    test('parses every option', () => {
        const o = parseArgs(['src', 'docs', '-f', 'json', '-o', 'r.json', '-t', '0.5', '--fail-on', 'High', '--exclude', 'a/**', '--exclude', 'b/**', '--no-git', '--no-markdown', '--markdown', '**/*.md', '--stale-days', '7', '-q']);
        assert.deepStrictEqual(o.paths, ['src', 'docs']);
        assert.strictEqual(o.format, 'json');
        assert.strictEqual(o.output, 'r.json');
        assert.strictEqual(o.threshold, 0.5);
        assert.strictEqual(o.failOn, 'high');
        assert.deepStrictEqual(o.exclude, ['a/**', 'b/**']);
        assert.strictEqual(o.git, false);
        assert.strictEqual(o.markdown, false);
        assert.deepStrictEqual(o.markdownPatterns, ['**/*.md']);
        assert.strictEqual(o.staleDays, 7);
        assert.ok(o.quiet);
    });

    test('rejects bad input', () => {
        assert.throws(() => parseArgs(['--format', 'xml']), /Unknown format/);
        assert.throws(() => parseArgs(['--threshold', '2']), /between 0 and 1/);
        assert.throws(() => parseArgs(['--fail-on', 'fatal']), /--fail-on/);
        assert.throws(() => parseArgs(['--bogus']), /Unknown option/);
        assert.throws(() => parseArgs(['--output']), /requires a value/);
        assert.match(HELP, /docs-drift/);
    });
});

suite('CLI: gitignoreToGlobs', () => {
    test('converts the common subset', () => {
        const globs = gitignoreToGlobs('# comment\nnode_modules\n/out\n.vscode-test/\n*.vsix\n!keep.vsix\ndocs/build\n\n');
        assert.deepStrictEqual(globs, [
            '**/node_modules', '**/node_modules/**',
            'out', 'out/**',
            '**/.vscode-test', '**/.vscode-test/**',
            '**/*.vsix',
            'docs/build', 'docs/build/**'
        ]);
    });
});

suite('CLI: renderText', () => {
    test('groups by file and summarizes', () => {
        const text = renderText([{
            id: '1', filePath: '/repo/src/a.ts',
            docRange: { start: { line: 4, character: 0 }, end: { line: 6, character: 0 } },
            codeRange: { start: { line: 7, character: 0 }, end: { line: 9, character: 0 } },
            docContent: '', docType: DocType.JSDoc, codeContent: '',
            codeSignature: { name: 'calc', type: CodeType.Function, parameters: [], modifiers: [], hash: 'h' },
            driftScore: 0.9, driftReasons: [{ type: DriftType.ParameterRemoved, severity: DriftSeverity.High, message: 'Documented parameter x not found in code' }],
            lastAnalyzed: new Date(), isReviewed: false
        }], '/repo');
        assert.match(text, /^src\/a\.ts\n/);
        assert.match(text, /5: calc \(critical, 90%\)/);
        assert.match(text, /- Documented parameter x not found in code/);
        assert.match(text, /1 issue\(s\) in 1 file\(s\): 1 critical/);
        assert.match(renderText([], '/repo'), /No documentation drift/);
    });
});

suite('CLI: end to end on the fixture workspace', () => {
    test('finds code and README drift, exits 1', () => {
        const r = runCli([FIXTURE, '--no-git', '--format', 'json', '--quiet']);
        assert.strictEqual(r.status, 1, r.stderr);
        const json = JSON.parse(r.stdout);
        assert.strictEqual(json.tool, 'drift');
        const symbols = json.issues.map((i: { symbol: string }) => i.symbol);
        assert.ok(symbols.includes('calculateTotal'), `expected calculateTotal in ${symbols}`);
        assert.ok(json.issues.some((i: { file: string }) => i.file.endsWith('README.md')), 'README block should be reported');
    });

    test('--fail-on none exits 0 and text output lists files', () => {
        const r = runCli([FIXTURE, '--no-git', '--fail-on', 'none', '--quiet']);
        assert.strictEqual(r.status, 0, r.stderr);
        assert.match(r.stdout, /lib\.ts/);
        assert.match(r.stdout, /calculateTotal/);
        assert.match(r.stdout, /issue\(s\) in/);
    });

    test('--exclude removes files and --help/--version work', () => {
        const r = runCli([FIXTURE, '--no-git', '--no-markdown', '--exclude', '**/lib.ts', '--quiet']);
        assert.strictEqual(r.status, 0, r.stderr);
        assert.match(r.stdout, /No documentation drift/);
        assert.strictEqual(runCli(['--help']).status, 0);
        assert.match(runCli(['--help']).stdout, /Usage: docs-drift/);
        assert.strictEqual(runCli(['--version']).stdout.trim(), 'dev');
        assert.strictEqual(runCli(['--nope']).status, 2);
    });
});
