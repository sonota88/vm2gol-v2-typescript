/*
Deno: 標準入力を読んで行ごとに処理 - memo88
https://memo88.hatenablog.com/entry/2020/07/18/154534
*/

const textDecoder = new TextDecoder();
const LF = "\n".charCodeAt(0);

class ByteBuffer {
  bytes: number[];

  constructor() {
    this.bytes = [];
  }

  push(val: number) {
    this.bytes.push(val);
  }

  toLine() {
    return textDecoder.decode(
      new Uint8Array(this.bytes),
    );
  }
}

export class FileReader {
  buf: ByteBuffer;
  path: string;
  file: Deno.File | null;

  constructor(path: string) {
    this.buf = new ByteBuffer();
    this.path = path;
    this.file = null;
  }

  async read(
    fn: (line: string) => void,
  ) {
    if (this.file == null) {
      this.file = await Deno.open(this.path);
    }

    const readBuf = new Uint8Array(1024);

    const numRead = await this.file.read(readBuf);
    if (numRead === null) {
      return null;
    }

    for (let i = 0; i < numRead; i++) {
      const val = readBuf[i];
      this.buf.push(val);

      if (val === LF) {
        fn(this.buf.toLine());
        this.buf = new ByteBuffer();
      }
    }

    return numRead;
  }

  async eachLine(fn: (line: string) => void) {
    while (true) {
      const numRead = await this.read(fn);

      if (numRead === null) {
        fn(this.buf.toLine());
        break;
      }
    }

    return null;
  }

  async _readAll() {
    const lines: string[] = [];
    await this.eachLine((line: string) =>{
      lines.push(line);
    });

    return lines.join("");
  }

  static async readAll(path: string): Promise<string> {
    const fr = new FileReader(path);
    try {
      return await fr._readAll();
    } finally {
      fr.close();
    }
  }

  static async _with(path: string, fn: (fr: FileReader)=>void) {
    const _fr = new FileReader(path);
    try {
      fn(_fr);
    } finally {
      _fr.close();
    }
  }

  close() {
    if (this.file != null) {
      Deno.close(this.file.rid);
    }
  }
}
