import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main() {
    const extensionDevelopmentPath = path.resolve(__dirname, '../../../');
    const workspacePath = path.resolve(extensionDevelopmentPath, 'src/test/fixtures/workspace');
    await runTests({
        extensionDevelopmentPath,
        extensionTestsPath: path.resolve(__dirname, './index'),
        launchArgs: [workspacePath, '--disable-extensions', '--disable-workspace-trust']
    });
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
