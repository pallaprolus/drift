import * as vscode from 'vscode';
import { TextPosition, TextRange } from '../models/text';

/**
 * Parsers normally produce real vscode.Range objects inside the extension (see the
 * range factory installed in activate), but these helpers make providers safe
 * for plain ranges too, e.g. results produced by the core outside the editor.
 */
export function toVsPosition(position: TextPosition): vscode.Position {
    return position instanceof vscode.Position
        ? position
        : new vscode.Position(position.line, position.character);
}

export function toVsRange(range: TextRange): vscode.Range {
    return range instanceof vscode.Range
        ? range
        : new vscode.Range(toVsPosition(range.start), toVsPosition(range.end));
}

export function spanOf(start: TextPosition, end: TextPosition): vscode.Range {
    return new vscode.Range(toVsPosition(start), toVsPosition(end));
}

export const vscodeRangeFactory = {
    range: (startLine: number, startCharacter: number, endLine: number, endCharacter: number): vscode.Range =>
        new vscode.Range(startLine, startCharacter, endLine, endCharacter)
};
