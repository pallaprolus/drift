const esbuild = require("esbuild");

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');
const cliOnly = process.argv.includes('--cli');

const extensionOptions = {
    entryPoints: ["src/extension.ts"],
    bundle: true,
    format: "cjs",
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: "node",
    outfile: "out/extension.js",
    external: ["vscode"],
    logLevel: "silent",
};

// The command-line runner must not depend on the 'vscode' module at all.
const cliOptions = {
    entryPoints: ["src/cli/index.ts"],
    bundle: true,
    format: "cjs",
    minify: false,
    sourcemap: false,
    platform: "node",
    target: "node18",
    outfile: "dist/cli.js",
    banner: { js: "#!/usr/bin/env node" },
    define: { __DRIFT_VERSION__: JSON.stringify(require("./package.json").version) },
    logLevel: "silent",
};

async function main() {
    if (cliOnly) {
        await esbuild.build(cliOptions);
        require("fs").chmodSync(cliOptions.outfile, 0o755);
        return;
    }

    const ctx = await esbuild.context(extensionOptions);
    if (watch) {
        await ctx.watch();
    } else {
        await ctx.rebuild();
        await ctx.dispose();
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
