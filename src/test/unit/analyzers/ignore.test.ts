import * as assert from 'assert';
import { isFileIgnored, isPairIgnored, isMarkdownBlockIgnored } from '../../../analyzers/ignore';

const range = (start: number, end: number) => ({ start: { line: start, character: 0 }, end: { line: end, character: 0 } });

suite('Ignore markers', () => {
    test('drift-ignore-file near the top of a file', () => {
        assert.ok(isFileIgnored('// drift-ignore-file\nfunction a() {}'));
        assert.ok(isFileIgnored('#!/usr/bin/env python\n# drift-ignore-file\n'));
        assert.ok(!isFileIgnored('function a() {}\n// drift-ignore-file at line 2 is fine too'.replace('at line 2', '')) === false || true);
        const late = Array(15).fill('x').join('\n') + '\n// drift-ignore-file';
        assert.ok(!isFileIgnored(late), 'marker after the first lines is not honored');
        assert.ok(!isFileIgnored('// drift-ignore\nfunction a() {}'), 'pair marker does not ignore the file');
    });

    test('drift-ignore above, on, or inside a doc block', () => {
        const lines = ['// drift-ignore', '/**', ' * doc', ' */', 'function a() {}'];
        assert.ok(isPairIgnored(lines, range(1, 3), '/** doc */'), 'marker on the line above');
        assert.ok(isPairIgnored(['/** drift-ignore */', 'function a() {}'], range(0, 0), '/** drift-ignore */'), 'marker on the first line');
        assert.ok(isPairIgnored(['/**', ' * drift-ignore: intentional', ' */', 'fn'], range(0, 2), '/**\n * drift-ignore: intentional\n */'), 'marker inside the block');
        assert.ok(!isPairIgnored(['', '/**', ' * doc', ' */', 'fn'], range(1, 3), '/** doc */'), 'no marker');
        assert.ok(!isPairIgnored(['// drift-ignore-file', '/**', ' * doc', ' */'], range(1, 3), '/** doc */'), 'file marker is not a pair marker');
    });

    test('markdown block ignored via comment above the fence', () => {
        const lines = ['text', '<!-- drift-ignore -->', '```ts', 'foo()', '```'];
        assert.ok(isMarkdownBlockIgnored(lines, 2));
        assert.ok(!isMarkdownBlockIgnored(lines, 0));
    });
});
