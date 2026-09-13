#!/usr/bin/env node
/**
 * Publish the command-line runner to npm as `drift-docs`.
 *
 * The repository's package.json is the VS Code extension manifest (name "drift").
 * This script assembles a minimal npm package in a temp directory with the built
 * CLI bundle and publishes it. Requires `npm run build:cli` to have run.
 *
 *   node scripts/publish-npm.js            # publish
 *   node scripts/publish-npm.js --dry-run  # pack only, print contents
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const cli = path.join(root, 'dist', 'cli.js');
if (!fs.existsSync(cli)) {
    console.error('dist/cli.js is missing; run `npm run build:cli` first');
    process.exit(1);
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-docs-'));
fs.mkdirSync(path.join(dir, 'dist'));
fs.copyFileSync(cli, path.join(dir, 'dist', 'cli.js'));
for (const file of ['README.md', 'LICENSE', 'CHANGELOG.md']) {
    fs.copyFileSync(path.join(root, file), path.join(dir, file));
}

fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    name: 'drift-docs',
    version: manifest.version,
    description: 'Find documentation that drifted out of sync with the code: JSDoc, docstrings, README code blocks, Git history. CLI and CI companion to the Drift VS Code extension.',
    keywords: ['documentation', 'docs', 'lint', 'drift', 'jsdoc', 'docstring', 'readme', 'ci', 'cli'],
    license: manifest.license,
    author: 'Sudhakar Pallaprolu',
    homepage: manifest.homepage,
    repository: manifest.repository,
    bugs: manifest.bugs,
    bin: { 'drift-docs': 'dist/cli.js', 'drift-check': 'dist/cli.js' },
    files: ['dist/cli.js', 'CHANGELOG.md'],
    engines: { node: '>=18' },
    publishConfig: { access: 'public' }
}, null, 2) + '\n');

const dryRun = process.argv.includes('--dry-run');
// Provenance needs the OIDC token that only GitHub Actions provides
const provenance = process.env.GITHUB_ACTIONS ? ' --provenance' : '';
const cmd = dryRun ? 'npm pack --dry-run' : `npm publish${provenance} --access public`;
console.log(`${dryRun ? 'Packing' : 'Publishing'} drift-docs@${manifest.version} from ${dir}`);
execSync(cmd, { cwd: dir, stdio: 'inherit', env: { ...process.env } });
