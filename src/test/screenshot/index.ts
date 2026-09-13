/**
 * Not a test: drives VS Code into a state worth photographing for the README.
 * Launched by runScreenshot.ts against the fixture workspace; holds the window
 * open for DRIFT_SCREENSHOT_HOLD_MS (default 120s) so a screenshot can be taken.
 */
import * as vscode from 'vscode';
import * as path from 'path';

export async function run(): Promise<void> {
    const ext = vscode.extensions.getExtension('pallaprolus.drift');
    if (!ext) {
        throw new Error('Drift extension not found');
    }
    await ext.activate();

    const root = vscode.workspace.workspaceFolders![0].uri.fsPath;
    const libUri = vscode.Uri.file(path.join(root, 'src', 'lib.ts'));
    const doc = await vscode.workspace.openTextDocument(libUri);
    const editor = await vscode.window.showTextDocument(doc, { preview: false });

    await vscode.commands.executeCommand('workbench.action.closeAuxiliaryBar');
    await vscode.commands.executeCommand('workbench.action.closePanel');
    await vscode.commands.executeCommand('drift.scanWorkspace');
    // The scan opens the dashboard asynchronously; let that settle before taking focus back
    await new Promise(r => setTimeout(r, 3000));
    await vscode.commands.executeCommand('workbench.action.closeAuxiliaryBar');
    await vscode.commands.executeCommand('workbench.action.focusFirstEditorGroup');

    // Put the cursor on the stale @param line and open the hover
    const line = doc.getText().split('\n').findIndex(l => l.includes('@param taxRate'));
    const pos = new vscode.Position(Math.max(line, 0), 12);
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
    await new Promise(r => setTimeout(r, 1500));
    await vscode.commands.executeCommand('editor.action.showHover');
    // Re-show once more in case a late focus change dismissed it
    await new Promise(r => setTimeout(r, 2500));
    await vscode.commands.executeCommand('workbench.action.focusFirstEditorGroup');
    await vscode.commands.executeCommand('editor.action.showHover');

    const hold = Number(process.env.DRIFT_SCREENSHOT_HOLD_MS || 120000);
    console.log(`[screenshot] ready; holding for ${hold}ms`);
    await new Promise(r => setTimeout(r, hold));
}
