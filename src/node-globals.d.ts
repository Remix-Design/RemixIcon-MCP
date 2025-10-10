type Buffer = Uint8Array;

interface ReadableStreamLike {
        on(event: 'data', listener: (chunk: Buffer) => void): void;
}

interface WritableStreamLike {
        write(buffer: string | Uint8Array): void;
}

declare module 'node:process' {
        export const stdin: ReadableStreamLike;
        export const stdout: WritableStreamLike;
        export const stderr: WritableStreamLike;
}

declare module 'node:util' {
        export class TextDecoder {
                constructor(encoding?: string, options?: { fatal?: boolean; ignoreBOM?: boolean });
                decode(input?: ArrayBufferView): string;
        }
}

declare const Buffer: {
        byteLength(input: string, encoding?: BufferEncoding): number;
};

type BufferEncoding =
        | 'ascii'
        | 'utf8'
        | 'utf-8'
        | 'utf16le'
        | 'ucs2'
        | 'ucs-2'
        | 'base64'
        | 'base64url'
        | 'latin1'
        | 'binary'
        | 'hex';
