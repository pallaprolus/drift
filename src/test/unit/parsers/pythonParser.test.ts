import * as assert from 'assert';
import * as vscode from 'vscode';
import { PythonParser } from '../../../parsers/pythonParser';
import { DocType } from '../../../models/types';


class MockTextDocument {
    content: string;
    uri: { fsPath: string };
    fileName: string;
    languageId: string;
    lineCount: number;

    constructor(content: string) {
        this.content = content;
        this.uri = { fsPath: '/test/file.py' };
        this.fileName = 'file.py';
        this.languageId = 'python';
        this.lineCount = content.split('\n').length;
    }

    getText(): string {
        return this.content;
    }

    positionAt(_offset: number): vscode.Position {
        return new vscode.Position(0, 0);
    }

    offsetAt(_position: vscode.Position): number {
        return 0;
    }

    validateRange(range: vscode.Range): vscode.Range {
        return range;
    }

    lineAt(_line: number | vscode.Position): vscode.TextLine {
        return {
            lineNumber: 0,
            text: '',
            range: new vscode.Range(0, 0, 0, 0),
            rangeIncludingLineBreak: new vscode.Range(0, 0, 0, 0),
            firstNonWhitespaceCharacterIndex: 0,
            isEmptyOrWhitespace: false
        } as vscode.TextLine;
    }
}

suite('PythonParser Tests', () => {
    let parser: PythonParser;

    setup(() => {
        parser = new PythonParser();
    });

    test('should identify Python files', () => {
        const _doc = {
            languageId: 'python',
            fileName: 'test.py'
        };
        // Internal check simulation if needed, or just rely on class property
        assert.strictEqual(parser.languageId, 'python');
    });

    test('should parse complex multi-line signature with unions', () => {
        const content = `
    def autocontrast(
        image: Image.Image,
        cutoff: float | tuple[float, float] = 0,
        ignore: int | Sequence[int] | None = None,
        mask: Image.Image | None = None,
        preserve_tone: bool = False,
    ) -> Image.Image:
        """
        Maximize (normalize) image contrast.

        :param image: The image to process.
        :param cutoff: Cutoff percentage.
        :param ignore: Values to ignore.
        :param mask: Mask image.
        :param preserve_tone: Preserve image tone.
        :return: An image.
        """
        pass
        `;
        const document = new MockTextDocument(content);
        return parser.parseDocCodePairs(document as any).then(pairs => {
            assert.strictEqual(pairs.length, 1);
            const pair = pairs[0];

            // Check drift reasons - should be empty if code matches docs
            assert.strictEqual(pair.driftReasons.length, 0, 'Should not have drift reasons');

            // Verify code params extraction
            const codeParams = pair.codeSignature.parameters;
            assert.strictEqual(codeParams.length, 5, 'Should find 5 parameters in code');
            assert.strictEqual(codeParams[0].name, 'image');
            assert.strictEqual(codeParams[1].name, 'cutoff');
            assert.strictEqual(codeParams[2].name, 'ignore');
            assert.strictEqual(codeParams[3].name, 'mask');
            assert.strictEqual(codeParams[4].name, 'preserve_tone');
        });
    });

    test('should parse Sphinx-style docstrings (:param name:)', () => {
        const docContent = `"""
        Resizes an image.

        :param image: The image to resize.
        :param size: The target size.
        :return: The resized image.
        """`;

        const parsed = parser.parseDocumentation(docContent, DocType.PyDoc);

        assert.strictEqual(parsed.params.length, 2, 'Should find 2 parameters');
        assert.strictEqual(parsed.params[0].name, 'image');
        assert.strictEqual(parsed.params[1].name, 'size');
        assert.strictEqual(parsed.params[0].description, 'The image to resize.');
        assert.strictEqual(parsed.params[1].description, 'The target size.');
        assert.strictEqual(parsed.returns?.description, 'The resized image.');
    });

    test('should parse NumPy-style docstrings', () => {
        const docContent = `"""
        Resizes an image.

        Parameters
        ----------
        image : Image
            The image to resize.
        size : tuple
            The target size.
        """`;

        const parsed = parser.parseDocumentation(docContent, DocType.PyDoc);

        assert.strictEqual(parsed.params.length, 2, 'Should find 2 parameters');
        assert.strictEqual(parsed.params[0].name, 'image');
        assert.strictEqual(parsed.params[0].type, 'Image');
        assert.strictEqual(parsed.params[1].name, 'size');
        assert.strictEqual(parsed.params[1].type, 'tuple');
        assert.strictEqual(parsed.params[0].description, 'The image to resize.');
        assert.strictEqual(parsed.params[1].description, 'The target size.');
    });

    test('should join multi-line NumPy parameter descriptions', () => {
        const docContent = `"""
        Resizes an image.

        Parameters
        ----------
        image : Image
            The image to resize.
            Its aspect ratio is preserved.

            Note: the original is unchanged.
        size : tuple
            The target size.
        """`;

        const parsed = parser.parseDocumentation(docContent, DocType.PyDoc);

        assert.strictEqual(parsed.params.length, 2);
        assert.strictEqual(parsed.params[0].description,
            'The image to resize. Its aspect ratio is preserved. Note: the original is unchanged.');
        assert.strictEqual(parsed.params[1].description, 'The target size.');
    });

    test('should stop NumPy parameter descriptions at a Returns section without a blank line', () => {
        const docContent = `"""
        Resizes an image.

        Parameters
        ----------
        image : Image
            The image to resize.
        Returns
        -------
        Image
            The resized image.
        """`;

        const parsed = parser.parseDocumentation(docContent, DocType.PyDoc);

        assert.strictEqual(parsed.params.length, 1);
        assert.strictEqual(parsed.params[0].description, 'The image to resize.');
        assert.strictEqual(parsed.returns?.type, 'Image');
    });

    test('should preserve NumPy parameters without descriptions before Returns', () => {
        const docContent = `Parameters
----------
x : int
Returns
-------
int`;

        const parsed = parser.parseDocumentation(docContent, DocType.PyDoc);

        assert.strictEqual(parsed.params.length, 1);
        assert.strictEqual(parsed.params[0].description, '');
        assert.strictEqual(parsed.returns?.type, 'int');
    });

    test('should parse optional NumPy types and descriptions', () => {
        const docContent = `Parameters
----------
x : int, optional
    The number of pixels.
y : int
z : str
    The output mode.`;

        const parsed = parser.parseDocumentation(docContent, DocType.PyDoc);

        assert.deepStrictEqual(parsed.params, [
            { name: 'x', type: 'int', description: 'The number of pixels.', isOptional: true },
            { name: 'y', type: 'int', description: '', isOptional: false },
            { name: 'z', type: 'str', description: 'The output mode.', isOptional: false }
        ]);
    });

    test('should stop NumPy descriptions after a blank line followed by a dedent', () => {
        const docContent = `Parameters
----------
x : int
    The number of pixels.

This is general documentation.
    This is not part of the parameter description.`;

        const parsed = parser.parseDocumentation(docContent, DocType.PyDoc);

        assert.strictEqual(parsed.params.length, 1);
        assert.strictEqual(parsed.params[0].description, 'The number of pixels.');
    });

    test('should stop NumPy descriptions at other section headers', () => {
        const docContent = `Parameters
----------
x : int
    The number of pixels.
    Notes
    -----
    mode : str
        This is not a parameter.`;

        const parsed = parser.parseDocumentation(docContent, DocType.PyDoc);

        assert.strictEqual(parsed.params.length, 1);
        assert.strictEqual(parsed.params[0].description, 'The number of pixels.');
    });

    test('should parse Google-style docstrings (Args:)', () => {
        const docContent = `"""
        Resizes an image.

        Args:
            image: The image to resize.
            size: The target size.
        """`;

        const parsed = parser.parseDocumentation(docContent, DocType.PyDoc);

        assert.strictEqual(parsed.params.length, 2, 'Should find 2 parameters');
        assert.strictEqual(parsed.params[0].name, 'image');
        assert.strictEqual(parsed.params[1].name, 'size');
        assert.strictEqual(parsed.params[0].description, 'The image to resize.');
        assert.strictEqual(parsed.params[1].description, 'The target size.');
    });
});
