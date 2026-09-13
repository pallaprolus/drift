export interface LogSink {
    log(message: string): void;
    error(message: string, error?: unknown): void;
}

const silentSink: LogSink = { log: () => undefined, error: () => undefined };

/**
 * Console sink used by the command-line runner (stderr, so stdout stays machine-readable)
 */
export const consoleSink: LogSink = {
    log: message => console.error(message),
    error: (message, error) => {
        console.error(message);
        if (error) {
            console.error(error instanceof Error ? error.stack || error.message : String(error));
        }
    }
};

/**
 * Logger with a pluggable sink. The extension routes it to an output channel;
 * the CLI routes it to stderr; tests leave it silent.
 */
export class DriftLogger {
    private static sink: LogSink = silentSink;

    public static setSink(sink: LogSink): void {
        this.sink = sink;
    }

    public static log(message: string): void {
        this.sink.log(`[${new Date().toISOString()}] ${message}`);
    }

    public static error(message: string, error?: unknown): void {
        this.sink.error(`[${new Date().toISOString()}] [ERROR] ${message}`, error);
    }

    public static dispose(): void {
        this.sink = silentSink;
    }
}
