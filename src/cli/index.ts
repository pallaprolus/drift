/**
 * docs-drift: command-line documentation drift checker.
 *
 * Runs the same parsers and analyzers as the VS Code extension without the
 * editor, for CI pipelines and pre-commit hooks.
 */
import * as fs from 'fs';
import * as path from 'path';
import { minimatch } from 'minimatch';
import { ParserRegistry } from '../parsers/parserRegistry';
import { DriftAnalyzer } from '../analyzers/driftAnalyzer';
import { SymbolIndex } from '../analyzers/symbolIndex';
import { analyzeMarkdown } from '../analyzers/readmeAnalyzer';
import { GitTracker } from '../integrations/gitIntegration';
import { generateReport, ReportFormat, selectReportPairs, severityFromScore, summarize } from '../reports/reportGenerator';
import { CodeType, DocCodePair, DocType, DriftSeverity } from '../models/types';
import { createSourceDocument } from '../models/text';
import { hashContent } from '../utils/helpers';
import { DriftLogger, consoleSink } from '../utils/logger';
import { isPairReviewed, readDriftStateFile } from '../state/driftStateFile';

// Injected by esbuild from package.json; 'dev' when running the tsc output directly
declare const __DRIFT_VERSION__: string | undefined;
const VERSION = typeof __DRIFT_VERSION__ !== 'undefined' ? __DRIFT_VERSION__ : 'dev';

export interface CliOptions {
    paths: string[];
    format: ReportFormat | 'text';
    output?: string;
    threshold: number;
    failOn: DriftSeverity | 'none';
    git: boolean;
    gitignore: boolean;
    markdown: boolean;
    exclude: string[];
    markdownPatterns: string[];
    staleDays: number;
    quiet: boolean;
    help: boolean;
    version: boolean;
}

const DEFAULT_EXCLUDES = ['**/node_modules/**', '**/dist/**', '**/build/**', '**/out/**', '**/.git/**', '**/.vscode-test/**', '**/vendor/**', '**/target/**', '**/.venv/**', '**/__pycache__/**'];
const DEFAULT_MARKDOWN = ['**/README.md', '**/docs/**/*.md'];
const SEVERITY_RANK: Record<DriftSeverity, number> = {
    [DriftSeverity.Low]: 0,
    [DriftSeverity.Medium]: 1,
    [DriftSeverity.High]: 2,
    [DriftSeverity.Critical]: 3
};

export const HELP = `docs-drift - find documentation that drifted out of sync with the code

Usage: docs-drift [paths...] [options]

Options:
  -f, --format <fmt>      text (default), markdown, html, json
  -o, --output <file>     write the report to a file instead of stdout
  -t, --threshold <0-1>   minimum drift score to report (default 0.3)
      --fail-on <level>   exit 1 when an issue at or above this severity is found:
                          low (default), medium, high, critical, none
      --exclude <glob>    extra glob to skip (repeatable)
      --no-git            skip git blame / working-tree analysis
      --no-gitignore      do not skip paths listed in the root .gitignore
      --no-markdown       skip README and docs code blocks
      --markdown <glob>   Markdown files to check (repeatable; default README.md and docs/**/*.md)
      --stale-days <n>    flag code committed this many days after its docs (default 30)
  -q, --quiet             no progress output on stderr
  -v, --version           print the version
  -h, --help              show this help

Reviewed items in .drift/state.json (written by the VS Code extension) are honored.
Add "drift-ignore" above a doc block, or "drift-ignore-file" near the top of a file, to opt out.
`;

export function parseArgs(argv: string[]): CliOptions {
    const options: CliOptions = {
        paths: [],
        format: 'text',
        threshold: 0.3,
        failOn: DriftSeverity.Low,
        git: true,
        gitignore: true,
        markdown: true,
        exclude: [],
        markdownPatterns: [],
        staleDays: 30,
        quiet: false,
        help: false,
        version: false
    };

    const takeValue = (i: number, flag: string): string => {
        const value = argv[i + 1];
        if (value === undefined || value.startsWith('-')) {
            throw new Error(`${flag} requires a value`);
        }
        return value;
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        switch (arg) {
            case '-f': case '--format': {
                const value = takeValue(i++, arg);
                if (!['text', 'markdown', 'html', 'json'].includes(value)) {
                    throw new Error(`Unknown format "${value}"`);
                }
                options.format = value as CliOptions['format'];
                break;
            }
            case '-o': case '--output': options.output = takeValue(i++, arg); break;
            case '-t': case '--threshold': {
                const value = Number(takeValue(i++, arg));
                if (Number.isNaN(value) || value < 0 || value > 1) {
                    throw new Error('--threshold must be a number between 0 and 1');
                }
                options.threshold = value;
                break;
            }
            case '--fail-on': {
                const value = takeValue(i++, arg).toLowerCase();
                if (!['low', 'medium', 'high', 'critical', 'none'].includes(value)) {
                    throw new Error(`--fail-on must be low, medium, high, critical or none`);
                }
                options.failOn = value as CliOptions['failOn'];
                break;
            }
            case '--exclude': options.exclude.push(takeValue(i++, arg)); break;
            case '--markdown': options.markdownPatterns.push(takeValue(i++, arg)); break;
            case '--no-git': options.git = false; break;
            case '--no-gitignore': options.gitignore = false; break;
            case '--no-markdown': options.markdown = false; break;
            case '--stale-days': {
                const value = Number(takeValue(i++, arg));
                if (Number.isNaN(value) || value < 0) {
                    throw new Error('--stale-days must be a non-negative number');
                }
                options.staleDays = value;
                break;
            }
            case '-q': case '--quiet': options.quiet = true; break;
            case '-v': case '--version': options.version = true; break;
            case '-h': case '--help': options.help = true; break;
            default:
                if (arg.startsWith('-')) {
                    throw new Error(`Unknown option "${arg}"`);
                }
                options.paths.push(arg);
        }
    }

    if (options.paths.length === 0) {
        options.paths = ['.'];
    }
    return options;
}

/**
 * Convert the simple, common subset of .gitignore syntax into glob patterns.
 * Negations and character classes are ignored; anything unusual is skipped.
 */
export function gitignoreToGlobs(content: string): string[] {
    const globs: string[] = [];
    for (const raw of content.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || line.startsWith('#') || line.startsWith('!')) {
            continue;
        }
        const anchored = line.startsWith('/');
        const dirOnly = line.endsWith('/');
        let body = line.replace(/^\//, '').replace(/\/$/, '');
        if (!body) {
            continue;
        }
        body = body.replace(/\\ /g, ' ');
        const prefix = anchored || body.includes('/') ? '' : '**/';
        globs.push(`${prefix}${body}`);
        if (dirOnly || !body.includes('*')) {
            globs.push(`${prefix}${body}/**`);
        }
    }
    return globs;
}

function isExcluded(relPath: string, patterns: string[]): boolean {
    const normalized = relPath.split(path.sep).join('/');
    return patterns.some(p => minimatch(normalized, p, { dot: true, matchBase: false }));
}

function walk(root: string, dir: string, excludes: string[], out: string[]): void {
    let entries: fs.Dirent[];
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return;
    }
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        const rel = path.relative(root, full);
        if (isExcluded(rel + (entry.isDirectory() ? '/' : ''), excludes) || isExcluded(rel, excludes)) {
            continue;
        }
        if (entry.isDirectory()) {
            walk(root, full, excludes, out);
        } else if (entry.isFile()) {
            out.push(full);
        }
    }
}

export interface RunResult {
    pairs: DocCodePair[];
    filesScanned: number;
    report: string;
    failed: boolean;
}

export async function run(options: CliOptions, cwd: string = process.cwd()): Promise<RunResult> {
    if (!options.quiet) {
        DriftLogger.setSink(consoleSink);
    }

    const root = path.resolve(cwd, options.paths[0]);
    const rootDir = fs.statSync(root).isDirectory() ? root : path.dirname(root);
    const excludes = [...DEFAULT_EXCLUDES, ...options.exclude];

    if (options.gitignore) {
        const gitignorePath = path.join(rootDir, '.gitignore');
        if (fs.existsSync(gitignorePath)) {
            excludes.push(...gitignoreToGlobs(fs.readFileSync(gitignorePath, 'utf8')));
        }
    }

    // Collect files
    const files: string[] = [];
    for (const p of options.paths) {
        const abs = path.resolve(cwd, p);
        if (!fs.existsSync(abs)) {
            throw new Error(`Path not found: ${p}`);
        }
        if (fs.statSync(abs).isDirectory()) {
            walk(abs, abs, excludes, files);
        } else {
            files.push(abs);
        }
    }

    const registry = ParserRegistry.getInstance();
    const analyzer = new DriftAnalyzer();
    const index = new SymbolIndex();
    const git = options.git ? new GitTracker() : null;

    let state = { version: '', pairs: new Map() };
    try {
        state = readDriftStateFile(rootDir);
    } catch (error) {
        DriftLogger.error('Could not read .drift/state.json, ignoring reviewed items', error);
    }

    const codeFiles = files.filter(f => registry.getLanguageIdForPath(f));
    const mdPatterns = options.markdownPatterns.length > 0 ? options.markdownPatterns : DEFAULT_MARKDOWN;
    const markdownFiles = options.markdown
        ? files.filter(f => f.toLowerCase().endsWith('.md') && mdPatterns.some(p => minimatch(path.relative(rootDir, f).split(path.sep).join('/'), p, { dot: true, matchBase: true })))
        : [];

    const results: DocCodePair[] = [];
    let processed = 0;

    for (const file of codeFiles) {
        processed++;
        if (!options.quiet && processed % 50 === 0) {
            process.stderr.write(`  scanned ${processed}/${codeFiles.length} files\r`);
        }
        let text: string;
        try {
            text = fs.readFileSync(file, 'utf8');
        } catch (error) {
            DriftLogger.error(`Cannot read ${file}`, error);
            continue;
        }
        const languageId = registry.getLanguageIdForPath(file)!;
        const document = createSourceDocument(file, languageId, text);
        const parser = registry.getParser(document);
        if (!parser) {
            continue;
        }

        const pairs = await registry.parseDocument(document);
        let analyzed = pairs.map(pair => {
            const a = analyzer.analyzePair(pair, parser);
            return isPairReviewed(state, a) ? { ...a, isReviewed: true } : a;
        });

        if (git && analyzed.length > 0) {
            const key = hashContent(text);
            const gitResults = await Promise.all(analyzed.map(pair => git.analyzePair(pair, key, options.staleDays).catch(() => null)));
            analyzed = analyzed.map((pair, i) => {
                const r = gitResults[i];
                if (!r || r.reasons.length === 0) {
                    return pair;
                }
                const reasons = [...pair.driftReasons, ...r.reasons];
                return { ...pair, driftReasons: reasons, driftScore: analyzer.calculateDriftScore(reasons) };
            });
        }

        index.updateFile(file, analyzed);
        results.push(...analyzed);
    }

    for (const file of markdownFiles) {
        let text: string;
        try {
            text = fs.readFileSync(file, 'utf8');
        } catch {
            continue;
        }
        const lines = text.split(/\r?\n/);
        for (const analysis of analyzeMarkdown(text, index)) {
            if (analysis.reasons.length === 0) {
                continue;
            }
            const { block } = analysis;
            const primary = analysis.matched[0];
            const name = analysis.primarySymbol ?? primary?.name ?? `code block (${block.language})`;
            const range = { start: { line: block.startLine, character: 0 }, end: { line: block.endLine, character: (lines[block.endLine] ?? '').length } };
            results.push({
                id: `${hashContent(file)}-md-${block.startLine}`,
                filePath: file,
                docRange: range,
                docContent: block.content,
                docType: DocType.ReadmeCodeBlock,
                codeRange: range,
                codeContent: primary ? `${primary.filePath}:${primary.line + 1}` : '',
                codeSignature: primary ? { ...primary.signature, name } : { name, type: CodeType.Function, parameters: [], modifiers: [], hash: hashContent(block.content) },
                driftScore: analyzer.calculateDriftScore(analysis.reasons),
                driftReasons: analysis.reasons,
                lastAnalyzed: new Date(),
                isReviewed: false
            });
        }
    }

    if (!options.quiet) {
        process.stderr.write(`Scanned ${codeFiles.length} code file(s) and ${markdownFiles.length} Markdown file(s)\n`);
    }

    const reportOptions = { workspaceName: path.basename(rootDir), workspaceRoot: rootDir, threshold: options.threshold, includeReviewed: false };
    const flagged = selectReportPairs(results, reportOptions);
    const failed = options.failOn !== 'none' && flagged.some(p => SEVERITY_RANK[severityFromScore(p.driftScore)] >= SEVERITY_RANK[options.failOn as DriftSeverity]);

    const report = options.format === 'text'
        ? renderText(flagged, rootDir)
        : generateReport(options.format, results, reportOptions);

    return { pairs: results, filesScanned: codeFiles.length + markdownFiles.length, report, failed };
}

export function renderText(flagged: DocCodePair[], root: string): string {
    if (flagged.length === 0) {
        return 'No documentation drift detected.\n';
    }
    const lines: string[] = [];
    const byFile = new Map<string, DocCodePair[]>();
    for (const pair of flagged) {
        const list = byFile.get(pair.filePath) ?? [];
        list.push(pair);
        byFile.set(pair.filePath, list);
    }
    const icon: Record<DriftSeverity, string> = { critical: '!!', high: '! ', medium: '? ', low: '. ' } as Record<DriftSeverity, string>;
    for (const [file, pairs] of byFile) {
        lines.push(path.relative(root, file) || file);
        for (const pair of pairs) {
            const severity = severityFromScore(pair.driftScore);
            lines.push(`  ${icon[severity]} ${pair.docRange.start.line + 1}: ${pair.codeSignature.name} (${severity}, ${Math.round(pair.driftScore * 100)}%)`);
            for (const reason of pair.driftReasons) {
                lines.push(`       - ${reason.message}`);
            }
        }
        lines.push('');
    }
    const s = summarize(flagged);
    lines.push(`${s.total} issue(s) in ${s.files} file(s): ${s.critical} critical, ${s.high} high, ${s.medium} medium, ${s.low} low`);
    return lines.join('\n') + '\n';
}

async function main(): Promise<void> {
    let options: CliOptions;
    try {
        options = parseArgs(process.argv.slice(2));
    } catch (error) {
        console.error(`docs-drift: ${error instanceof Error ? error.message : String(error)}\n`);
        console.error(HELP);
        process.exit(2);
    }

    if (options.help) {
        process.stdout.write(HELP);
        return;
    }
    if (options.version) {
        process.stdout.write(`${VERSION}\n`);
        return;
    }

    try {
        const result = await run(options);
        if (options.output) {
            fs.mkdirSync(path.dirname(path.resolve(options.output)), { recursive: true });
            fs.writeFileSync(options.output, result.report, 'utf8');
            if (!options.quiet) {
                process.stderr.write(`Report written to ${options.output}\n`);
            }
        } else {
            process.stdout.write(result.report);
        }
        process.exit(result.failed ? 1 : 0);
    } catch (error) {
        console.error(`docs-drift: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(2);
    }
}

if (require.main === module) {
    main();
}
