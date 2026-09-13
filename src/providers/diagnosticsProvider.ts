import * as vscode from 'vscode';
import { DocCodePair, DriftSeverity } from '../models/types';
import { toVsRange } from './vscodeRanges';

/**
 * Publishes drift findings to the Problems panel.
 */
export class DiagnosticsProvider {
    private readonly collection: vscode.DiagnosticCollection;
    private enabled = true;
    private threshold = 0.3;

    constructor() {
        this.collection = vscode.languages.createDiagnosticCollection('drift');
    }

    configure(options: { enabled: boolean; threshold: number }): void {
        this.enabled = options.enabled;
        this.threshold = options.threshold;
        if (!this.enabled) {
            this.collection.clear();
        }
    }

    /**
     * Replace the diagnostics for one file with the given scan results.
     */
    update(filePath: string, pairs: DocCodePair[]): void {
        if (!this.enabled) {
            return;
        }
        const uri = vscode.Uri.file(filePath);
        const diagnostics = pairs
            .filter(pair => !pair.isReviewed && pair.driftScore >= this.threshold && pair.driftReasons.length > 0)
            .map(pair => this.toDiagnostic(uri, pair));
        this.collection.set(uri, diagnostics);
    }

    clear(filePath: string): void {
        this.collection.delete(vscode.Uri.file(filePath));
    }

    clearAll(): void {
        this.collection.clear();
    }

    dispose(): void {
        this.collection.dispose();
    }

    private toDiagnostic(uri: vscode.Uri, pair: DocCodePair): vscode.Diagnostic {
        const docRange = toVsRange(pair.docRange);
        // Anchor on the first line of the doc block so the squiggle stays compact
        const firstLine = new vscode.Range(docRange.start.line, docRange.start.character, docRange.start.line, Number.MAX_SAFE_INTEGER);

        const summary = pair.driftReasons.map(r => r.message).join('; ');
        const diagnostic = new vscode.Diagnostic(
            firstLine,
            `Documentation drift (${Math.round(pair.driftScore * 100)}%): ${summary}`,
            this.toVsSeverity(pair.driftScore)
        );
        diagnostic.source = 'drift';
        diagnostic.code = pair.driftReasons[0].type;

        const codeRange = toVsRange(pair.codeRange);
        if (codeRange.start.line !== docRange.start.line) {
            diagnostic.relatedInformation = [
                new vscode.DiagnosticRelatedInformation(
                    new vscode.Location(uri, new vscode.Range(codeRange.start.line, 0, codeRange.start.line, Number.MAX_SAFE_INTEGER)),
                    `Code for '${pair.codeSignature.name}'`
                )
            ];
        }
        return diagnostic;
    }

    private toVsSeverity(score: number): vscode.DiagnosticSeverity {
        if (score >= 0.6) {
            return vscode.DiagnosticSeverity.Warning;
        }
        if (score >= 0.4) {
            return vscode.DiagnosticSeverity.Information;
        }
        return vscode.DiagnosticSeverity.Hint;
    }
}

export function severityLabel(score: number): DriftSeverity {
    if (score >= 0.8) {
        return DriftSeverity.Critical;
    }
    if (score >= 0.6) {
        return DriftSeverity.High;
    }
    if (score >= 0.4) {
        return DriftSeverity.Medium;
    }
    return DriftSeverity.Low;
}
