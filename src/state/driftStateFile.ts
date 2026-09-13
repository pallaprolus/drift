import * as fs from 'fs';
import * as path from 'path';
import { DocCodePair, DocCodePairState, DriftState } from '../models/types';

export const STATE_VERSION = '1.0.0';
export const STATE_DIR = '.drift';
export const STATE_FILE = 'state.json';

export function stateFilePathFor(rootPath: string): string {
    return path.join(rootPath, STATE_DIR, STATE_FILE);
}

/**
 * Read `.drift/state.json` from a workspace root. Returns an empty state when the
 * file is missing and throws when it exists but cannot be parsed.
 */
export function readDriftStateFile(rootPath: string): DriftState {
    const filePath = stateFilePathFor(rootPath);
    if (!fs.existsSync(filePath)) {
        return { version: STATE_VERSION, pairs: new Map() };
    }

    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const pairs = new Map<string, DocCodePairState>(Object.entries(data.pairs || {}));
    for (const entry of pairs.values()) {
        if (entry.reviewedAt) {
            entry.reviewedAt = new Date(entry.reviewedAt);
        }
    }
    return {
        version: data.version || STATE_VERSION,
        pairs,
        lastFullScan: data.lastFullScan ? new Date(data.lastFullScan) : undefined
    };
}

/**
 * A pair counts as reviewed only while the code it was reviewed against is unchanged.
 */
export function isPairReviewed(state: DriftState, pair: DocCodePair): boolean {
    const saved = state.pairs.get(pair.id);
    return Boolean(saved && saved.isReviewed && saved.codeHash === pair.codeSignature.hash);
}
