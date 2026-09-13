import { TextRange } from '../models/text';

const PAIR_MARKER = /\bdrift-ignore\b(?!-file)/;
const FILE_MARKER = /\bdrift-ignore-file\b/;
const FILE_MARKER_SCAN_LINES = 10;

/**
 * A file opts out entirely with `drift-ignore-file` in its first few lines.
 */
export function isFileIgnored(text: string): boolean {
    return text.split('\n', FILE_MARKER_SCAN_LINES).some(line => FILE_MARKER.test(line));
}

/**
 * A doc-code pair opts out with `drift-ignore` on the line directly above the
 * documentation block, on its first line, or anywhere inside it.
 */
export function isPairIgnored(lines: string[], docRange: TextRange, docContent: string): boolean {
    const above = docRange.start.line > 0 ? lines[docRange.start.line - 1] ?? '' : '';
    if (PAIR_MARKER.test(above)) {
        return true;
    }
    if (PAIR_MARKER.test(lines[docRange.start.line] ?? '')) {
        return true;
    }
    return PAIR_MARKER.test(docContent);
}

/**
 * Markdown code blocks opt out with `<!-- drift-ignore -->` on the line above the fence.
 */
export function isMarkdownBlockIgnored(lines: string[], fenceLine: number): boolean {
    const above = fenceLine > 0 ? lines[fenceLine - 1] ?? '' : '';
    return PAIR_MARKER.test(above);
}
