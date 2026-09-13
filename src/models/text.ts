/**
 * Editor-independent text model.
 *
 * The parsers and analyzers work against these structural types so the same
 * code runs inside VS Code (where vscode.Range / vscode.TextDocument satisfy
 * them) and in the command-line runner (where plain objects do).
 */

export interface TextPosition {
    readonly line: number;
    readonly character: number;
}

export interface TextRange {
    readonly start: TextPosition;
    readonly end: TextPosition;
}

/**
 * The subset of vscode.TextDocument the parsers rely on.
 */
export interface SourceDocument {
    readonly uri: { readonly fsPath: string };
    readonly languageId: string;
    getText(): string;
}

/**
 * Builds ranges. The extension installs a factory that produces real
 * vscode.Range instances so providers can hand them straight to the editor API.
 */
export interface RangeFactory {
    range(startLine: number, startCharacter: number, endLine: number, endCharacter: number): TextRange;
}

export const plainRangeFactory: RangeFactory = {
    range: (startLine, startCharacter, endLine, endCharacter) => ({
        start: { line: startLine, character: startCharacter },
        end: { line: endLine, character: endCharacter }
    })
};

export function createSourceDocument(fsPath: string, languageId: string, text: string): SourceDocument {
    return {
        uri: { fsPath },
        languageId,
        getText: () => text
    };
}

export function rangeContainsLine(range: TextRange, line: number): boolean {
    return line >= range.start.line && line <= range.end.line;
}
