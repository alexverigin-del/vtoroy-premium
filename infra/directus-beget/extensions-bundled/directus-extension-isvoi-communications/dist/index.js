import { createRequire } from "node:module"; const require = createRequire(import.meta.url);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __commonJS = (cb, mod) => function __require2() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// packages/communications/src/policy.ts
import { createHash, timingSafeEqual } from "node:crypto";
function identifier(value) {
  if (typeof value !== "string" && typeof value !== "number" || typeof value === "number" && !Number.isSafeInteger(value))
    return fail("INVALID_EXTERNAL_ID");
  const id = String(value);
  if (!/^-?[0-9A-Za-z_.:-]{1,180}$/.test(id)) return fail("INVALID_EXTERNAL_ID");
  return id;
}
function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}
function verifySecret(actual, expected) {
  if (typeof actual !== "string" || typeof expected !== "string" || !expected || expected.length < 16)
    return false;
  return timingSafeEqual(Buffer.from(digest(actual)), Buffer.from(digest(expected)));
}
function validText(value, limit = 3500) {
  if (typeof value !== "string" || value.length > limit || value.includes("\0"))
    return fail("INVALID_TEXT");
  return value.trim();
}
function nextHandling(current, next) {
  const edges = {
    bot: ["queued", "agent", "closed"],
    queued: ["agent", "closed"],
    agent: ["queued", "waiting", "closed"],
    waiting: ["queued", "agent", "closed"],
    closed: []
  };
  if (next === current) return current;
  if (!edges[current]?.includes(next)) return fail("INVALID_HANDLING_TRANSITION", 409);
  return next;
}
function marketingWindow(now) {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Moscow",
      hour: "2-digit",
      hourCycle: "h23"
    }).format(now)
  );
  if (hour >= 10 && hour < 20) return { allowed: true, next: now };
  const next = new Date(now);
  next.setUTCHours(7, 0, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return { allowed: false, next };
}
var MAX_FILE_BYTES, UUID, CommunicationError, fail, flag, digest;
var init_policy = __esm({
  "packages/communications/src/policy.ts"() {
    "use strict";
    MAX_FILE_BYTES = 2e7;
    UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    CommunicationError = class extends Error {
      constructor(code, status = 400) {
        super(code);
        this.code = code;
        this.status = status;
      }
      code;
      status;
    };
    fail = (code, status = 400) => {
      throw new CommunicationError(code, status);
    };
    flag = (value) => value === true || value === "true";
    digest = (value) => createHash("sha256").update(value).digest("hex");
  }
});

// node_modules/strtok3/lib/stream/Errors.js
var defaultMessages, EndOfStreamError, AbortError;
var init_Errors = __esm({
  "node_modules/strtok3/lib/stream/Errors.js"() {
    defaultMessages = "End-Of-Stream";
    EndOfStreamError = class extends Error {
      constructor() {
        super(defaultMessages);
        this.name = "EndOfStreamError";
      }
    };
    AbortError = class extends Error {
      constructor(message = "The operation was aborted") {
        super(message);
        this.name = "AbortError";
      }
    };
  }
});

// node_modules/strtok3/lib/stream/Deferred.js
var init_Deferred = __esm({
  "node_modules/strtok3/lib/stream/Deferred.js"() {
  }
});

// node_modules/strtok3/lib/stream/AbstractStreamReader.js
var AbstractStreamReader;
var init_AbstractStreamReader = __esm({
  "node_modules/strtok3/lib/stream/AbstractStreamReader.js"() {
    init_Errors();
    AbstractStreamReader = class {
      constructor() {
        this.endOfStream = false;
        this.interrupted = false;
        this.peekQueue = [];
      }
      async peek(uint8Array, mayBeLess = false) {
        const bytesRead = await this.read(uint8Array, mayBeLess);
        this.peekQueue.push(uint8Array.subarray(0, bytesRead));
        return bytesRead;
      }
      async read(buffer, mayBeLess = false) {
        if (buffer.length === 0) {
          return 0;
        }
        let bytesRead = this.readFromPeekBuffer(buffer);
        if (!this.endOfStream) {
          bytesRead += await this.readRemainderFromStream(buffer.subarray(bytesRead), mayBeLess);
        }
        if (bytesRead === 0 && !mayBeLess) {
          throw new EndOfStreamError();
        }
        return bytesRead;
      }
      /**
       * Read chunk from stream
       * @param buffer - Target Uint8Array (or Buffer) to store data read from stream in
       * @returns Number of bytes read
       */
      readFromPeekBuffer(buffer) {
        let remaining = buffer.length;
        let bytesRead = 0;
        while (this.peekQueue.length > 0 && remaining > 0) {
          const peekData = this.peekQueue.pop();
          if (!peekData)
            throw new Error("peekData should be defined");
          const lenCopy = Math.min(peekData.length, remaining);
          buffer.set(peekData.subarray(0, lenCopy), bytesRead);
          bytesRead += lenCopy;
          remaining -= lenCopy;
          if (lenCopy < peekData.length) {
            this.peekQueue.push(peekData.subarray(lenCopy));
          }
        }
        return bytesRead;
      }
      async readRemainderFromStream(buffer, mayBeLess) {
        let bytesRead = 0;
        while (bytesRead < buffer.length && !this.endOfStream) {
          if (this.interrupted) {
            throw new AbortError();
          }
          const chunkLen = await this.readFromStream(buffer.subarray(bytesRead), mayBeLess);
          if (chunkLen === 0)
            break;
          bytesRead += chunkLen;
        }
        if (!mayBeLess && bytesRead < buffer.length) {
          throw new EndOfStreamError();
        }
        return bytesRead;
      }
    };
  }
});

// node_modules/strtok3/lib/stream/StreamReader.js
var init_StreamReader = __esm({
  "node_modules/strtok3/lib/stream/StreamReader.js"() {
    init_Errors();
    init_Deferred();
    init_AbstractStreamReader();
  }
});

// node_modules/strtok3/lib/stream/WebStreamReader.js
var WebStreamReader;
var init_WebStreamReader = __esm({
  "node_modules/strtok3/lib/stream/WebStreamReader.js"() {
    init_AbstractStreamReader();
    WebStreamReader = class extends AbstractStreamReader {
      constructor(reader) {
        super();
        this.reader = reader;
      }
      async abort() {
        return this.close();
      }
      async close() {
        this.reader.releaseLock();
      }
    };
  }
});

// node_modules/strtok3/lib/stream/WebStreamByobReader.js
var WebStreamByobReader;
var init_WebStreamByobReader = __esm({
  "node_modules/strtok3/lib/stream/WebStreamByobReader.js"() {
    init_WebStreamReader();
    WebStreamByobReader = class extends WebStreamReader {
      /**
       * Read from stream
       * @param buffer - Target Uint8Array (or Buffer) to store data read from stream in
       * @param mayBeLess - If true, may fill the buffer partially
       * @protected Bytes read
       */
      async readFromStream(buffer, mayBeLess) {
        if (buffer.length === 0)
          return 0;
        const result = await this.reader.read(new Uint8Array(buffer.length), { min: mayBeLess ? void 0 : buffer.length });
        if (result.done) {
          this.endOfStream = result.done;
        }
        if (result.value) {
          buffer.set(result.value);
          return result.value.length;
        }
        return 0;
      }
    };
  }
});

// node_modules/strtok3/lib/stream/WebStreamDefaultReader.js
var WebStreamDefaultReader;
var init_WebStreamDefaultReader = __esm({
  "node_modules/strtok3/lib/stream/WebStreamDefaultReader.js"() {
    init_Errors();
    init_AbstractStreamReader();
    WebStreamDefaultReader = class extends AbstractStreamReader {
      constructor(reader) {
        super();
        this.reader = reader;
        this.buffer = null;
      }
      /**
       * Copy chunk to target, and store the remainder in this.buffer
       */
      writeChunk(target, chunk) {
        const written = Math.min(chunk.length, target.length);
        target.set(chunk.subarray(0, written));
        if (written < chunk.length) {
          this.buffer = chunk.subarray(written);
        } else {
          this.buffer = null;
        }
        return written;
      }
      /**
       * Read from stream
       * @param buffer - Target Uint8Array (or Buffer) to store data read from stream in
       * @param mayBeLess - If true, may fill the buffer partially
       * @protected Bytes read
       */
      async readFromStream(buffer, mayBeLess) {
        if (buffer.length === 0)
          return 0;
        let totalBytesRead = 0;
        if (this.buffer) {
          totalBytesRead += this.writeChunk(buffer, this.buffer);
        }
        while (totalBytesRead < buffer.length && !this.endOfStream) {
          const result = await this.reader.read();
          if (result.done) {
            this.endOfStream = true;
            break;
          }
          if (result.value) {
            totalBytesRead += this.writeChunk(buffer.subarray(totalBytesRead), result.value);
          }
        }
        if (!mayBeLess && totalBytesRead === 0 && this.endOfStream) {
          throw new EndOfStreamError();
        }
        return totalBytesRead;
      }
      abort() {
        this.interrupted = true;
        return this.reader.cancel();
      }
      async close() {
        await this.abort();
        this.reader.releaseLock();
      }
    };
  }
});

// node_modules/strtok3/lib/stream/WebStreamReaderFactory.js
function makeWebStreamReader(stream) {
  try {
    const reader = stream.getReader({ mode: "byob" });
    if (reader instanceof ReadableStreamDefaultReader) {
      return new WebStreamDefaultReader(reader);
    }
    return new WebStreamByobReader(reader);
  } catch (error) {
    if (error instanceof TypeError) {
      return new WebStreamDefaultReader(stream.getReader());
    }
    throw error;
  }
}
var init_WebStreamReaderFactory = __esm({
  "node_modules/strtok3/lib/stream/WebStreamReaderFactory.js"() {
    init_WebStreamByobReader();
    init_WebStreamDefaultReader();
  }
});

// node_modules/strtok3/lib/stream/index.js
var init_stream = __esm({
  "node_modules/strtok3/lib/stream/index.js"() {
    init_Errors();
    init_StreamReader();
    init_WebStreamByobReader();
    init_WebStreamDefaultReader();
    init_WebStreamReaderFactory();
  }
});

// node_modules/strtok3/lib/AbstractTokenizer.js
var AbstractTokenizer;
var init_AbstractTokenizer = __esm({
  "node_modules/strtok3/lib/AbstractTokenizer.js"() {
    init_stream();
    AbstractTokenizer = class {
      /**
       * Constructor
       * @param options Tokenizer options
       * @protected
       */
      constructor(options) {
        this.numBuffer = new Uint8Array(8);
        this.position = 0;
        this.onClose = options?.onClose;
        if (options?.abortSignal) {
          options.abortSignal.addEventListener("abort", () => {
            this.abort();
          });
        }
      }
      /**
       * Read a token from the tokenizer-stream
       * @param token - The token to read
       * @param position - If provided, the desired position in the tokenizer-stream
       * @returns Promise with token data
       */
      async readToken(token, position = this.position) {
        const uint8Array = new Uint8Array(token.len);
        const len = await this.readBuffer(uint8Array, { position });
        if (len < token.len)
          throw new EndOfStreamError();
        return token.get(uint8Array, 0);
      }
      /**
       * Peek a token from the tokenizer-stream.
       * @param token - Token to peek from the tokenizer-stream.
       * @param position - Offset where to begin reading within the file. If position is null, data will be read from the current file position.
       * @returns Promise with token data
       */
      async peekToken(token, position = this.position) {
        const uint8Array = new Uint8Array(token.len);
        const len = await this.peekBuffer(uint8Array, { position });
        if (len < token.len)
          throw new EndOfStreamError();
        return token.get(uint8Array, 0);
      }
      /**
       * Read a numeric token from the stream
       * @param token - Numeric token
       * @returns Promise with number
       */
      async readNumber(token) {
        const len = await this.readBuffer(this.numBuffer, { length: token.len });
        if (len < token.len)
          throw new EndOfStreamError();
        return token.get(this.numBuffer, 0);
      }
      /**
       * Read a numeric token from the stream
       * @param token - Numeric token
       * @returns Promise with number
       */
      async peekNumber(token) {
        const len = await this.peekBuffer(this.numBuffer, { length: token.len });
        if (len < token.len)
          throw new EndOfStreamError();
        return token.get(this.numBuffer, 0);
      }
      /**
       * Ignore number of bytes, advances the pointer in under tokenizer-stream.
       * @param length - Number of bytes to ignore.  Must be ≥ 0.
       * @return resolves the number of bytes ignored, equals length if this available, otherwise the number of bytes available
       */
      async ignore(length) {
        if (length < 0) {
          throw new RangeError("ignore length must be \u2265 0 bytes");
        }
        if (this.fileInfo.size !== void 0) {
          const bytesLeft = this.fileInfo.size - this.position;
          if (length > bytesLeft) {
            this.position += bytesLeft;
            return bytesLeft;
          }
        }
        this.position += length;
        return length;
      }
      async close() {
        await this.abort();
        await this.onClose?.();
      }
      normalizeOptions(uint8Array, options) {
        if (!this.supportsRandomAccess() && options && options.position !== void 0 && options.position < this.position) {
          throw new Error("`options.position` must be equal or greater than `tokenizer.position`");
        }
        return {
          ...{
            mayBeLess: false,
            offset: 0,
            length: uint8Array.length,
            position: this.position
          },
          ...options
        };
      }
      abort() {
        return Promise.resolve();
      }
    };
  }
});

// node_modules/strtok3/lib/ReadStreamTokenizer.js
var maxBufferSize, ReadStreamTokenizer;
var init_ReadStreamTokenizer = __esm({
  "node_modules/strtok3/lib/ReadStreamTokenizer.js"() {
    init_AbstractTokenizer();
    init_stream();
    maxBufferSize = 256e3;
    ReadStreamTokenizer = class extends AbstractTokenizer {
      /**
       * Constructor
       * @param streamReader stream-reader to read from
       * @param options Tokenizer options
       */
      constructor(streamReader, options) {
        super(options);
        this.streamReader = streamReader;
        this.fileInfo = options?.fileInfo ?? {};
      }
      /**
       * Read buffer from tokenizer
       * @param uint8Array - Target Uint8Array to fill with data read from the tokenizer-stream
       * @param options - Read behaviour options
       * @returns Promise with number of bytes read
       */
      async readBuffer(uint8Array, options) {
        const normOptions = this.normalizeOptions(uint8Array, options);
        const skipBytes = normOptions.position - this.position;
        if (skipBytes > 0) {
          await this.ignore(skipBytes);
          return this.readBuffer(uint8Array, options);
        }
        if (skipBytes < 0) {
          throw new Error("`options.position` must be equal or greater than `tokenizer.position`");
        }
        if (normOptions.length === 0) {
          return 0;
        }
        const bytesRead = await this.streamReader.read(uint8Array.subarray(0, normOptions.length), normOptions.mayBeLess);
        this.position += bytesRead;
        if ((!options || !options.mayBeLess) && bytesRead < normOptions.length) {
          throw new EndOfStreamError();
        }
        return bytesRead;
      }
      /**
       * Peek (read ahead) buffer from tokenizer
       * @param uint8Array - Uint8Array (or Buffer) to write data to
       * @param options - Read behaviour options
       * @returns Promise with number of bytes peeked
       */
      async peekBuffer(uint8Array, options) {
        const normOptions = this.normalizeOptions(uint8Array, options);
        let bytesRead = 0;
        if (normOptions.position) {
          const skipBytes = normOptions.position - this.position;
          if (skipBytes > 0) {
            const skipBuffer = new Uint8Array(normOptions.length + skipBytes);
            bytesRead = await this.peekBuffer(skipBuffer, { mayBeLess: normOptions.mayBeLess });
            uint8Array.set(skipBuffer.subarray(skipBytes));
            return bytesRead - skipBytes;
          }
          if (skipBytes < 0) {
            throw new Error("Cannot peek from a negative offset in a stream");
          }
        }
        if (normOptions.length > 0) {
          try {
            bytesRead = await this.streamReader.peek(uint8Array.subarray(0, normOptions.length), normOptions.mayBeLess);
          } catch (err) {
            if (options?.mayBeLess && err instanceof EndOfStreamError) {
              return 0;
            }
            throw err;
          }
          if (!normOptions.mayBeLess && bytesRead < normOptions.length) {
            throw new EndOfStreamError();
          }
        }
        return bytesRead;
      }
      /**
       * @param length Number of bytes to ignore. Must be ≥ 0.
       */
      async ignore(length) {
        if (length < 0) {
          throw new RangeError("ignore length must be \u2265 0 bytes");
        }
        const bufSize = Math.min(maxBufferSize, length);
        const buf = new Uint8Array(bufSize);
        let totBytesRead = 0;
        while (totBytesRead < length) {
          const remaining = length - totBytesRead;
          const bytesRead = await this.readBuffer(buf, { length: Math.min(bufSize, remaining) });
          if (bytesRead < 0) {
            return bytesRead;
          }
          totBytesRead += bytesRead;
        }
        return totBytesRead;
      }
      abort() {
        return this.streamReader.abort();
      }
      async close() {
        return this.streamReader.close();
      }
      supportsRandomAccess() {
        return false;
      }
    };
  }
});

// node_modules/strtok3/lib/BufferTokenizer.js
var BufferTokenizer;
var init_BufferTokenizer = __esm({
  "node_modules/strtok3/lib/BufferTokenizer.js"() {
    init_stream();
    init_AbstractTokenizer();
    BufferTokenizer = class extends AbstractTokenizer {
      /**
       * Construct BufferTokenizer
       * @param uint8Array - Uint8Array to tokenize
       * @param options Tokenizer options
       */
      constructor(uint8Array, options) {
        super(options);
        this.uint8Array = uint8Array;
        this.fileInfo = { ...options?.fileInfo ?? {}, ...{ size: uint8Array.length } };
      }
      /**
       * Read buffer from tokenizer
       * @param uint8Array - Uint8Array to tokenize
       * @param options - Read behaviour options
       * @returns {Promise<number>}
       */
      async readBuffer(uint8Array, options) {
        if (options?.position) {
          this.position = options.position;
        }
        const bytesRead = await this.peekBuffer(uint8Array, options);
        this.position += bytesRead;
        return bytesRead;
      }
      /**
       * Peek (read ahead) buffer from tokenizer
       * @param uint8Array
       * @param options - Read behaviour options
       * @returns {Promise<number>}
       */
      async peekBuffer(uint8Array, options) {
        const normOptions = this.normalizeOptions(uint8Array, options);
        const bytes2read = Math.min(this.uint8Array.length - normOptions.position, normOptions.length);
        if (!normOptions.mayBeLess && bytes2read < normOptions.length) {
          throw new EndOfStreamError();
        }
        uint8Array.set(this.uint8Array.subarray(normOptions.position, normOptions.position + bytes2read));
        return bytes2read;
      }
      close() {
        return super.close();
      }
      supportsRandomAccess() {
        return true;
      }
      setPosition(position) {
        this.position = position;
      }
    };
  }
});

// node_modules/strtok3/lib/BlobTokenizer.js
var BlobTokenizer;
var init_BlobTokenizer = __esm({
  "node_modules/strtok3/lib/BlobTokenizer.js"() {
    init_stream();
    init_AbstractTokenizer();
    BlobTokenizer = class extends AbstractTokenizer {
      /**
       * Construct BufferTokenizer
       * @param blob - Uint8Array to tokenize
       * @param options Tokenizer options
       */
      constructor(blob, options) {
        super(options);
        this.blob = blob;
        this.fileInfo = { ...options?.fileInfo ?? {}, ...{ size: blob.size, mimeType: blob.type } };
      }
      /**
       * Read buffer from tokenizer
       * @param uint8Array - Uint8Array to tokenize
       * @param options - Read behaviour options
       * @returns {Promise<number>}
       */
      async readBuffer(uint8Array, options) {
        if (options?.position) {
          this.position = options.position;
        }
        const bytesRead = await this.peekBuffer(uint8Array, options);
        this.position += bytesRead;
        return bytesRead;
      }
      /**
       * Peek (read ahead) buffer from tokenizer
       * @param buffer
       * @param options - Read behaviour options
       * @returns {Promise<number>}
       */
      async peekBuffer(buffer, options) {
        const normOptions = this.normalizeOptions(buffer, options);
        const bytes2read = Math.min(this.blob.size - normOptions.position, normOptions.length);
        if (!normOptions.mayBeLess && bytes2read < normOptions.length) {
          throw new EndOfStreamError();
        }
        const arrayBuffer = await this.blob.slice(normOptions.position, normOptions.position + bytes2read).arrayBuffer();
        buffer.set(new Uint8Array(arrayBuffer));
        return bytes2read;
      }
      close() {
        return super.close();
      }
      supportsRandomAccess() {
        return true;
      }
      setPosition(position) {
        this.position = position;
      }
    };
  }
});

// node_modules/strtok3/lib/core.js
function fromWebStream(webStream, options) {
  const webStreamReader = makeWebStreamReader(webStream);
  const _options = options ?? {};
  const chainedClose = _options.onClose;
  _options.onClose = async () => {
    await webStreamReader.close();
    if (chainedClose) {
      return chainedClose();
    }
  };
  return new ReadStreamTokenizer(webStreamReader, _options);
}
function fromBuffer(uint8Array, options) {
  return new BufferTokenizer(uint8Array, options);
}
function fromBlob(blob, options) {
  return new BlobTokenizer(blob, options);
}
var init_core = __esm({
  "node_modules/strtok3/lib/core.js"() {
    init_stream();
    init_ReadStreamTokenizer();
    init_BufferTokenizer();
    init_BlobTokenizer();
    init_stream();
    init_AbstractTokenizer();
  }
});

// node_modules/strtok3/lib/FileTokenizer.js
import { open as fsOpen } from "node:fs/promises";
var FileTokenizer;
var init_FileTokenizer = __esm({
  "node_modules/strtok3/lib/FileTokenizer.js"() {
    init_AbstractTokenizer();
    init_stream();
    FileTokenizer = class _FileTokenizer extends AbstractTokenizer {
      /**
       * Create tokenizer from provided file path
       * @param sourceFilePath File path
       */
      static async fromFile(sourceFilePath) {
        const fileHandle = await fsOpen(sourceFilePath, "r");
        const stat = await fileHandle.stat();
        return new _FileTokenizer(fileHandle, { fileInfo: { path: sourceFilePath, size: stat.size } });
      }
      constructor(fileHandle, options) {
        super(options);
        this.fileHandle = fileHandle;
        this.fileInfo = options.fileInfo;
      }
      /**
       * Read buffer from file
       * @param uint8Array - Uint8Array to write result to
       * @param options - Read behaviour options
       * @returns Promise number of bytes read
       */
      async readBuffer(uint8Array, options) {
        const normOptions = this.normalizeOptions(uint8Array, options);
        this.position = normOptions.position;
        if (normOptions.length === 0)
          return 0;
        const res = await this.fileHandle.read(uint8Array, 0, normOptions.length, normOptions.position);
        this.position += res.bytesRead;
        if (res.bytesRead < normOptions.length && (!options || !options.mayBeLess)) {
          throw new EndOfStreamError();
        }
        return res.bytesRead;
      }
      /**
       * Peek buffer from file
       * @param uint8Array - Uint8Array (or Buffer) to write data to
       * @param options - Read behaviour options
       * @returns Promise number of bytes read
       */
      async peekBuffer(uint8Array, options) {
        const normOptions = this.normalizeOptions(uint8Array, options);
        const res = await this.fileHandle.read(uint8Array, 0, normOptions.length, normOptions.position);
        if (!normOptions.mayBeLess && res.bytesRead < normOptions.length) {
          throw new EndOfStreamError();
        }
        return res.bytesRead;
      }
      async close() {
        await this.fileHandle.close();
        return super.close();
      }
      setPosition(position) {
        this.position = position;
      }
      supportsRandomAccess() {
        return true;
      }
    };
  }
});

// node_modules/strtok3/lib/index.js
var fromFile;
var init_lib = __esm({
  "node_modules/strtok3/lib/index.js"() {
    init_core();
    init_FileTokenizer();
    init_FileTokenizer();
    init_core();
    fromFile = FileTokenizer.fromFile;
  }
});

// node_modules/ieee754/index.js
var require_ieee754 = __commonJS({
  "node_modules/ieee754/index.js"(exports) {
    exports.read = function(buffer, offset, isLE, mLen, nBytes) {
      var e, m;
      var eLen = nBytes * 8 - mLen - 1;
      var eMax = (1 << eLen) - 1;
      var eBias = eMax >> 1;
      var nBits = -7;
      var i = isLE ? nBytes - 1 : 0;
      var d = isLE ? -1 : 1;
      var s = buffer[offset + i];
      i += d;
      e = s & (1 << -nBits) - 1;
      s >>= -nBits;
      nBits += eLen;
      for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8) {
      }
      m = e & (1 << -nBits) - 1;
      e >>= -nBits;
      nBits += mLen;
      for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8) {
      }
      if (e === 0) {
        e = 1 - eBias;
      } else if (e === eMax) {
        return m ? NaN : (s ? -1 : 1) * Infinity;
      } else {
        m = m + Math.pow(2, mLen);
        e = e - eBias;
      }
      return (s ? -1 : 1) * m * Math.pow(2, e - mLen);
    };
    exports.write = function(buffer, value, offset, isLE, mLen, nBytes) {
      var e, m, c;
      var eLen = nBytes * 8 - mLen - 1;
      var eMax = (1 << eLen) - 1;
      var eBias = eMax >> 1;
      var rt = mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0;
      var i = isLE ? 0 : nBytes - 1;
      var d = isLE ? 1 : -1;
      var s = value < 0 || value === 0 && 1 / value < 0 ? 1 : 0;
      value = Math.abs(value);
      if (isNaN(value) || value === Infinity) {
        m = isNaN(value) ? 1 : 0;
        e = eMax;
      } else {
        e = Math.floor(Math.log(value) / Math.LN2);
        if (value * (c = Math.pow(2, -e)) < 1) {
          e--;
          c *= 2;
        }
        if (e + eBias >= 1) {
          value += rt / c;
        } else {
          value += rt * Math.pow(2, 1 - eBias);
        }
        if (value * c >= 2) {
          e++;
          c /= 2;
        }
        if (e + eBias >= eMax) {
          m = 0;
          e = eMax;
        } else if (e + eBias >= 1) {
          m = (value * c - 1) * Math.pow(2, mLen);
          e = e + eBias;
        } else {
          m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
          e = 0;
        }
      }
      for (; mLen >= 8; buffer[offset + i] = m & 255, i += d, m /= 256, mLen -= 8) {
      }
      e = e << mLen | m;
      eLen += mLen;
      for (; eLen > 0; buffer[offset + i] = e & 255, i += d, e /= 256, eLen -= 8) {
      }
      buffer[offset + i - d] |= s * 128;
    };
  }
});

// node_modules/@borewit/text-codec/lib/index.js
function utf8Decoder() {
  if (typeof globalThis.TextDecoder === "undefined")
    return void 0;
  return _utf8Decoder !== null && _utf8Decoder !== void 0 ? _utf8Decoder : _utf8Decoder = new globalThis.TextDecoder("utf-8");
}
function textDecode(bytes, encoding = "utf-8") {
  switch (encoding.toLowerCase()) {
    case "utf-8":
    case "utf8": {
      const dec = utf8Decoder();
      return dec ? dec.decode(bytes) : decodeUTF8(bytes);
    }
    case "utf-16le":
      return decodeUTF16LE(bytes);
    case "us-ascii":
    case "ascii":
      return decodeASCII(bytes);
    case "latin1":
    case "iso-8859-1":
      return decodeLatin1(bytes);
    case "windows-1252":
      return decodeWindows1252(bytes);
    default:
      throw new RangeError(`Encoding '${encoding}' not supported`);
  }
}
function flushChunk(parts, chunk) {
  if (chunk.length === 0)
    return;
  parts.push(String.fromCharCode.apply(null, chunk));
  chunk.length = 0;
}
function pushCodeUnit(parts, chunk, codeUnit) {
  chunk.push(codeUnit);
  if (chunk.length >= CHUNK)
    flushChunk(parts, chunk);
}
function pushCodePoint(parts, chunk, cp) {
  if (cp <= 65535) {
    pushCodeUnit(parts, chunk, cp);
    return;
  }
  cp -= 65536;
  pushCodeUnit(parts, chunk, 55296 + (cp >> 10));
  pushCodeUnit(parts, chunk, 56320 + (cp & 1023));
}
function decodeUTF8(bytes) {
  const parts = [];
  const chunk = [];
  let i = 0;
  if (bytes.length >= 3 && bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191) {
    i = 3;
  }
  while (i < bytes.length) {
    const b1 = bytes[i];
    if (b1 <= 127) {
      pushCodeUnit(parts, chunk, b1);
      i++;
      continue;
    }
    if (b1 < 194 || b1 > 244) {
      pushCodeUnit(parts, chunk, REPLACEMENT);
      i++;
      continue;
    }
    if (b1 <= 223) {
      if (i + 1 >= bytes.length) {
        pushCodeUnit(parts, chunk, REPLACEMENT);
        i++;
        continue;
      }
      const b22 = bytes[i + 1];
      if ((b22 & 192) !== 128) {
        pushCodeUnit(parts, chunk, REPLACEMENT);
        i++;
        continue;
      }
      const cp2 = (b1 & 31) << 6 | b22 & 63;
      pushCodeUnit(parts, chunk, cp2);
      i += 2;
      continue;
    }
    if (b1 <= 239) {
      if (i + 2 >= bytes.length) {
        pushCodeUnit(parts, chunk, REPLACEMENT);
        i++;
        continue;
      }
      const b22 = bytes[i + 1];
      const b32 = bytes[i + 2];
      const valid2 = (b22 & 192) === 128 && (b32 & 192) === 128 && !(b1 === 224 && b22 < 160) && // overlong
      !(b1 === 237 && b22 >= 160);
      if (!valid2) {
        pushCodeUnit(parts, chunk, REPLACEMENT);
        i++;
        continue;
      }
      const cp2 = (b1 & 15) << 12 | (b22 & 63) << 6 | b32 & 63;
      pushCodeUnit(parts, chunk, cp2);
      i += 3;
      continue;
    }
    if (i + 3 >= bytes.length) {
      pushCodeUnit(parts, chunk, REPLACEMENT);
      i++;
      continue;
    }
    const b2 = bytes[i + 1];
    const b3 = bytes[i + 2];
    const b4 = bytes[i + 3];
    const valid = (b2 & 192) === 128 && (b3 & 192) === 128 && (b4 & 192) === 128 && !(b1 === 240 && b2 < 144) && // overlong
    !(b1 === 244 && b2 > 143);
    if (!valid) {
      pushCodeUnit(parts, chunk, REPLACEMENT);
      i++;
      continue;
    }
    const cp = (b1 & 7) << 18 | (b2 & 63) << 12 | (b3 & 63) << 6 | b4 & 63;
    pushCodePoint(parts, chunk, cp);
    i += 4;
  }
  flushChunk(parts, chunk);
  return parts.join("");
}
function decodeUTF16LE(bytes) {
  const parts = [];
  const chunk = [];
  const len = bytes.length;
  let i = 0;
  while (i + 1 < len) {
    const u1 = bytes[i] | bytes[i + 1] << 8;
    i += 2;
    if (u1 >= 55296 && u1 <= 56319) {
      if (i + 1 < len) {
        const u2 = bytes[i] | bytes[i + 1] << 8;
        if (u2 >= 56320 && u2 <= 57343) {
          pushCodeUnit(parts, chunk, u1);
          pushCodeUnit(parts, chunk, u2);
          i += 2;
        } else {
          pushCodeUnit(parts, chunk, REPLACEMENT);
        }
      } else {
        pushCodeUnit(parts, chunk, REPLACEMENT);
      }
      continue;
    }
    if (u1 >= 56320 && u1 <= 57343) {
      pushCodeUnit(parts, chunk, REPLACEMENT);
      continue;
    }
    pushCodeUnit(parts, chunk, u1);
  }
  if (i < len) {
    pushCodeUnit(parts, chunk, REPLACEMENT);
  }
  flushChunk(parts, chunk);
  return parts.join("");
}
function decodeASCII(bytes) {
  const parts = [];
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const end = Math.min(bytes.length, i + CHUNK);
    const codes = new Array(end - i);
    for (let j = i, k = 0; j < end; j++, k++) {
      codes[k] = bytes[j] & 127;
    }
    parts.push(String.fromCharCode.apply(null, codes));
  }
  return parts.join("");
}
function decodeLatin1(bytes) {
  const parts = [];
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const end = Math.min(bytes.length, i + CHUNK);
    const codes = new Array(end - i);
    for (let j = i, k = 0; j < end; j++, k++) {
      codes[k] = bytes[j];
    }
    parts.push(String.fromCharCode.apply(null, codes));
  }
  return parts.join("");
}
function decodeWindows1252(bytes) {
  const parts = [];
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    const extra = b >= 128 && b <= 159 ? WINDOWS_1252_EXTRA[b] : void 0;
    out += extra !== null && extra !== void 0 ? extra : String.fromCharCode(b);
    if (out.length >= CHUNK) {
      parts.push(out);
      out = "";
    }
  }
  if (out)
    parts.push(out);
  return parts.join("");
}
var WINDOWS_1252_EXTRA, WINDOWS_1252_REVERSE, _utf8Decoder, CHUNK, REPLACEMENT;
var init_lib2 = __esm({
  "node_modules/@borewit/text-codec/lib/index.js"() {
    WINDOWS_1252_EXTRA = {
      128: "\u20AC",
      130: "\u201A",
      131: "\u0192",
      132: "\u201E",
      133: "\u2026",
      134: "\u2020",
      135: "\u2021",
      136: "\u02C6",
      137: "\u2030",
      138: "\u0160",
      139: "\u2039",
      140: "\u0152",
      142: "\u017D",
      145: "\u2018",
      146: "\u2019",
      147: "\u201C",
      148: "\u201D",
      149: "\u2022",
      150: "\u2013",
      151: "\u2014",
      152: "\u02DC",
      153: "\u2122",
      154: "\u0161",
      155: "\u203A",
      156: "\u0153",
      158: "\u017E",
      159: "\u0178"
    };
    WINDOWS_1252_REVERSE = {};
    for (const [code, char] of Object.entries(WINDOWS_1252_EXTRA)) {
      WINDOWS_1252_REVERSE[char] = Number.parseInt(code, 10);
    }
    CHUNK = 32 * 1024;
    REPLACEMENT = 65533;
  }
});

// node_modules/token-types/lib/index.js
function dv(array) {
  return new DataView(array.buffer, array.byteOffset);
}
var ieee754, UINT8, UINT16_LE, UINT16_BE, UINT32_LE, UINT32_BE, INT32_BE, UINT64_LE, StringType;
var init_lib3 = __esm({
  "node_modules/token-types/lib/index.js"() {
    ieee754 = __toESM(require_ieee754(), 1);
    init_lib2();
    UINT8 = {
      len: 1,
      get(array, offset) {
        return dv(array).getUint8(offset);
      },
      put(array, offset, value) {
        dv(array).setUint8(offset, value);
        return offset + 1;
      }
    };
    UINT16_LE = {
      len: 2,
      get(array, offset) {
        return dv(array).getUint16(offset, true);
      },
      put(array, offset, value) {
        dv(array).setUint16(offset, value, true);
        return offset + 2;
      }
    };
    UINT16_BE = {
      len: 2,
      get(array, offset) {
        return dv(array).getUint16(offset);
      },
      put(array, offset, value) {
        dv(array).setUint16(offset, value);
        return offset + 2;
      }
    };
    UINT32_LE = {
      len: 4,
      get(array, offset) {
        return dv(array).getUint32(offset, true);
      },
      put(array, offset, value) {
        dv(array).setUint32(offset, value, true);
        return offset + 4;
      }
    };
    UINT32_BE = {
      len: 4,
      get(array, offset) {
        return dv(array).getUint32(offset);
      },
      put(array, offset, value) {
        dv(array).setUint32(offset, value);
        return offset + 4;
      }
    };
    INT32_BE = {
      len: 4,
      get(array, offset) {
        return dv(array).getInt32(offset);
      },
      put(array, offset, value) {
        dv(array).setInt32(offset, value);
        return offset + 4;
      }
    };
    UINT64_LE = {
      len: 8,
      get(array, offset) {
        return dv(array).getBigUint64(offset, true);
      },
      put(array, offset, value) {
        dv(array).setBigUint64(offset, value, true);
        return offset + 8;
      }
    };
    StringType = class {
      constructor(len, encoding) {
        this.len = len;
        this.encoding = encoding;
      }
      get(data, offset = 0) {
        const bytes = data.subarray(offset, offset + this.len);
        return textDecode(bytes, this.encoding);
      }
    };
  }
});

// node_modules/ms/index.js
var require_ms = __commonJS({
  "node_modules/ms/index.js"(exports, module) {
    var s = 1e3;
    var m = s * 60;
    var h = m * 60;
    var d = h * 24;
    var w = d * 7;
    var y = d * 365.25;
    module.exports = function(val, options) {
      options = options || {};
      var type = typeof val;
      if (type === "string" && val.length > 0) {
        return parse(val);
      } else if (type === "number" && isFinite(val)) {
        return options.long ? fmtLong(val) : fmtShort(val);
      }
      throw new Error(
        "val is not a non-empty string or a valid number. val=" + JSON.stringify(val)
      );
    };
    function parse(str) {
      str = String(str);
      if (str.length > 100) {
        return;
      }
      var match = /^(-?(?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)?$/i.exec(
        str
      );
      if (!match) {
        return;
      }
      var n = parseFloat(match[1]);
      var type = (match[2] || "ms").toLowerCase();
      switch (type) {
        case "years":
        case "year":
        case "yrs":
        case "yr":
        case "y":
          return n * y;
        case "weeks":
        case "week":
        case "w":
          return n * w;
        case "days":
        case "day":
        case "d":
          return n * d;
        case "hours":
        case "hour":
        case "hrs":
        case "hr":
        case "h":
          return n * h;
        case "minutes":
        case "minute":
        case "mins":
        case "min":
        case "m":
          return n * m;
        case "seconds":
        case "second":
        case "secs":
        case "sec":
        case "s":
          return n * s;
        case "milliseconds":
        case "millisecond":
        case "msecs":
        case "msec":
        case "ms":
          return n;
        default:
          return void 0;
      }
    }
    function fmtShort(ms) {
      var msAbs = Math.abs(ms);
      if (msAbs >= d) {
        return Math.round(ms / d) + "d";
      }
      if (msAbs >= h) {
        return Math.round(ms / h) + "h";
      }
      if (msAbs >= m) {
        return Math.round(ms / m) + "m";
      }
      if (msAbs >= s) {
        return Math.round(ms / s) + "s";
      }
      return ms + "ms";
    }
    function fmtLong(ms) {
      var msAbs = Math.abs(ms);
      if (msAbs >= d) {
        return plural(ms, msAbs, d, "day");
      }
      if (msAbs >= h) {
        return plural(ms, msAbs, h, "hour");
      }
      if (msAbs >= m) {
        return plural(ms, msAbs, m, "minute");
      }
      if (msAbs >= s) {
        return plural(ms, msAbs, s, "second");
      }
      return ms + " ms";
    }
    function plural(ms, msAbs, n, name) {
      var isPlural = msAbs >= n * 1.5;
      return Math.round(ms / n) + " " + name + (isPlural ? "s" : "");
    }
  }
});

// node_modules/debug/src/common.js
var require_common = __commonJS({
  "node_modules/debug/src/common.js"(exports, module) {
    function setup(env) {
      createDebug.debug = createDebug;
      createDebug.default = createDebug;
      createDebug.coerce = coerce;
      createDebug.disable = disable;
      createDebug.enable = enable;
      createDebug.enabled = enabled;
      createDebug.humanize = require_ms();
      createDebug.destroy = destroy;
      Object.keys(env).forEach((key) => {
        createDebug[key] = env[key];
      });
      createDebug.names = [];
      createDebug.skips = [];
      createDebug.formatters = {};
      function selectColor(namespace) {
        let hash = 0;
        for (let i = 0; i < namespace.length; i++) {
          hash = (hash << 5) - hash + namespace.charCodeAt(i);
          hash |= 0;
        }
        return createDebug.colors[Math.abs(hash) % createDebug.colors.length];
      }
      createDebug.selectColor = selectColor;
      function createDebug(namespace) {
        let prevTime;
        let enableOverride = null;
        let namespacesCache;
        let enabledCache;
        function debug2(...args) {
          if (!debug2.enabled) {
            return;
          }
          const self = debug2;
          const curr = Number(/* @__PURE__ */ new Date());
          const ms = curr - (prevTime || curr);
          self.diff = ms;
          self.prev = prevTime;
          self.curr = curr;
          prevTime = curr;
          args[0] = createDebug.coerce(args[0]);
          if (typeof args[0] !== "string") {
            args.unshift("%O");
          }
          let index = 0;
          args[0] = args[0].replace(/%([a-zA-Z%])/g, (match, format) => {
            if (match === "%%") {
              return "%";
            }
            index++;
            const formatter2 = createDebug.formatters[format];
            if (typeof formatter2 === "function") {
              const val = args[index];
              match = formatter2.call(self, val);
              args.splice(index, 1);
              index--;
            }
            return match;
          });
          createDebug.formatArgs.call(self, args);
          const logFn = self.log || createDebug.log;
          logFn.apply(self, args);
        }
        debug2.namespace = namespace;
        debug2.useColors = createDebug.useColors();
        debug2.color = createDebug.selectColor(namespace);
        debug2.extend = extend;
        debug2.destroy = createDebug.destroy;
        Object.defineProperty(debug2, "enabled", {
          enumerable: true,
          configurable: false,
          get: () => {
            if (enableOverride !== null) {
              return enableOverride;
            }
            if (namespacesCache !== createDebug.namespaces) {
              namespacesCache = createDebug.namespaces;
              enabledCache = createDebug.enabled(namespace);
            }
            return enabledCache;
          },
          set: (v) => {
            enableOverride = v;
          }
        });
        if (typeof createDebug.init === "function") {
          createDebug.init(debug2);
        }
        return debug2;
      }
      function extend(namespace, delimiter) {
        const newDebug = createDebug(this.namespace + (typeof delimiter === "undefined" ? ":" : delimiter) + namespace);
        newDebug.log = this.log;
        return newDebug;
      }
      function enable(namespaces) {
        createDebug.save(namespaces);
        createDebug.namespaces = namespaces;
        createDebug.names = [];
        createDebug.skips = [];
        const split = (typeof namespaces === "string" ? namespaces : "").trim().replace(/\s+/g, ",").split(",").filter(Boolean);
        for (const ns of split) {
          if (ns[0] === "-") {
            createDebug.skips.push(ns.slice(1));
          } else {
            createDebug.names.push(ns);
          }
        }
      }
      function matchesTemplate(search, template) {
        let searchIndex = 0;
        let templateIndex = 0;
        let starIndex = -1;
        let matchIndex = 0;
        while (searchIndex < search.length) {
          if (templateIndex < template.length && (template[templateIndex] === search[searchIndex] || template[templateIndex] === "*")) {
            if (template[templateIndex] === "*") {
              starIndex = templateIndex;
              matchIndex = searchIndex;
              templateIndex++;
            } else {
              searchIndex++;
              templateIndex++;
            }
          } else if (starIndex !== -1) {
            templateIndex = starIndex + 1;
            matchIndex++;
            searchIndex = matchIndex;
          } else {
            return false;
          }
        }
        while (templateIndex < template.length && template[templateIndex] === "*") {
          templateIndex++;
        }
        return templateIndex === template.length;
      }
      function disable() {
        const namespaces = [
          ...createDebug.names,
          ...createDebug.skips.map((namespace) => "-" + namespace)
        ].join(",");
        createDebug.enable("");
        return namespaces;
      }
      function enabled(name) {
        for (const skip of createDebug.skips) {
          if (matchesTemplate(name, skip)) {
            return false;
          }
        }
        for (const ns of createDebug.names) {
          if (matchesTemplate(name, ns)) {
            return true;
          }
        }
        return false;
      }
      function coerce(val) {
        if (val instanceof Error) {
          return val.stack || val.message;
        }
        return val;
      }
      function destroy() {
        console.warn("Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.");
      }
      createDebug.enable(createDebug.load());
      return createDebug;
    }
    module.exports = setup;
  }
});

// node_modules/debug/src/browser.js
var require_browser = __commonJS({
  "node_modules/debug/src/browser.js"(exports, module) {
    exports.formatArgs = formatArgs;
    exports.save = save;
    exports.load = load;
    exports.useColors = useColors;
    exports.storage = localstorage();
    exports.destroy = /* @__PURE__ */ (() => {
      let warned = false;
      return () => {
        if (!warned) {
          warned = true;
          console.warn("Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.");
        }
      };
    })();
    exports.colors = [
      "#0000CC",
      "#0000FF",
      "#0033CC",
      "#0033FF",
      "#0066CC",
      "#0066FF",
      "#0099CC",
      "#0099FF",
      "#00CC00",
      "#00CC33",
      "#00CC66",
      "#00CC99",
      "#00CCCC",
      "#00CCFF",
      "#3300CC",
      "#3300FF",
      "#3333CC",
      "#3333FF",
      "#3366CC",
      "#3366FF",
      "#3399CC",
      "#3399FF",
      "#33CC00",
      "#33CC33",
      "#33CC66",
      "#33CC99",
      "#33CCCC",
      "#33CCFF",
      "#6600CC",
      "#6600FF",
      "#6633CC",
      "#6633FF",
      "#66CC00",
      "#66CC33",
      "#9900CC",
      "#9900FF",
      "#9933CC",
      "#9933FF",
      "#99CC00",
      "#99CC33",
      "#CC0000",
      "#CC0033",
      "#CC0066",
      "#CC0099",
      "#CC00CC",
      "#CC00FF",
      "#CC3300",
      "#CC3333",
      "#CC3366",
      "#CC3399",
      "#CC33CC",
      "#CC33FF",
      "#CC6600",
      "#CC6633",
      "#CC9900",
      "#CC9933",
      "#CCCC00",
      "#CCCC33",
      "#FF0000",
      "#FF0033",
      "#FF0066",
      "#FF0099",
      "#FF00CC",
      "#FF00FF",
      "#FF3300",
      "#FF3333",
      "#FF3366",
      "#FF3399",
      "#FF33CC",
      "#FF33FF",
      "#FF6600",
      "#FF6633",
      "#FF9900",
      "#FF9933",
      "#FFCC00",
      "#FFCC33"
    ];
    function useColors() {
      if (typeof window !== "undefined" && window.process && (window.process.type === "renderer" || window.process.__nwjs)) {
        return true;
      }
      if (typeof navigator !== "undefined" && navigator.userAgent && navigator.userAgent.toLowerCase().match(/(edge|trident)\/(\d+)/)) {
        return false;
      }
      let m;
      return typeof document !== "undefined" && document.documentElement && document.documentElement.style && document.documentElement.style.WebkitAppearance || // Is firebug? http://stackoverflow.com/a/398120/376773
      typeof window !== "undefined" && window.console && (window.console.firebug || window.console.exception && window.console.table) || // Is firefox >= v31?
      // https://developer.mozilla.org/en-US/docs/Tools/Web_Console#Styling_messages
      typeof navigator !== "undefined" && navigator.userAgent && (m = navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/)) && parseInt(m[1], 10) >= 31 || // Double check webkit in userAgent just in case we are in a worker
      typeof navigator !== "undefined" && navigator.userAgent && navigator.userAgent.toLowerCase().match(/applewebkit\/(\d+)/);
    }
    function formatArgs(args) {
      args[0] = (this.useColors ? "%c" : "") + this.namespace + (this.useColors ? " %c" : " ") + args[0] + (this.useColors ? "%c " : " ") + "+" + module.exports.humanize(this.diff);
      if (!this.useColors) {
        return;
      }
      const c = "color: " + this.color;
      args.splice(1, 0, c, "color: inherit");
      let index = 0;
      let lastC = 0;
      args[0].replace(/%[a-zA-Z%]/g, (match) => {
        if (match === "%%") {
          return;
        }
        index++;
        if (match === "%c") {
          lastC = index;
        }
      });
      args.splice(lastC, 0, c);
    }
    exports.log = console.debug || console.log || (() => {
    });
    function save(namespaces) {
      try {
        if (namespaces) {
          exports.storage.setItem("debug", namespaces);
        } else {
          exports.storage.removeItem("debug");
        }
      } catch (error) {
      }
    }
    function load() {
      let r;
      try {
        r = exports.storage.getItem("debug") || exports.storage.getItem("DEBUG");
      } catch (error) {
      }
      if (!r && typeof process !== "undefined" && "env" in process) {
        r = process.env.DEBUG;
      }
      return r;
    }
    function localstorage() {
      try {
        return localStorage;
      } catch (error) {
      }
    }
    module.exports = require_common()(exports);
    var { formatters } = module.exports;
    formatters.j = function(v) {
      try {
        return JSON.stringify(v);
      } catch (error) {
        return "[UnexpectedJSONParseError]: " + error.message;
      }
    };
  }
});

// node_modules/has-flag/index.js
var require_has_flag = __commonJS({
  "node_modules/has-flag/index.js"(exports, module) {
    "use strict";
    module.exports = (flag2, argv = process.argv) => {
      const prefix = flag2.startsWith("-") ? "" : flag2.length === 1 ? "-" : "--";
      const position = argv.indexOf(prefix + flag2);
      const terminatorPosition = argv.indexOf("--");
      return position !== -1 && (terminatorPosition === -1 || position < terminatorPosition);
    };
  }
});

// node_modules/supports-color/index.js
var require_supports_color = __commonJS({
  "node_modules/supports-color/index.js"(exports, module) {
    "use strict";
    var os = __require("os");
    var tty = __require("tty");
    var hasFlag = require_has_flag();
    var { env } = process;
    var forceColor;
    if (hasFlag("no-color") || hasFlag("no-colors") || hasFlag("color=false") || hasFlag("color=never")) {
      forceColor = 0;
    } else if (hasFlag("color") || hasFlag("colors") || hasFlag("color=true") || hasFlag("color=always")) {
      forceColor = 1;
    }
    if ("FORCE_COLOR" in env) {
      if (env.FORCE_COLOR === "true") {
        forceColor = 1;
      } else if (env.FORCE_COLOR === "false") {
        forceColor = 0;
      } else {
        forceColor = env.FORCE_COLOR.length === 0 ? 1 : Math.min(parseInt(env.FORCE_COLOR, 10), 3);
      }
    }
    function translateLevel(level) {
      if (level === 0) {
        return false;
      }
      return {
        level,
        hasBasic: true,
        has256: level >= 2,
        has16m: level >= 3
      };
    }
    function supportsColor(haveStream, streamIsTTY) {
      if (forceColor === 0) {
        return 0;
      }
      if (hasFlag("color=16m") || hasFlag("color=full") || hasFlag("color=truecolor")) {
        return 3;
      }
      if (hasFlag("color=256")) {
        return 2;
      }
      if (haveStream && !streamIsTTY && forceColor === void 0) {
        return 0;
      }
      const min = forceColor || 0;
      if (env.TERM === "dumb") {
        return min;
      }
      if (process.platform === "win32") {
        const osRelease = os.release().split(".");
        if (Number(osRelease[0]) >= 10 && Number(osRelease[2]) >= 10586) {
          return Number(osRelease[2]) >= 14931 ? 3 : 2;
        }
        return 1;
      }
      if ("CI" in env) {
        if (["TRAVIS", "CIRCLECI", "APPVEYOR", "GITLAB_CI", "GITHUB_ACTIONS", "BUILDKITE"].some((sign) => sign in env) || env.CI_NAME === "codeship") {
          return 1;
        }
        return min;
      }
      if ("TEAMCITY_VERSION" in env) {
        return /^(9\.(0*[1-9]\d*)\.|\d{2,}\.)/.test(env.TEAMCITY_VERSION) ? 1 : 0;
      }
      if (env.COLORTERM === "truecolor") {
        return 3;
      }
      if ("TERM_PROGRAM" in env) {
        const version = parseInt((env.TERM_PROGRAM_VERSION || "").split(".")[0], 10);
        switch (env.TERM_PROGRAM) {
          case "iTerm.app":
            return version >= 3 ? 3 : 2;
          case "Apple_Terminal":
            return 2;
        }
      }
      if (/-256(color)?$/i.test(env.TERM)) {
        return 2;
      }
      if (/^screen|^xterm|^vt100|^vt220|^rxvt|color|ansi|cygwin|linux/i.test(env.TERM)) {
        return 1;
      }
      if ("COLORTERM" in env) {
        return 1;
      }
      return min;
    }
    function getSupportLevel(stream) {
      const level = supportsColor(stream, stream && stream.isTTY);
      return translateLevel(level);
    }
    module.exports = {
      supportsColor: getSupportLevel,
      stdout: translateLevel(supportsColor(true, tty.isatty(1))),
      stderr: translateLevel(supportsColor(true, tty.isatty(2)))
    };
  }
});

// node_modules/debug/src/node.js
var require_node = __commonJS({
  "node_modules/debug/src/node.js"(exports, module) {
    var tty = __require("tty");
    var util = __require("util");
    exports.init = init;
    exports.log = log;
    exports.formatArgs = formatArgs;
    exports.save = save;
    exports.load = load;
    exports.useColors = useColors;
    exports.destroy = util.deprecate(
      () => {
      },
      "Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`."
    );
    exports.colors = [6, 2, 3, 4, 5, 1];
    try {
      const supportsColor = require_supports_color();
      if (supportsColor && (supportsColor.stderr || supportsColor).level >= 2) {
        exports.colors = [
          20,
          21,
          26,
          27,
          32,
          33,
          38,
          39,
          40,
          41,
          42,
          43,
          44,
          45,
          56,
          57,
          62,
          63,
          68,
          69,
          74,
          75,
          76,
          77,
          78,
          79,
          80,
          81,
          92,
          93,
          98,
          99,
          112,
          113,
          128,
          129,
          134,
          135,
          148,
          149,
          160,
          161,
          162,
          163,
          164,
          165,
          166,
          167,
          168,
          169,
          170,
          171,
          172,
          173,
          178,
          179,
          184,
          185,
          196,
          197,
          198,
          199,
          200,
          201,
          202,
          203,
          204,
          205,
          206,
          207,
          208,
          209,
          214,
          215,
          220,
          221
        ];
      }
    } catch (error) {
    }
    exports.inspectOpts = Object.keys(process.env).filter((key) => {
      return /^debug_/i.test(key);
    }).reduce((obj, key) => {
      const prop = key.substring(6).toLowerCase().replace(/_([a-z])/g, (_, k) => {
        return k.toUpperCase();
      });
      let val = process.env[key];
      if (/^(yes|on|true|enabled)$/i.test(val)) {
        val = true;
      } else if (/^(no|off|false|disabled)$/i.test(val)) {
        val = false;
      } else if (val === "null") {
        val = null;
      } else {
        val = Number(val);
      }
      obj[prop] = val;
      return obj;
    }, {});
    function useColors() {
      return "colors" in exports.inspectOpts ? Boolean(exports.inspectOpts.colors) : tty.isatty(process.stderr.fd);
    }
    function formatArgs(args) {
      const { namespace: name, useColors: useColors2 } = this;
      if (useColors2) {
        const c = this.color;
        const colorCode = "\x1B[3" + (c < 8 ? c : "8;5;" + c);
        const prefix = `  ${colorCode};1m${name} \x1B[0m`;
        args[0] = prefix + args[0].split("\n").join("\n" + prefix);
        args.push(colorCode + "m+" + module.exports.humanize(this.diff) + "\x1B[0m");
      } else {
        args[0] = getDate() + name + " " + args[0];
      }
    }
    function getDate() {
      if (exports.inspectOpts.hideDate) {
        return "";
      }
      return (/* @__PURE__ */ new Date()).toISOString() + " ";
    }
    function log(...args) {
      return process.stderr.write(util.formatWithOptions(exports.inspectOpts, ...args) + "\n");
    }
    function save(namespaces) {
      if (namespaces) {
        process.env.DEBUG = namespaces;
      } else {
        delete process.env.DEBUG;
      }
    }
    function load() {
      return process.env.DEBUG;
    }
    function init(debug2) {
      debug2.inspectOpts = {};
      const keys = Object.keys(exports.inspectOpts);
      for (let i = 0; i < keys.length; i++) {
        debug2.inspectOpts[keys[i]] = exports.inspectOpts[keys[i]];
      }
    }
    module.exports = require_common()(exports);
    var { formatters } = module.exports;
    formatters.o = function(v) {
      this.inspectOpts.colors = this.useColors;
      return util.inspect(v, this.inspectOpts).split("\n").map((str) => str.trim()).join(" ");
    };
    formatters.O = function(v) {
      this.inspectOpts.colors = this.useColors;
      return util.inspect(v, this.inspectOpts);
    };
  }
});

// node_modules/debug/src/index.js
var require_src = __commonJS({
  "node_modules/debug/src/index.js"(exports, module) {
    if (typeof process === "undefined" || process.type === "renderer" || process.browser === true || process.__nwjs) {
      module.exports = require_browser();
    } else {
      module.exports = require_node();
    }
  }
});

// node_modules/@tokenizer/inflate/lib/ZipToken.js
var Signature, DataDescriptor, LocalFileHeaderToken, EndOfCentralDirectoryRecordToken, FileHeader;
var init_ZipToken = __esm({
  "node_modules/@tokenizer/inflate/lib/ZipToken.js"() {
    init_lib3();
    Signature = {
      LocalFileHeader: 67324752,
      DataDescriptor: 134695760,
      CentralFileHeader: 33639248,
      EndOfCentralDirectory: 101010256
    };
    DataDescriptor = {
      get(array) {
        return {
          signature: UINT32_LE.get(array, 0),
          compressedSize: UINT32_LE.get(array, 8),
          uncompressedSize: UINT32_LE.get(array, 12)
        };
      },
      len: 16
    };
    LocalFileHeaderToken = {
      get(array) {
        const flags = UINT16_LE.get(array, 6);
        return {
          signature: UINT32_LE.get(array, 0),
          minVersion: UINT16_LE.get(array, 4),
          dataDescriptor: !!(flags & 8),
          compressedMethod: UINT16_LE.get(array, 8),
          compressedSize: UINT32_LE.get(array, 18),
          uncompressedSize: UINT32_LE.get(array, 22),
          filenameLength: UINT16_LE.get(array, 26),
          extraFieldLength: UINT16_LE.get(array, 28),
          filename: null
        };
      },
      len: 30
    };
    EndOfCentralDirectoryRecordToken = {
      get(array) {
        return {
          signature: UINT32_LE.get(array, 0),
          nrOfThisDisk: UINT16_LE.get(array, 4),
          nrOfThisDiskWithTheStart: UINT16_LE.get(array, 6),
          nrOfEntriesOnThisDisk: UINT16_LE.get(array, 8),
          nrOfEntriesOfSize: UINT16_LE.get(array, 10),
          sizeOfCd: UINT32_LE.get(array, 12),
          offsetOfStartOfCd: UINT32_LE.get(array, 16),
          zipFileCommentLength: UINT16_LE.get(array, 20)
        };
      },
      len: 22
    };
    FileHeader = {
      get(array) {
        const flags = UINT16_LE.get(array, 8);
        return {
          signature: UINT32_LE.get(array, 0),
          minVersion: UINT16_LE.get(array, 6),
          dataDescriptor: !!(flags & 8),
          compressedMethod: UINT16_LE.get(array, 10),
          compressedSize: UINT32_LE.get(array, 20),
          uncompressedSize: UINT32_LE.get(array, 24),
          filenameLength: UINT16_LE.get(array, 28),
          extraFieldLength: UINT16_LE.get(array, 30),
          fileCommentLength: UINT16_LE.get(array, 32),
          relativeOffsetOfLocalHeader: UINT32_LE.get(array, 42),
          filename: null
        };
      },
      len: 46
    };
  }
});

// node_modules/@tokenizer/inflate/lib/ZipHandler.js
function signatureToArray(signature) {
  const signatureBytes = new Uint8Array(UINT32_LE.len);
  UINT32_LE.put(signatureBytes, 0, signature);
  return signatureBytes;
}
function indexOf(buffer, portion) {
  const bufferLength = buffer.length;
  const portionLength = portion.length;
  if (portionLength > bufferLength)
    return -1;
  for (let i = 0; i <= bufferLength - portionLength; i++) {
    let found = true;
    for (let j = 0; j < portionLength; j++) {
      if (buffer[i + j] !== portion[j]) {
        found = false;
        break;
      }
    }
    if (found) {
      return i;
    }
  }
  return -1;
}
function mergeArrays(chunks) {
  const totalLength = chunks.reduce((acc, curr) => acc + curr.length, 0);
  const mergedArray = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    mergedArray.set(chunk, offset);
    offset += chunk.length;
  }
  return mergedArray;
}
var import_debug, debug, syncBufferSize, ddSignatureArray, eocdSignatureBytes, ZipHandler;
var init_ZipHandler = __esm({
  "node_modules/@tokenizer/inflate/lib/ZipHandler.js"() {
    init_lib3();
    import_debug = __toESM(require_src(), 1);
    init_ZipToken();
    debug = (0, import_debug.default)("tokenizer:inflate");
    syncBufferSize = 256 * 1024;
    ddSignatureArray = signatureToArray(Signature.DataDescriptor);
    eocdSignatureBytes = signatureToArray(Signature.EndOfCentralDirectory);
    ZipHandler = class _ZipHandler {
      constructor(tokenizer) {
        this.tokenizer = tokenizer;
        this.syncBuffer = new Uint8Array(syncBufferSize);
      }
      async isZip() {
        return await this.peekSignature() === Signature.LocalFileHeader;
      }
      peekSignature() {
        return this.tokenizer.peekToken(UINT32_LE);
      }
      async findEndOfCentralDirectoryLocator() {
        const randomReadTokenizer = this.tokenizer;
        const chunkLength = Math.min(16 * 1024, randomReadTokenizer.fileInfo.size);
        const buffer = this.syncBuffer.subarray(0, chunkLength);
        await this.tokenizer.readBuffer(buffer, { position: randomReadTokenizer.fileInfo.size - chunkLength });
        for (let i = buffer.length - 4; i >= 0; i--) {
          if (buffer[i] === eocdSignatureBytes[0] && buffer[i + 1] === eocdSignatureBytes[1] && buffer[i + 2] === eocdSignatureBytes[2] && buffer[i + 3] === eocdSignatureBytes[3]) {
            return randomReadTokenizer.fileInfo.size - chunkLength + i;
          }
        }
        return -1;
      }
      async readCentralDirectory() {
        if (!this.tokenizer.supportsRandomAccess()) {
          debug("Cannot reading central-directory without random-read support");
          return;
        }
        debug("Reading central-directory...");
        const pos = this.tokenizer.position;
        const offset = await this.findEndOfCentralDirectoryLocator();
        if (offset > 0) {
          debug("Central-directory 32-bit signature found");
          const eocdHeader = await this.tokenizer.readToken(EndOfCentralDirectoryRecordToken, offset);
          const files = [];
          this.tokenizer.setPosition(eocdHeader.offsetOfStartOfCd);
          for (let n = 0; n < eocdHeader.nrOfEntriesOfSize; ++n) {
            const entry = await this.tokenizer.readToken(FileHeader);
            if (entry.signature !== Signature.CentralFileHeader) {
              throw new Error("Expected Central-File-Header signature");
            }
            entry.filename = await this.tokenizer.readToken(new StringType(entry.filenameLength, "utf-8"));
            await this.tokenizer.ignore(entry.extraFieldLength);
            await this.tokenizer.ignore(entry.fileCommentLength);
            files.push(entry);
            debug(`Add central-directory file-entry: n=${n + 1}/${files.length}: filename=${files[n].filename}`);
          }
          this.tokenizer.setPosition(pos);
          return files;
        }
        this.tokenizer.setPosition(pos);
      }
      async unzip(fileCb) {
        const entries = await this.readCentralDirectory();
        if (entries) {
          return this.iterateOverCentralDirectory(entries, fileCb);
        }
        let stop = false;
        do {
          const zipHeader = await this.readLocalFileHeader();
          if (!zipHeader)
            break;
          const next = fileCb(zipHeader);
          stop = !!next.stop;
          let fileData;
          await this.tokenizer.ignore(zipHeader.extraFieldLength);
          if (zipHeader.dataDescriptor && zipHeader.compressedSize === 0) {
            const chunks = [];
            let len = syncBufferSize;
            debug("Compressed-file-size unknown, scanning for next data-descriptor-signature....");
            let nextHeaderIndex = -1;
            while (nextHeaderIndex < 0 && len === syncBufferSize) {
              len = await this.tokenizer.peekBuffer(this.syncBuffer, { mayBeLess: true });
              nextHeaderIndex = indexOf(this.syncBuffer.subarray(0, len), ddSignatureArray);
              const size = nextHeaderIndex >= 0 ? nextHeaderIndex : len;
              if (next.handler) {
                const data = new Uint8Array(size);
                await this.tokenizer.readBuffer(data);
                chunks.push(data);
              } else {
                await this.tokenizer.ignore(size);
              }
            }
            debug(`Found data-descriptor-signature at pos=${this.tokenizer.position}`);
            if (next.handler) {
              await this.inflate(zipHeader, mergeArrays(chunks), next.handler);
            }
          } else {
            if (next.handler) {
              debug(`Reading compressed-file-data: ${zipHeader.compressedSize} bytes`);
              fileData = new Uint8Array(zipHeader.compressedSize);
              await this.tokenizer.readBuffer(fileData);
              await this.inflate(zipHeader, fileData, next.handler);
            } else {
              debug(`Ignoring compressed-file-data: ${zipHeader.compressedSize} bytes`);
              await this.tokenizer.ignore(zipHeader.compressedSize);
            }
          }
          debug(`Reading data-descriptor at pos=${this.tokenizer.position}`);
          if (zipHeader.dataDescriptor) {
            const dataDescriptor = await this.tokenizer.readToken(DataDescriptor);
            if (dataDescriptor.signature !== 134695760) {
              throw new Error(`Expected data-descriptor-signature at position ${this.tokenizer.position - DataDescriptor.len}`);
            }
          }
        } while (!stop);
      }
      async iterateOverCentralDirectory(entries, fileCb) {
        for (const fileHeader of entries) {
          const next = fileCb(fileHeader);
          if (next.handler) {
            this.tokenizer.setPosition(fileHeader.relativeOffsetOfLocalHeader);
            const zipHeader = await this.readLocalFileHeader();
            if (zipHeader) {
              await this.tokenizer.ignore(zipHeader.extraFieldLength);
              const fileData = new Uint8Array(fileHeader.compressedSize);
              await this.tokenizer.readBuffer(fileData);
              await this.inflate(zipHeader, fileData, next.handler);
            }
          }
          if (next.stop)
            break;
        }
      }
      async inflate(zipHeader, fileData, cb) {
        if (zipHeader.compressedMethod === 0) {
          return cb(fileData);
        }
        if (zipHeader.compressedMethod !== 8) {
          throw new Error(`Unsupported ZIP compression method: ${zipHeader.compressedMethod}`);
        }
        debug(`Decompress filename=${zipHeader.filename}, compressed-size=${fileData.length}`);
        const uncompressedData = await _ZipHandler.decompressDeflateRaw(fileData);
        return cb(uncompressedData);
      }
      static async decompressDeflateRaw(data) {
        const input = new ReadableStream({
          start(controller) {
            controller.enqueue(data);
            controller.close();
          }
        });
        const ds = new DecompressionStream("deflate-raw");
        const output = input.pipeThrough(ds);
        try {
          const response = new Response(output);
          const buffer = await response.arrayBuffer();
          return new Uint8Array(buffer);
        } catch (err) {
          const message = err instanceof Error ? `Failed to deflate ZIP entry: ${err.message}` : "Unknown decompression error in ZIP entry";
          throw new TypeError(message);
        }
      }
      async readLocalFileHeader() {
        const signature = await this.tokenizer.peekToken(UINT32_LE);
        if (signature === Signature.LocalFileHeader) {
          const header = await this.tokenizer.readToken(LocalFileHeaderToken);
          header.filename = await this.tokenizer.readToken(new StringType(header.filenameLength, "utf-8"));
          return header;
        }
        if (signature === Signature.CentralFileHeader) {
          return false;
        }
        if (signature === 3759263696) {
          throw new Error("Encrypted ZIP");
        }
        throw new Error("Unexpected signature");
      }
    };
  }
});

// node_modules/@tokenizer/inflate/lib/GzipHandler.js
var GzipHandler;
var init_GzipHandler = __esm({
  "node_modules/@tokenizer/inflate/lib/GzipHandler.js"() {
    GzipHandler = class {
      constructor(tokenizer) {
        this.tokenizer = tokenizer;
      }
      inflate() {
        const tokenizer = this.tokenizer;
        return new ReadableStream({
          async pull(controller) {
            const buffer = new Uint8Array(1024);
            const size = await tokenizer.readBuffer(buffer, { mayBeLess: true });
            if (size === 0) {
              controller.close();
              return;
            }
            controller.enqueue(buffer.subarray(0, size));
          }
        }).pipeThrough(new DecompressionStream("gzip"));
      }
    };
  }
});

// node_modules/@tokenizer/inflate/lib/index.js
var init_lib4 = __esm({
  "node_modules/@tokenizer/inflate/lib/index.js"() {
    init_ZipHandler();
    init_GzipHandler();
  }
});

// node_modules/uint8array-extras/index.js
function getUintBE(view) {
  const { byteLength } = view;
  if (byteLength === 6) {
    return view.getUint16(0) * 2 ** 32 + view.getUint32(2);
  }
  if (byteLength === 5) {
    return view.getUint8(0) * 2 ** 32 + view.getUint32(1);
  }
  if (byteLength === 4) {
    return view.getUint32(0);
  }
  if (byteLength === 3) {
    return view.getUint8(0) * 2 ** 16 + view.getUint16(1);
  }
  if (byteLength === 2) {
    return view.getUint16(0);
  }
  if (byteLength === 1) {
    return view.getUint8(0);
  }
}
var cachedDecoders, cachedEncoder, byteToHexLookupTable;
var init_uint8array_extras = __esm({
  "node_modules/uint8array-extras/index.js"() {
    cachedDecoders = {
      utf8: new globalThis.TextDecoder("utf8")
    };
    cachedEncoder = new globalThis.TextEncoder();
    byteToHexLookupTable = Array.from({ length: 256 }, (_, index) => index.toString(16).padStart(2, "0"));
  }
});

// node_modules/file-type/util.js
function stringToBytes(string, encoding) {
  if (encoding === "utf-16le") {
    const bytes = [];
    for (let index = 0; index < string.length; index++) {
      const code = string.charCodeAt(index);
      bytes.push(code & 255, code >> 8 & 255);
    }
    return bytes;
  }
  if (encoding === "utf-16be") {
    const bytes = [];
    for (let index = 0; index < string.length; index++) {
      const code = string.charCodeAt(index);
      bytes.push(code >> 8 & 255, code & 255);
    }
    return bytes;
  }
  return [...string].map((character) => character.charCodeAt(0));
}
function tarHeaderChecksumMatches(arrayBuffer, offset = 0) {
  const readSum = Number.parseInt(new StringType(6).get(arrayBuffer, 148).replace(/\0.*$/, "").trim(), 8);
  if (Number.isNaN(readSum)) {
    return false;
  }
  let sum = 8 * 32;
  for (let index = offset; index < offset + 148; index++) {
    sum += arrayBuffer[index];
  }
  for (let index = offset + 156; index < offset + 512; index++) {
    sum += arrayBuffer[index];
  }
  return readSum === sum;
}
var uint32SyncSafeToken;
var init_util = __esm({
  "node_modules/file-type/util.js"() {
    init_lib3();
    uint32SyncSafeToken = {
      get: (buffer, offset) => buffer[offset + 3] & 127 | buffer[offset + 2] << 7 | buffer[offset + 1] << 14 | buffer[offset] << 21,
      len: 4
    };
  }
});

// node_modules/file-type/supported.js
var extensions, mimeTypes;
var init_supported = __esm({
  "node_modules/file-type/supported.js"() {
    extensions = [
      "jpg",
      "png",
      "apng",
      "gif",
      "webp",
      "flif",
      "xcf",
      "cr2",
      "cr3",
      "orf",
      "arw",
      "dng",
      "nef",
      "rw2",
      "raf",
      "tif",
      "bmp",
      "icns",
      "jxr",
      "psd",
      "indd",
      "zip",
      "tar",
      "rar",
      "gz",
      "bz2",
      "7z",
      "dmg",
      "mp4",
      "mid",
      "mkv",
      "webm",
      "mov",
      "avi",
      "mpg",
      "mp2",
      "mp3",
      "m4a",
      "oga",
      "ogg",
      "ogv",
      "opus",
      "flac",
      "wav",
      "spx",
      "amr",
      "pdf",
      "epub",
      "elf",
      "macho",
      "exe",
      "swf",
      "rtf",
      "wasm",
      "woff",
      "woff2",
      "eot",
      "ttf",
      "otf",
      "ttc",
      "ico",
      "flv",
      "ps",
      "xz",
      "sqlite",
      "nes",
      "crx",
      "xpi",
      "cab",
      "deb",
      "ar",
      "rpm",
      "Z",
      "lz",
      "cfb",
      "mxf",
      "mts",
      "blend",
      "bpg",
      "docx",
      "pptx",
      "xlsx",
      "3gp",
      "3g2",
      "j2c",
      "jp2",
      "jpm",
      "jpx",
      "mj2",
      "aif",
      "qcp",
      "odt",
      "ods",
      "odp",
      "xml",
      "mobi",
      "heic",
      "cur",
      "ktx",
      "ape",
      "wv",
      "dcm",
      "ics",
      "glb",
      "pcap",
      "dsf",
      "lnk",
      "alias",
      "voc",
      "ac3",
      "m4v",
      "m4p",
      "m4b",
      "f4v",
      "f4p",
      "f4b",
      "f4a",
      "mie",
      "asf",
      "ogm",
      "ogx",
      "mpc",
      "arrow",
      "shp",
      "aac",
      "mp1",
      "it",
      "s3m",
      "xm",
      "skp",
      "avif",
      "eps",
      "lzh",
      "pgp",
      "asar",
      "stl",
      "chm",
      "3mf",
      "zst",
      "jxl",
      "vcf",
      "jls",
      "pst",
      "dwg",
      "parquet",
      "class",
      "arj",
      "cpio",
      "ace",
      "avro",
      "icc",
      "fbx",
      "vsdx",
      "vtt",
      "apk",
      "drc",
      "lz4",
      "potx",
      "xltx",
      "dotx",
      "xltm",
      "ott",
      "ots",
      "otp",
      "odg",
      "otg",
      "xlsm",
      "docm",
      "dotm",
      "potm",
      "pptm",
      "jar",
      "jmp",
      "rm",
      "sav",
      "ppsm",
      "ppsx",
      "tar.gz",
      "reg",
      "dat"
    ];
    mimeTypes = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "image/flif",
      "image/x-xcf",
      "image/x-canon-cr2",
      "image/x-canon-cr3",
      "image/tiff",
      "image/bmp",
      "image/vnd.ms-photo",
      "image/vnd.adobe.photoshop",
      "application/x-indesign",
      "application/epub+zip",
      "application/x-xpinstall",
      "application/vnd.ms-powerpoint.slideshow.macroenabled.12",
      "application/vnd.oasis.opendocument.text",
      "application/vnd.oasis.opendocument.spreadsheet",
      "application/vnd.oasis.opendocument.presentation",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.openxmlformats-officedocument.presentationml.slideshow",
      "application/zip",
      "application/x-tar",
      "application/x-rar-compressed",
      "application/gzip",
      "application/x-bzip2",
      "application/x-7z-compressed",
      "application/x-apple-diskimage",
      "application/vnd.apache.arrow.file",
      "video/mp4",
      "audio/midi",
      "video/matroska",
      "video/webm",
      "video/quicktime",
      "video/vnd.avi",
      "audio/wav",
      "audio/qcelp",
      "audio/x-ms-asf",
      "video/x-ms-asf",
      "application/vnd.ms-asf",
      "video/mpeg",
      "video/3gpp",
      "audio/mpeg",
      "audio/mp4",
      // RFC 4337
      "video/ogg",
      "audio/ogg",
      "audio/ogg; codecs=opus",
      "application/ogg",
      "audio/flac",
      "audio/ape",
      "audio/wavpack",
      "audio/amr",
      "application/pdf",
      "application/x-elf",
      "application/x-mach-binary",
      "application/x-msdownload",
      "application/x-shockwave-flash",
      "application/rtf",
      "application/wasm",
      "font/woff",
      "font/woff2",
      "application/vnd.ms-fontobject",
      "font/ttf",
      "font/otf",
      "font/collection",
      "image/x-icon",
      "video/x-flv",
      "application/postscript",
      "application/eps",
      "application/x-xz",
      "application/x-sqlite3",
      "application/x-nintendo-nes-rom",
      "application/x-google-chrome-extension",
      "application/vnd.ms-cab-compressed",
      "application/x-deb",
      "application/x-unix-archive",
      "application/x-rpm",
      "application/x-compress",
      "application/x-lzip",
      "application/x-cfb",
      "application/x-mie",
      "application/mxf",
      "video/mp2t",
      "application/x-blender",
      "image/bpg",
      "image/j2c",
      "image/jp2",
      "image/jpx",
      "image/jpm",
      "image/mj2",
      "audio/aiff",
      "application/xml",
      "application/x-mobipocket-ebook",
      "image/heif",
      "image/heif-sequence",
      "image/heic",
      "image/heic-sequence",
      "image/icns",
      "image/ktx",
      "application/dicom",
      "audio/x-musepack",
      "text/calendar",
      "text/vcard",
      "text/vtt",
      "model/gltf-binary",
      "application/vnd.tcpdump.pcap",
      "audio/x-dsf",
      // Non-standard
      "application/x.ms.shortcut",
      // Invented by us
      "application/x.apple.alias",
      // Invented by us
      "audio/x-voc",
      "audio/vnd.dolby.dd-raw",
      "audio/x-m4a",
      "image/apng",
      "image/x-olympus-orf",
      "image/x-sony-arw",
      "image/x-adobe-dng",
      "image/x-nikon-nef",
      "image/x-panasonic-rw2",
      "image/x-fujifilm-raf",
      "video/x-m4v",
      "video/3gpp2",
      "application/x-esri-shape",
      "audio/aac",
      "audio/x-it",
      "audio/x-s3m",
      "audio/x-xm",
      "video/MP1S",
      "video/MP2P",
      "application/vnd.sketchup.skp",
      "image/avif",
      "application/x-lzh-compressed",
      "application/pgp-encrypted",
      "application/x-asar",
      "model/stl",
      "application/vnd.ms-htmlhelp",
      "model/3mf",
      "image/jxl",
      "application/zstd",
      "image/jls",
      "application/vnd.ms-outlook",
      "image/vnd.dwg",
      "application/vnd.apache.parquet",
      "application/java-vm",
      "application/x-arj",
      "application/x-cpio",
      "application/x-ace-compressed",
      "application/avro",
      "application/vnd.iccprofile",
      "application/x.autodesk.fbx",
      // Invented by us
      "application/vnd.visio",
      "application/vnd.android.package-archive",
      "application/vnd.google.draco",
      // Invented by us
      "application/x-lz4",
      // Invented by us
      "application/vnd.openxmlformats-officedocument.presentationml.template",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.template",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.template",
      "application/vnd.ms-excel.template.macroenabled.12",
      "application/vnd.oasis.opendocument.text-template",
      "application/vnd.oasis.opendocument.spreadsheet-template",
      "application/vnd.oasis.opendocument.presentation-template",
      "application/vnd.oasis.opendocument.graphics",
      "application/vnd.oasis.opendocument.graphics-template",
      "application/vnd.ms-excel.sheet.macroenabled.12",
      "application/vnd.ms-word.document.macroenabled.12",
      "application/vnd.ms-word.template.macroenabled.12",
      "application/vnd.ms-powerpoint.template.macroenabled.12",
      "application/vnd.ms-powerpoint.presentation.macroenabled.12",
      "application/java-archive",
      "application/vnd.rn-realmedia",
      "application/x-spss-sav",
      "application/x-ms-regedit",
      "application/x-ft-windows-registry-hive",
      "application/x-jmp-data"
    ];
  }
});

// node_modules/file-type/core.js
function patchWebByobTokenizerClose(tokenizer) {
  const streamReader = tokenizer?.streamReader;
  if (streamReader?.constructor?.name !== "WebStreamByobReader") {
    return tokenizer;
  }
  const { reader } = streamReader;
  const cancelAndRelease = async () => {
    await reader.cancel();
    reader.releaseLock();
  };
  streamReader.close = cancelAndRelease;
  streamReader.abort = async () => {
    streamReader.interrupted = true;
    await cancelAndRelease();
  };
  return tokenizer;
}
function getSafeBound(value, maximum, reason) {
  if (!Number.isFinite(value) || value < 0 || value > maximum) {
    throw new ParserHardLimitError(`${reason} has invalid size ${value} (maximum ${maximum} bytes)`);
  }
  return value;
}
async function safeIgnore(tokenizer, length, { maximumLength = maximumUntrustedSkipSizeInBytes, reason = "skip" } = {}) {
  const safeLength = getSafeBound(length, maximumLength, reason);
  await tokenizer.ignore(safeLength);
}
async function safeReadBuffer(tokenizer, buffer, options, { maximumLength = buffer.length, reason = "read" } = {}) {
  const length = options?.length ?? buffer.length;
  const safeLength = getSafeBound(length, maximumLength, reason);
  return tokenizer.readBuffer(buffer, {
    ...options,
    length: safeLength
  });
}
async function decompressDeflateRawWithLimit(data, { maximumLength = maximumZipEntrySizeInBytes } = {}) {
  const input = new ReadableStream({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    }
  });
  const output = input.pipeThrough(new DecompressionStream("deflate-raw"));
  const reader = output.getReader();
  const chunks = [];
  let totalLength = 0;
  try {
    for (; ; ) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      totalLength += value.length;
      if (totalLength > maximumLength) {
        await reader.cancel();
        throw new Error(`ZIP entry decompressed data exceeds ${maximumLength} bytes`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const uncompressedData = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    uncompressedData.set(chunk, offset);
    offset += chunk.length;
  }
  return uncompressedData;
}
function findZipDataDescriptorOffset(buffer, bytesConsumed) {
  if (buffer.length < zipDataDescriptorLengthInBytes) {
    return -1;
  }
  const lastPossibleDescriptorOffset = buffer.length - zipDataDescriptorLengthInBytes;
  for (let index = 0; index <= lastPossibleDescriptorOffset; index++) {
    if (UINT32_LE.get(buffer, index) === zipDataDescriptorSignature && UINT32_LE.get(buffer, index + 8) === bytesConsumed + index) {
      return index;
    }
  }
  return -1;
}
function isPngAncillaryChunk(type) {
  return (type.codePointAt(0) & 32) !== 0;
}
function mergeByteChunks(chunks, totalLength) {
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}
async function readZipDataDescriptorEntryWithLimit(zipHandler, { shouldBuffer, maximumLength = maximumZipEntrySizeInBytes } = {}) {
  const { syncBuffer } = zipHandler;
  const { length: syncBufferLength } = syncBuffer;
  const chunks = [];
  let bytesConsumed = 0;
  for (; ; ) {
    const length = await zipHandler.tokenizer.peekBuffer(syncBuffer, { mayBeLess: true });
    const dataDescriptorOffset = findZipDataDescriptorOffset(syncBuffer.subarray(0, length), bytesConsumed);
    const retainedLength = dataDescriptorOffset >= 0 ? 0 : length === syncBufferLength ? Math.min(zipDataDescriptorOverlapLengthInBytes, length - 1) : 0;
    const chunkLength = dataDescriptorOffset >= 0 ? dataDescriptorOffset : length - retainedLength;
    if (chunkLength === 0) {
      break;
    }
    bytesConsumed += chunkLength;
    if (bytesConsumed > maximumLength) {
      throw new Error(`ZIP entry compressed data exceeds ${maximumLength} bytes`);
    }
    if (shouldBuffer) {
      const data = new Uint8Array(chunkLength);
      await zipHandler.tokenizer.readBuffer(data);
      chunks.push(data);
    } else {
      await zipHandler.tokenizer.ignore(chunkLength);
    }
    if (dataDescriptorOffset >= 0) {
      break;
    }
  }
  if (!hasUnknownFileSize(zipHandler.tokenizer)) {
    zipHandler.knownSizeDescriptorScannedBytes += bytesConsumed;
  }
  if (!shouldBuffer) {
    return;
  }
  return mergeByteChunks(chunks, bytesConsumed);
}
function getRemainingZipScanBudget(zipHandler, startOffset) {
  if (hasUnknownFileSize(zipHandler.tokenizer)) {
    return Math.max(0, maximumUntrustedSkipSizeInBytes - (zipHandler.tokenizer.position - startOffset));
  }
  return Math.max(0, maximumZipEntrySizeInBytes - zipHandler.knownSizeDescriptorScannedBytes);
}
async function readZipEntryData(zipHandler, zipHeader, { shouldBuffer, maximumDescriptorLength = maximumZipEntrySizeInBytes } = {}) {
  if (zipHeader.dataDescriptor && zipHeader.compressedSize === 0) {
    return readZipDataDescriptorEntryWithLimit(zipHandler, {
      shouldBuffer,
      maximumLength: maximumDescriptorLength
    });
  }
  if (!shouldBuffer) {
    await safeIgnore(zipHandler.tokenizer, zipHeader.compressedSize, {
      maximumLength: hasUnknownFileSize(zipHandler.tokenizer) ? maximumZipEntrySizeInBytes : zipHandler.tokenizer.fileInfo.size,
      reason: "ZIP entry compressed data"
    });
    return;
  }
  const maximumLength = getMaximumZipBufferedReadLength(zipHandler.tokenizer);
  if (!Number.isFinite(zipHeader.compressedSize) || zipHeader.compressedSize < 0 || zipHeader.compressedSize > maximumLength) {
    throw new Error(`ZIP entry compressed data exceeds ${maximumLength} bytes`);
  }
  const fileData = new Uint8Array(zipHeader.compressedSize);
  await zipHandler.tokenizer.readBuffer(fileData);
  return fileData;
}
function createByteLimitedReadableStream(stream, maximumBytes) {
  const reader = stream.getReader();
  let emittedBytes = 0;
  let sourceDone = false;
  let sourceCanceled = false;
  const cancelSource = async (reason) => {
    if (sourceDone || sourceCanceled) {
      return;
    }
    sourceCanceled = true;
    await reader.cancel(reason);
  };
  return new ReadableStream({
    async pull(controller) {
      if (emittedBytes >= maximumBytes) {
        controller.close();
        await cancelSource();
        return;
      }
      const { done, value } = await reader.read();
      if (done || !value) {
        sourceDone = true;
        controller.close();
        return;
      }
      const remainingBytes = maximumBytes - emittedBytes;
      if (value.length > remainingBytes) {
        controller.enqueue(value.subarray(0, remainingBytes));
        emittedBytes += remainingBytes;
        controller.close();
        await cancelSource();
        return;
      }
      controller.enqueue(value);
      emittedBytes += value.length;
    },
    async cancel(reason) {
      await cancelSource(reason);
    }
  });
}
async function fileTypeFromBuffer(input, options) {
  return new FileTypeParser(options).fromBuffer(input);
}
function getFileTypeFromMimeType(mimeType) {
  mimeType = mimeType.toLowerCase();
  switch (mimeType) {
    case "application/epub+zip":
      return {
        ext: "epub",
        mime: mimeType
      };
    case "application/vnd.oasis.opendocument.text":
      return {
        ext: "odt",
        mime: mimeType
      };
    case "application/vnd.oasis.opendocument.text-template":
      return {
        ext: "ott",
        mime: mimeType
      };
    case "application/vnd.oasis.opendocument.spreadsheet":
      return {
        ext: "ods",
        mime: mimeType
      };
    case "application/vnd.oasis.opendocument.spreadsheet-template":
      return {
        ext: "ots",
        mime: mimeType
      };
    case "application/vnd.oasis.opendocument.presentation":
      return {
        ext: "odp",
        mime: mimeType
      };
    case "application/vnd.oasis.opendocument.presentation-template":
      return {
        ext: "otp",
        mime: mimeType
      };
    case "application/vnd.oasis.opendocument.graphics":
      return {
        ext: "odg",
        mime: mimeType
      };
    case "application/vnd.oasis.opendocument.graphics-template":
      return {
        ext: "otg",
        mime: mimeType
      };
    case "application/vnd.openxmlformats-officedocument.presentationml.slideshow":
      return {
        ext: "ppsx",
        mime: mimeType
      };
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return {
        ext: "xlsx",
        mime: mimeType
      };
    case "application/vnd.ms-excel.sheet.macroenabled":
      return {
        ext: "xlsm",
        mime: "application/vnd.ms-excel.sheet.macroenabled.12"
      };
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.template":
      return {
        ext: "xltx",
        mime: mimeType
      };
    case "application/vnd.ms-excel.template.macroenabled":
      return {
        ext: "xltm",
        mime: "application/vnd.ms-excel.template.macroenabled.12"
      };
    case "application/vnd.ms-powerpoint.slideshow.macroenabled":
      return {
        ext: "ppsm",
        mime: "application/vnd.ms-powerpoint.slideshow.macroenabled.12"
      };
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return {
        ext: "docx",
        mime: mimeType
      };
    case "application/vnd.ms-word.document.macroenabled":
      return {
        ext: "docm",
        mime: "application/vnd.ms-word.document.macroenabled.12"
      };
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.template":
      return {
        ext: "dotx",
        mime: mimeType
      };
    case "application/vnd.ms-word.template.macroenabledtemplate":
      return {
        ext: "dotm",
        mime: "application/vnd.ms-word.template.macroenabled.12"
      };
    case "application/vnd.openxmlformats-officedocument.presentationml.template":
      return {
        ext: "potx",
        mime: mimeType
      };
    case "application/vnd.ms-powerpoint.template.macroenabled":
      return {
        ext: "potm",
        mime: "application/vnd.ms-powerpoint.template.macroenabled.12"
      };
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      return {
        ext: "pptx",
        mime: mimeType
      };
    case "application/vnd.ms-powerpoint.presentation.macroenabled":
      return {
        ext: "pptm",
        mime: "application/vnd.ms-powerpoint.presentation.macroenabled.12"
      };
    case "application/vnd.ms-visio.drawing":
      return {
        ext: "vsdx",
        mime: "application/vnd.visio"
      };
    case "application/vnd.ms-package.3dmanufacturing-3dmodel+xml":
      return {
        ext: "3mf",
        mime: "model/3mf"
      };
    default:
  }
}
function _check(buffer, headers, options) {
  options = {
    offset: 0,
    ...options
  };
  for (const [index, header] of headers.entries()) {
    if (options.mask) {
      if (header !== (options.mask[index] & buffer[index + options.offset])) {
        return false;
      }
    } else if (header !== buffer[index + options.offset]) {
      return false;
    }
  }
  return true;
}
function normalizeSampleSize(sampleSize) {
  if (!Number.isFinite(sampleSize)) {
    return reasonableDetectionSizeInBytes;
  }
  return Math.max(1, Math.trunc(sampleSize));
}
function readByobReaderWithSignal(reader, buffer, signal) {
  if (signal === void 0) {
    return reader.read(buffer);
  }
  signal.throwIfAborted();
  return new Promise((resolve2, reject) => {
    const cleanup = () => {
      signal.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      const abortReason = signal.reason;
      cleanup();
      (async () => {
        try {
          await reader.cancel(abortReason);
        } catch {
        }
      })();
      reject(abortReason);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    (async () => {
      try {
        const result = await reader.read(buffer);
        cleanup();
        resolve2(result);
      } catch (error) {
        cleanup();
        reject(error);
      }
    })();
  });
}
function normalizeMpegOffsetTolerance(mpegOffsetTolerance) {
  if (!Number.isFinite(mpegOffsetTolerance)) {
    return 0;
  }
  return Math.max(0, Math.min(maximumMpegOffsetTolerance, Math.trunc(mpegOffsetTolerance)));
}
function getKnownFileSizeOrMaximum(fileSize) {
  if (!Number.isFinite(fileSize)) {
    return Number.MAX_SAFE_INTEGER;
  }
  return Math.max(0, fileSize);
}
function hasUnknownFileSize(tokenizer) {
  const fileSize = tokenizer.fileInfo.size;
  return !Number.isFinite(fileSize) || fileSize === Number.MAX_SAFE_INTEGER;
}
function hasExceededUnknownSizeScanBudget(tokenizer, startOffset, maximumBytes) {
  return hasUnknownFileSize(tokenizer) && tokenizer.position - startOffset > maximumBytes;
}
function getMaximumZipBufferedReadLength(tokenizer) {
  const fileSize = tokenizer.fileInfo.size;
  const remainingBytes = Number.isFinite(fileSize) ? Math.max(0, fileSize - tokenizer.position) : Number.MAX_SAFE_INTEGER;
  return Math.min(remainingBytes, maximumZipBufferedReadSizeInBytes);
}
function isRecoverableZipError(error) {
  if (error instanceof EndOfStreamError) {
    return true;
  }
  if (error instanceof ParserHardLimitError) {
    return true;
  }
  if (!(error instanceof Error)) {
    return false;
  }
  if (recoverableZipErrorMessages.has(error.message)) {
    return true;
  }
  if (recoverableZipErrorCodes.has(error.code)) {
    return true;
  }
  for (const prefix of recoverableZipErrorMessagePrefixes) {
    if (error.message.startsWith(prefix)) {
      return true;
    }
  }
  return false;
}
function canReadZipEntryForDetection(zipHeader, maximumSize = maximumZipEntrySizeInBytes) {
  const sizes = [zipHeader.compressedSize, zipHeader.uncompressedSize];
  for (const size of sizes) {
    if (!Number.isFinite(size) || size < 0 || size > maximumSize) {
      return false;
    }
  }
  return true;
}
function createOpenXmlZipDetectionState() {
  return {
    hasContentTypesEntry: false,
    hasParsedContentTypesEntry: false,
    isParsingContentTypes: false,
    hasUnparseableContentTypes: false,
    hasWordDirectory: false,
    hasPresentationDirectory: false,
    hasSpreadsheetDirectory: false,
    hasThreeDimensionalModelEntry: false
  };
}
function updateOpenXmlZipDetectionStateFromFilename(openXmlState, filename) {
  if (filename.startsWith("word/")) {
    openXmlState.hasWordDirectory = true;
  }
  if (filename.startsWith("ppt/")) {
    openXmlState.hasPresentationDirectory = true;
  }
  if (filename.startsWith("xl/")) {
    openXmlState.hasSpreadsheetDirectory = true;
  }
  if (filename.startsWith("3D/") && filename.endsWith(".model")) {
    openXmlState.hasThreeDimensionalModelEntry = true;
  }
}
function getOpenXmlFileTypeFromZipEntries(openXmlState) {
  if (!openXmlState.hasContentTypesEntry || openXmlState.hasUnparseableContentTypes || openXmlState.isParsingContentTypes || openXmlState.hasParsedContentTypesEntry) {
    return;
  }
  if (openXmlState.hasWordDirectory) {
    return {
      ext: "docx",
      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    };
  }
  if (openXmlState.hasPresentationDirectory) {
    return {
      ext: "pptx",
      mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    };
  }
  if (openXmlState.hasSpreadsheetDirectory) {
    return {
      ext: "xlsx",
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    };
  }
  if (openXmlState.hasThreeDimensionalModelEntry) {
    return {
      ext: "3mf",
      mime: "model/3mf"
    };
  }
}
function getOpenXmlMimeTypeFromContentTypesXml(xmlContent) {
  const endPosition = xmlContent.indexOf('.main+xml"');
  if (endPosition === -1) {
    const mimeType = "application/vnd.ms-package.3dmanufacturing-3dmodel+xml";
    if (xmlContent.includes(`ContentType="${mimeType}"`)) {
      return mimeType;
    }
    return;
  }
  const truncatedContent = xmlContent.slice(0, endPosition);
  const firstQuotePosition = truncatedContent.lastIndexOf('"');
  return truncatedContent.slice(firstQuotePosition + 1);
}
var reasonableDetectionSizeInBytes, maximumMpegOffsetTolerance, maximumZipEntrySizeInBytes, maximumZipEntryCount, maximumZipBufferedReadSizeInBytes, maximumUntrustedSkipSizeInBytes, maximumUnknownSizePayloadProbeSizeInBytes, maximumZipTextEntrySizeInBytes, maximumNestedGzipDetectionSizeInBytes, maximumNestedGzipProbeDepth, unknownSizeGzipProbeTimeoutInMilliseconds, maximumId3HeaderSizeInBytes, maximumEbmlDocumentTypeSizeInBytes, maximumEbmlElementPayloadSizeInBytes, maximumEbmlElementCount, maximumPngChunkCount, maximumPngStreamScanBudgetInBytes, maximumAsfHeaderObjectCount, maximumTiffTagCount, maximumDetectionReentryCount, maximumPngChunkSizeInBytes, maximumAsfHeaderPayloadSizeInBytes, maximumTiffStreamIfdOffsetInBytes, maximumTiffIfdOffsetInBytes, recoverableZipErrorMessages, recoverableZipErrorMessagePrefixes, recoverableZipErrorCodes, ParserHardLimitError, zipDataDescriptorSignature, zipDataDescriptorLengthInBytes, zipDataDescriptorOverlapLengthInBytes, FileTypeParser, supportedExtensions, supportedMimeTypes;
var init_core2 = __esm({
  "node_modules/file-type/core.js"() {
    init_lib3();
    init_core();
    init_lib4();
    init_uint8array_extras();
    init_util();
    init_supported();
    reasonableDetectionSizeInBytes = 4100;
    maximumMpegOffsetTolerance = reasonableDetectionSizeInBytes - 2;
    maximumZipEntrySizeInBytes = 1024 * 1024;
    maximumZipEntryCount = 1024;
    maximumZipBufferedReadSizeInBytes = 2 ** 31 - 1;
    maximumUntrustedSkipSizeInBytes = 16 * 1024 * 1024;
    maximumUnknownSizePayloadProbeSizeInBytes = maximumZipEntrySizeInBytes;
    maximumZipTextEntrySizeInBytes = maximumZipEntrySizeInBytes;
    maximumNestedGzipDetectionSizeInBytes = maximumUntrustedSkipSizeInBytes;
    maximumNestedGzipProbeDepth = 1;
    unknownSizeGzipProbeTimeoutInMilliseconds = 100;
    maximumId3HeaderSizeInBytes = maximumUntrustedSkipSizeInBytes;
    maximumEbmlDocumentTypeSizeInBytes = 64;
    maximumEbmlElementPayloadSizeInBytes = maximumUnknownSizePayloadProbeSizeInBytes;
    maximumEbmlElementCount = 256;
    maximumPngChunkCount = 512;
    maximumPngStreamScanBudgetInBytes = maximumUntrustedSkipSizeInBytes;
    maximumAsfHeaderObjectCount = 512;
    maximumTiffTagCount = 512;
    maximumDetectionReentryCount = 256;
    maximumPngChunkSizeInBytes = maximumUnknownSizePayloadProbeSizeInBytes;
    maximumAsfHeaderPayloadSizeInBytes = maximumUnknownSizePayloadProbeSizeInBytes;
    maximumTiffStreamIfdOffsetInBytes = maximumUnknownSizePayloadProbeSizeInBytes;
    maximumTiffIfdOffsetInBytes = maximumUntrustedSkipSizeInBytes;
    recoverableZipErrorMessages = /* @__PURE__ */ new Set([
      "Unexpected signature",
      "Encrypted ZIP",
      "Expected Central-File-Header signature"
    ]);
    recoverableZipErrorMessagePrefixes = [
      "ZIP entry count exceeds ",
      "Unsupported ZIP compression method:",
      "ZIP entry compressed data exceeds ",
      "ZIP entry decompressed data exceeds ",
      "Expected data-descriptor-signature at position "
    ];
    recoverableZipErrorCodes = /* @__PURE__ */ new Set([
      "Z_BUF_ERROR",
      "Z_DATA_ERROR",
      "ERR_INVALID_STATE"
    ]);
    ParserHardLimitError = class extends Error {
    };
    zipDataDescriptorSignature = 134695760;
    zipDataDescriptorLengthInBytes = 16;
    zipDataDescriptorOverlapLengthInBytes = zipDataDescriptorLengthInBytes - 1;
    ZipHandler.prototype.inflate = async function(zipHeader, fileData, callback) {
      if (zipHeader.compressedMethod === 0) {
        return callback(fileData);
      }
      if (zipHeader.compressedMethod !== 8) {
        throw new Error(`Unsupported ZIP compression method: ${zipHeader.compressedMethod}`);
      }
      const uncompressedData = await decompressDeflateRawWithLimit(fileData, { maximumLength: maximumZipEntrySizeInBytes });
      return callback(uncompressedData);
    };
    ZipHandler.prototype.unzip = async function(fileCallback) {
      let stop = false;
      let zipEntryCount = 0;
      const zipScanStart = this.tokenizer.position;
      this.knownSizeDescriptorScannedBytes = 0;
      do {
        if (hasExceededUnknownSizeScanBudget(this.tokenizer, zipScanStart, maximumUntrustedSkipSizeInBytes)) {
          throw new ParserHardLimitError(`ZIP stream probing exceeds ${maximumUntrustedSkipSizeInBytes} bytes`);
        }
        const zipHeader = await this.readLocalFileHeader();
        if (!zipHeader) {
          break;
        }
        zipEntryCount++;
        if (zipEntryCount > maximumZipEntryCount) {
          throw new Error(`ZIP entry count exceeds ${maximumZipEntryCount}`);
        }
        const next = fileCallback(zipHeader);
        stop = Boolean(next.stop);
        await this.tokenizer.ignore(zipHeader.extraFieldLength);
        const fileData = await readZipEntryData(this, zipHeader, {
          shouldBuffer: Boolean(next.handler),
          maximumDescriptorLength: Math.min(maximumZipEntrySizeInBytes, getRemainingZipScanBudget(this, zipScanStart))
        });
        if (next.handler) {
          await this.inflate(zipHeader, fileData, next.handler);
        }
        if (zipHeader.dataDescriptor) {
          const dataDescriptor = new Uint8Array(zipDataDescriptorLengthInBytes);
          await this.tokenizer.readBuffer(dataDescriptor);
          if (UINT32_LE.get(dataDescriptor, 0) !== zipDataDescriptorSignature) {
            throw new Error(`Expected data-descriptor-signature at position ${this.tokenizer.position - dataDescriptor.length}`);
          }
        }
        if (hasExceededUnknownSizeScanBudget(this.tokenizer, zipScanStart, maximumUntrustedSkipSizeInBytes)) {
          throw new ParserHardLimitError(`ZIP stream probing exceeds ${maximumUntrustedSkipSizeInBytes} bytes`);
        }
      } while (!stop);
    };
    FileTypeParser = class _FileTypeParser {
      constructor(options) {
        const normalizedMpegOffsetTolerance = normalizeMpegOffsetTolerance(options?.mpegOffsetTolerance);
        this.options = {
          ...options,
          mpegOffsetTolerance: normalizedMpegOffsetTolerance
        };
        this.detectors = [
          ...this.options.customDetectors ?? [],
          { id: "core", detect: this.detectConfident },
          { id: "core.imprecise", detect: this.detectImprecise }
        ];
        this.tokenizerOptions = {
          abortSignal: this.options.signal
        };
        this.gzipProbeDepth = 0;
      }
      getTokenizerOptions() {
        return {
          ...this.tokenizerOptions
        };
      }
      createTokenizerFromWebStream(stream) {
        return patchWebByobTokenizerClose(fromWebStream(stream, this.getTokenizerOptions()));
      }
      async parseTokenizer(tokenizer, detectionReentryCount = 0) {
        this.detectionReentryCount = detectionReentryCount;
        const initialPosition = tokenizer.position;
        for (const detector of this.detectors) {
          let fileType;
          try {
            fileType = await detector.detect(tokenizer);
          } catch (error) {
            if (error instanceof EndOfStreamError) {
              return;
            }
            if (error instanceof ParserHardLimitError) {
              return;
            }
            throw error;
          }
          if (fileType) {
            return fileType;
          }
          if (initialPosition !== tokenizer.position) {
            return void 0;
          }
        }
      }
      async fromTokenizer(tokenizer) {
        try {
          return await this.parseTokenizer(tokenizer);
        } finally {
          await tokenizer.close();
        }
      }
      async fromBuffer(input) {
        if (!(input instanceof Uint8Array || input instanceof ArrayBuffer)) {
          throw new TypeError(`Expected the \`input\` argument to be of type \`Uint8Array\` or \`ArrayBuffer\`, got \`${typeof input}\``);
        }
        const buffer = input instanceof Uint8Array ? input : new Uint8Array(input);
        if (!(buffer?.length > 1)) {
          return;
        }
        return this.fromTokenizer(fromBuffer(buffer, this.getTokenizerOptions()));
      }
      async fromBlob(blob) {
        this.options.signal?.throwIfAborted();
        const tokenizer = fromBlob(blob, this.getTokenizerOptions());
        return this.fromTokenizer(tokenizer);
      }
      async fromStream(stream) {
        this.options.signal?.throwIfAborted();
        const tokenizer = this.createTokenizerFromWebStream(stream);
        return this.fromTokenizer(tokenizer);
      }
      async toDetectionStream(stream, options) {
        const sampleSize = normalizeSampleSize(options?.sampleSize ?? reasonableDetectionSizeInBytes);
        let detectedFileType;
        let firstChunk;
        const reader = stream.getReader({ mode: "byob" });
        try {
          const { value: chunk, done } = await readByobReaderWithSignal(reader, new Uint8Array(sampleSize), this.options.signal);
          firstChunk = chunk;
          if (!done && chunk) {
            try {
              detectedFileType = await this.fromBuffer(chunk.subarray(0, sampleSize));
            } catch (error) {
              if (!(error instanceof EndOfStreamError)) {
                throw error;
              }
              detectedFileType = void 0;
            }
          }
          firstChunk = chunk;
        } finally {
          reader.releaseLock();
        }
        const transformStream = new TransformStream({
          async start(controller) {
            controller.enqueue(firstChunk);
          },
          transform(chunk, controller) {
            controller.enqueue(chunk);
          }
        });
        const newStream = stream.pipeThrough(transformStream);
        newStream.fileType = detectedFileType;
        return newStream;
      }
      async detectGzip(tokenizer) {
        if (this.gzipProbeDepth >= maximumNestedGzipProbeDepth) {
          return {
            ext: "gz",
            mime: "application/gzip"
          };
        }
        const gzipHandler = new GzipHandler(tokenizer);
        const limitedInflatedStream = createByteLimitedReadableStream(gzipHandler.inflate(), maximumNestedGzipDetectionSizeInBytes);
        const hasUnknownSize = hasUnknownFileSize(tokenizer);
        let timeout;
        let probeSignal;
        let probeParser;
        let compressedFileType;
        if (hasUnknownSize) {
          const timeoutController = new AbortController();
          timeout = setTimeout(() => {
            timeoutController.abort(new DOMException(`Operation timed out after ${unknownSizeGzipProbeTimeoutInMilliseconds} ms`, "TimeoutError"));
          }, unknownSizeGzipProbeTimeoutInMilliseconds);
          probeSignal = this.options.signal === void 0 ? timeoutController.signal : AbortSignal.any([this.options.signal, timeoutController.signal]);
          probeParser = new _FileTypeParser({
            ...this.options,
            signal: probeSignal
          });
          probeParser.gzipProbeDepth = this.gzipProbeDepth + 1;
        } else {
          this.gzipProbeDepth++;
        }
        try {
          compressedFileType = await (probeParser ?? this).fromStream(limitedInflatedStream);
        } catch (error) {
          if (error?.name === "AbortError" && probeSignal?.reason?.name !== "TimeoutError") {
            throw error;
          }
        } finally {
          clearTimeout(timeout);
          if (!hasUnknownSize) {
            this.gzipProbeDepth--;
          }
        }
        if (compressedFileType?.ext === "tar") {
          return {
            ext: "tar.gz",
            mime: "application/gzip"
          };
        }
        return {
          ext: "gz",
          mime: "application/gzip"
        };
      }
      check(header, options) {
        return _check(this.buffer, header, options);
      }
      checkString(header, options) {
        return this.check(stringToBytes(header, options?.encoding), options);
      }
      // Detections with a high degree of certainty in identifying the correct file type
      detectConfident = async (tokenizer) => {
        this.buffer = new Uint8Array(reasonableDetectionSizeInBytes);
        if (tokenizer.fileInfo.size === void 0) {
          tokenizer.fileInfo.size = Number.MAX_SAFE_INTEGER;
        }
        this.tokenizer = tokenizer;
        if (hasUnknownFileSize(tokenizer)) {
          await tokenizer.peekBuffer(this.buffer, { length: 3, mayBeLess: true });
          if (this.check([31, 139, 8])) {
            return this.detectGzip(tokenizer);
          }
        }
        await tokenizer.peekBuffer(this.buffer, { length: 32, mayBeLess: true });
        if (this.check([66, 77])) {
          return {
            ext: "bmp",
            mime: "image/bmp"
          };
        }
        if (this.check([11, 119])) {
          return {
            ext: "ac3",
            mime: "audio/vnd.dolby.dd-raw"
          };
        }
        if (this.check([120, 1])) {
          return {
            ext: "dmg",
            mime: "application/x-apple-diskimage"
          };
        }
        if (this.check([77, 90])) {
          return {
            ext: "exe",
            mime: "application/x-msdownload"
          };
        }
        if (this.check([37, 33])) {
          await tokenizer.peekBuffer(this.buffer, { length: 24, mayBeLess: true });
          if (this.checkString("PS-Adobe-", { offset: 2 }) && this.checkString(" EPSF-", { offset: 14 })) {
            return {
              ext: "eps",
              mime: "application/eps"
            };
          }
          return {
            ext: "ps",
            mime: "application/postscript"
          };
        }
        if (this.check([31, 160]) || this.check([31, 157])) {
          return {
            ext: "Z",
            mime: "application/x-compress"
          };
        }
        if (this.check([199, 113])) {
          return {
            ext: "cpio",
            mime: "application/x-cpio"
          };
        }
        if (this.check([96, 234])) {
          return {
            ext: "arj",
            mime: "application/x-arj"
          };
        }
        if (this.check([239, 187, 191])) {
          if (this.detectionReentryCount >= maximumDetectionReentryCount) {
            return;
          }
          this.detectionReentryCount++;
          await this.tokenizer.ignore(3);
          return this.detectConfident(tokenizer);
        }
        if (this.check([71, 73, 70])) {
          return {
            ext: "gif",
            mime: "image/gif"
          };
        }
        if (this.check([73, 73, 188])) {
          return {
            ext: "jxr",
            mime: "image/vnd.ms-photo"
          };
        }
        if (this.check([31, 139, 8])) {
          return this.detectGzip(tokenizer);
        }
        if (this.check([66, 90, 104])) {
          return {
            ext: "bz2",
            mime: "application/x-bzip2"
          };
        }
        if (this.checkString("ID3")) {
          await safeIgnore(tokenizer, 6, {
            maximumLength: 6,
            reason: "ID3 header prefix"
          });
          const id3HeaderLength = await tokenizer.readToken(uint32SyncSafeToken);
          const isUnknownFileSize = hasUnknownFileSize(tokenizer);
          if (!Number.isFinite(id3HeaderLength) || id3HeaderLength < 0 || isUnknownFileSize && (id3HeaderLength > maximumId3HeaderSizeInBytes || tokenizer.position + id3HeaderLength > maximumId3HeaderSizeInBytes)) {
            return;
          }
          if (tokenizer.position + id3HeaderLength > tokenizer.fileInfo.size) {
            if (isUnknownFileSize) {
              return;
            }
            return {
              ext: "mp3",
              mime: "audio/mpeg"
            };
          }
          try {
            await safeIgnore(tokenizer, id3HeaderLength, {
              maximumLength: isUnknownFileSize ? maximumId3HeaderSizeInBytes : tokenizer.fileInfo.size,
              reason: "ID3 payload"
            });
          } catch (error) {
            if (error instanceof EndOfStreamError) {
              return;
            }
            throw error;
          }
          if (this.detectionReentryCount >= maximumDetectionReentryCount) {
            return;
          }
          this.detectionReentryCount++;
          return this.parseTokenizer(tokenizer, this.detectionReentryCount);
        }
        if (this.checkString("MP+")) {
          return {
            ext: "mpc",
            mime: "audio/x-musepack"
          };
        }
        if ((this.buffer[0] === 67 || this.buffer[0] === 70) && this.check([87, 83], { offset: 1 })) {
          return {
            ext: "swf",
            mime: "application/x-shockwave-flash"
          };
        }
        if (this.check([255, 216, 255])) {
          if (this.check([247], { offset: 3 })) {
            return {
              ext: "jls",
              mime: "image/jls"
            };
          }
          return {
            ext: "jpg",
            mime: "image/jpeg"
          };
        }
        if (this.check([79, 98, 106, 1])) {
          return {
            ext: "avro",
            mime: "application/avro"
          };
        }
        if (this.checkString("FLIF")) {
          return {
            ext: "flif",
            mime: "image/flif"
          };
        }
        if (this.checkString("8BPS")) {
          return {
            ext: "psd",
            mime: "image/vnd.adobe.photoshop"
          };
        }
        if (this.checkString("MPCK")) {
          return {
            ext: "mpc",
            mime: "audio/x-musepack"
          };
        }
        if (this.checkString("FORM")) {
          return {
            ext: "aif",
            mime: "audio/aiff"
          };
        }
        if (this.checkString("icns", { offset: 0 })) {
          return {
            ext: "icns",
            mime: "image/icns"
          };
        }
        if (this.check([80, 75, 3, 4])) {
          let fileType;
          const openXmlState = createOpenXmlZipDetectionState();
          try {
            await new ZipHandler(tokenizer).unzip((zipHeader) => {
              updateOpenXmlZipDetectionStateFromFilename(openXmlState, zipHeader.filename);
              const isOpenXmlContentTypesEntry = zipHeader.filename === "[Content_Types].xml";
              const openXmlFileTypeFromEntries = getOpenXmlFileTypeFromZipEntries(openXmlState);
              if (!isOpenXmlContentTypesEntry && openXmlFileTypeFromEntries) {
                fileType = openXmlFileTypeFromEntries;
                return {
                  stop: true
                };
              }
              switch (zipHeader.filename) {
                case "META-INF/mozilla.rsa":
                  fileType = {
                    ext: "xpi",
                    mime: "application/x-xpinstall"
                  };
                  return {
                    stop: true
                  };
                case "META-INF/MANIFEST.MF":
                  fileType = {
                    ext: "jar",
                    mime: "application/java-archive"
                  };
                  return {
                    stop: true
                  };
                case "mimetype":
                  if (!canReadZipEntryForDetection(zipHeader, maximumZipTextEntrySizeInBytes)) {
                    return {};
                  }
                  return {
                    async handler(fileData) {
                      const mimeType = new TextDecoder("utf-8").decode(fileData).trim();
                      fileType = getFileTypeFromMimeType(mimeType);
                    },
                    stop: true
                  };
                case "[Content_Types].xml": {
                  openXmlState.hasContentTypesEntry = true;
                  if (!canReadZipEntryForDetection(zipHeader, maximumZipTextEntrySizeInBytes)) {
                    openXmlState.hasUnparseableContentTypes = true;
                    return {};
                  }
                  openXmlState.isParsingContentTypes = true;
                  return {
                    async handler(fileData) {
                      const xmlContent = new TextDecoder("utf-8").decode(fileData);
                      const mimeType = getOpenXmlMimeTypeFromContentTypesXml(xmlContent);
                      if (mimeType) {
                        fileType = getFileTypeFromMimeType(mimeType);
                      }
                      openXmlState.hasParsedContentTypesEntry = true;
                      openXmlState.isParsingContentTypes = false;
                    },
                    stop: true
                  };
                }
                default:
                  if (/classes\d*\.dex/.test(zipHeader.filename)) {
                    fileType = {
                      ext: "apk",
                      mime: "application/vnd.android.package-archive"
                    };
                    return { stop: true };
                  }
                  return {};
              }
            });
          } catch (error) {
            if (!isRecoverableZipError(error)) {
              throw error;
            }
            if (openXmlState.isParsingContentTypes) {
              openXmlState.isParsingContentTypes = false;
              openXmlState.hasUnparseableContentTypes = true;
            }
          }
          return fileType ?? getOpenXmlFileTypeFromZipEntries(openXmlState) ?? {
            ext: "zip",
            mime: "application/zip"
          };
        }
        if (this.checkString("OggS")) {
          await tokenizer.ignore(28);
          const type = new Uint8Array(8);
          await tokenizer.readBuffer(type);
          if (_check(type, [79, 112, 117, 115, 72, 101, 97, 100])) {
            return {
              ext: "opus",
              mime: "audio/ogg; codecs=opus"
            };
          }
          if (_check(type, [128, 116, 104, 101, 111, 114, 97])) {
            return {
              ext: "ogv",
              mime: "video/ogg"
            };
          }
          if (_check(type, [1, 118, 105, 100, 101, 111, 0])) {
            return {
              ext: "ogm",
              mime: "video/ogg"
            };
          }
          if (_check(type, [127, 70, 76, 65, 67])) {
            return {
              ext: "oga",
              mime: "audio/ogg"
            };
          }
          if (_check(type, [83, 112, 101, 101, 120, 32, 32])) {
            return {
              ext: "spx",
              mime: "audio/ogg"
            };
          }
          if (_check(type, [1, 118, 111, 114, 98, 105, 115])) {
            return {
              ext: "ogg",
              mime: "audio/ogg"
            };
          }
          return {
            ext: "ogx",
            mime: "application/ogg"
          };
        }
        if (this.check([80, 75]) && (this.buffer[2] === 3 || this.buffer[2] === 5 || this.buffer[2] === 7) && (this.buffer[3] === 4 || this.buffer[3] === 6 || this.buffer[3] === 8)) {
          return {
            ext: "zip",
            mime: "application/zip"
          };
        }
        if (this.checkString("MThd")) {
          return {
            ext: "mid",
            mime: "audio/midi"
          };
        }
        if (this.checkString("wOFF") && (this.check([0, 1, 0, 0], { offset: 4 }) || this.checkString("OTTO", { offset: 4 }))) {
          return {
            ext: "woff",
            mime: "font/woff"
          };
        }
        if (this.checkString("wOF2") && (this.check([0, 1, 0, 0], { offset: 4 }) || this.checkString("OTTO", { offset: 4 }))) {
          return {
            ext: "woff2",
            mime: "font/woff2"
          };
        }
        if (this.check([212, 195, 178, 161]) || this.check([161, 178, 195, 212])) {
          return {
            ext: "pcap",
            mime: "application/vnd.tcpdump.pcap"
          };
        }
        if (this.checkString("DSD ")) {
          return {
            ext: "dsf",
            mime: "audio/x-dsf"
            // Non-standard
          };
        }
        if (this.checkString("LZIP")) {
          return {
            ext: "lz",
            mime: "application/x-lzip"
          };
        }
        if (this.checkString("fLaC")) {
          return {
            ext: "flac",
            mime: "audio/flac"
          };
        }
        if (this.check([66, 80, 71, 251])) {
          return {
            ext: "bpg",
            mime: "image/bpg"
          };
        }
        if (this.checkString("wvpk")) {
          return {
            ext: "wv",
            mime: "audio/wavpack"
          };
        }
        if (this.checkString("%PDF")) {
          return {
            ext: "pdf",
            mime: "application/pdf"
          };
        }
        if (this.check([0, 97, 115, 109])) {
          return {
            ext: "wasm",
            mime: "application/wasm"
          };
        }
        if (this.check([73, 73])) {
          const fileType = await this.readTiffHeader(false);
          if (fileType) {
            return fileType;
          }
        }
        if (this.check([77, 77])) {
          const fileType = await this.readTiffHeader(true);
          if (fileType) {
            return fileType;
          }
        }
        if (this.checkString("MAC ")) {
          return {
            ext: "ape",
            mime: "audio/ape"
          };
        }
        if (this.check([26, 69, 223, 163])) {
          async function readField() {
            const msb = await tokenizer.peekNumber(UINT8);
            let mask = 128;
            let ic = 0;
            while ((msb & mask) === 0 && mask !== 0) {
              ++ic;
              mask >>= 1;
            }
            const id = new Uint8Array(ic + 1);
            await safeReadBuffer(tokenizer, id, void 0, {
              maximumLength: id.length,
              reason: "EBML field"
            });
            return id;
          }
          async function readElement() {
            const idField = await readField();
            const lengthField = await readField();
            lengthField[0] ^= 128 >> lengthField.length - 1;
            const nrLength = Math.min(6, lengthField.length);
            const idView = new DataView(idField.buffer);
            const lengthView = new DataView(lengthField.buffer, lengthField.length - nrLength, nrLength);
            return {
              id: getUintBE(idView),
              len: getUintBE(lengthView)
            };
          }
          async function readChildren(children) {
            let ebmlElementCount = 0;
            while (children > 0) {
              ebmlElementCount++;
              if (ebmlElementCount > maximumEbmlElementCount) {
                return;
              }
              if (hasExceededUnknownSizeScanBudget(tokenizer, ebmlScanStart, maximumUntrustedSkipSizeInBytes)) {
                return;
              }
              const previousPosition = tokenizer.position;
              const element = await readElement();
              if (element.id === 17026) {
                if (element.len > maximumEbmlDocumentTypeSizeInBytes) {
                  return;
                }
                const documentTypeLength = getSafeBound(element.len, maximumEbmlDocumentTypeSizeInBytes, "EBML DocType");
                const rawValue = await tokenizer.readToken(new StringType(documentTypeLength));
                return rawValue.replaceAll(/\00.*$/g, "");
              }
              if (hasUnknownFileSize(tokenizer) && (!Number.isFinite(element.len) || element.len < 0 || element.len > maximumEbmlElementPayloadSizeInBytes)) {
                return;
              }
              await safeIgnore(tokenizer, element.len, {
                maximumLength: hasUnknownFileSize(tokenizer) ? maximumEbmlElementPayloadSizeInBytes : tokenizer.fileInfo.size,
                reason: "EBML payload"
              });
              --children;
              if (tokenizer.position <= previousPosition) {
                return;
              }
            }
          }
          const rootElement = await readElement();
          const ebmlScanStart = tokenizer.position;
          const documentType = await readChildren(rootElement.len);
          switch (documentType) {
            case "webm":
              return {
                ext: "webm",
                mime: "video/webm"
              };
            case "matroska":
              return {
                ext: "mkv",
                mime: "video/matroska"
              };
            default:
              return;
          }
        }
        if (this.checkString("SQLi")) {
          return {
            ext: "sqlite",
            mime: "application/x-sqlite3"
          };
        }
        if (this.check([78, 69, 83, 26])) {
          return {
            ext: "nes",
            mime: "application/x-nintendo-nes-rom"
          };
        }
        if (this.checkString("Cr24")) {
          return {
            ext: "crx",
            mime: "application/x-google-chrome-extension"
          };
        }
        if (this.checkString("MSCF") || this.checkString("ISc(")) {
          return {
            ext: "cab",
            mime: "application/vnd.ms-cab-compressed"
          };
        }
        if (this.check([237, 171, 238, 219])) {
          return {
            ext: "rpm",
            mime: "application/x-rpm"
          };
        }
        if (this.check([197, 208, 211, 198])) {
          return {
            ext: "eps",
            mime: "application/eps"
          };
        }
        if (this.check([40, 181, 47, 253])) {
          return {
            ext: "zst",
            mime: "application/zstd"
          };
        }
        if (this.check([127, 69, 76, 70])) {
          return {
            ext: "elf",
            mime: "application/x-elf"
          };
        }
        if (this.check([33, 66, 68, 78])) {
          return {
            ext: "pst",
            mime: "application/vnd.ms-outlook"
          };
        }
        if (this.checkString("PAR1") || this.checkString("PARE")) {
          return {
            ext: "parquet",
            mime: "application/vnd.apache.parquet"
          };
        }
        if (this.checkString("ttcf")) {
          return {
            ext: "ttc",
            mime: "font/collection"
          };
        }
        if (this.check([254, 237, 250, 206]) || this.check([254, 237, 250, 207]) || this.check([206, 250, 237, 254]) || this.check([207, 250, 237, 254])) {
          return {
            ext: "macho",
            mime: "application/x-mach-binary"
          };
        }
        if (this.check([4, 34, 77, 24])) {
          return {
            ext: "lz4",
            mime: "application/x-lz4"
            // Invented by us
          };
        }
        if (this.checkString("regf")) {
          return {
            ext: "dat",
            mime: "application/x-ft-windows-registry-hive"
          };
        }
        if (this.checkString("$FL2") || this.checkString("$FL3")) {
          return {
            ext: "sav",
            mime: "application/x-spss-sav"
          };
        }
        if (this.check([79, 84, 84, 79, 0])) {
          return {
            ext: "otf",
            mime: "font/otf"
          };
        }
        if (this.checkString("#!AMR")) {
          return {
            ext: "amr",
            mime: "audio/amr"
          };
        }
        if (this.checkString("{\\rtf")) {
          return {
            ext: "rtf",
            mime: "application/rtf"
          };
        }
        if (this.check([70, 76, 86, 1])) {
          return {
            ext: "flv",
            mime: "video/x-flv"
          };
        }
        if (this.checkString("IMPM")) {
          return {
            ext: "it",
            mime: "audio/x-it"
          };
        }
        if (this.checkString("-lh0-", { offset: 2 }) || this.checkString("-lh1-", { offset: 2 }) || this.checkString("-lh2-", { offset: 2 }) || this.checkString("-lh3-", { offset: 2 }) || this.checkString("-lh4-", { offset: 2 }) || this.checkString("-lh5-", { offset: 2 }) || this.checkString("-lh6-", { offset: 2 }) || this.checkString("-lh7-", { offset: 2 }) || this.checkString("-lzs-", { offset: 2 }) || this.checkString("-lz4-", { offset: 2 }) || this.checkString("-lz5-", { offset: 2 }) || this.checkString("-lhd-", { offset: 2 })) {
          return {
            ext: "lzh",
            mime: "application/x-lzh-compressed"
          };
        }
        if (this.check([0, 0, 1, 186])) {
          if (this.check([33], { offset: 4, mask: [241] })) {
            return {
              ext: "mpg",
              // May also be .ps, .mpeg
              mime: "video/MP1S"
            };
          }
          if (this.check([68], { offset: 4, mask: [196] })) {
            return {
              ext: "mpg",
              // May also be .mpg, .m2p, .vob or .sub
              mime: "video/MP2P"
            };
          }
        }
        if (this.checkString("ITSF")) {
          return {
            ext: "chm",
            mime: "application/vnd.ms-htmlhelp"
          };
        }
        if (this.check([202, 254, 186, 190])) {
          const machOArchitectureCount = UINT32_BE.get(this.buffer, 4);
          const javaClassFileMajorVersion = UINT16_BE.get(this.buffer, 6);
          if (machOArchitectureCount > 0 && machOArchitectureCount <= 30) {
            return {
              ext: "macho",
              mime: "application/x-mach-binary"
            };
          }
          if (javaClassFileMajorVersion > 30) {
            return {
              ext: "class",
              mime: "application/java-vm"
            };
          }
        }
        if (this.checkString(".RMF")) {
          return {
            ext: "rm",
            mime: "application/vnd.rn-realmedia"
          };
        }
        if (this.checkString("DRACO")) {
          return {
            ext: "drc",
            mime: "application/vnd.google.draco"
            // Invented by us
          };
        }
        if (this.check([253, 55, 122, 88, 90, 0])) {
          return {
            ext: "xz",
            mime: "application/x-xz"
          };
        }
        if (this.checkString("<?xml ")) {
          return {
            ext: "xml",
            mime: "application/xml"
          };
        }
        if (this.check([55, 122, 188, 175, 39, 28])) {
          return {
            ext: "7z",
            mime: "application/x-7z-compressed"
          };
        }
        if (this.check([82, 97, 114, 33, 26, 7]) && (this.buffer[6] === 0 || this.buffer[6] === 1)) {
          return {
            ext: "rar",
            mime: "application/x-rar-compressed"
          };
        }
        if (this.checkString("solid ")) {
          return {
            ext: "stl",
            mime: "model/stl"
          };
        }
        if (this.checkString("AC")) {
          const version = new StringType(4, "latin1").get(this.buffer, 2);
          if (version.match("^d*") && version >= 1e3 && version <= 1050) {
            return {
              ext: "dwg",
              mime: "image/vnd.dwg"
            };
          }
        }
        if (this.checkString("070707")) {
          return {
            ext: "cpio",
            mime: "application/x-cpio"
          };
        }
        if (this.checkString("BLENDER")) {
          return {
            ext: "blend",
            mime: "application/x-blender"
          };
        }
        if (this.checkString("!<arch>")) {
          await tokenizer.ignore(8);
          const string = await tokenizer.readToken(new StringType(13, "ascii"));
          if (string === "debian-binary") {
            return {
              ext: "deb",
              mime: "application/x-deb"
            };
          }
          return {
            ext: "ar",
            mime: "application/x-unix-archive"
          };
        }
        if (this.checkString("WEBVTT") && // One of LF, CR, tab, space, or end of file must follow "WEBVTT" per the spec (see `fixture/fixture-vtt-*.vtt` for examples). Note that `\0` is technically the null character (there is no such thing as an EOF character). However, checking for `\0` gives us the same result as checking for the end of the stream.
        ["\n", "\r", "	", " ", "\0"].some((char7) => this.checkString(char7, { offset: 6 }))) {
          return {
            ext: "vtt",
            mime: "text/vtt"
          };
        }
        if (this.check([137, 80, 78, 71, 13, 10, 26, 10])) {
          const pngFileType = {
            ext: "png",
            mime: "image/png"
          };
          const apngFileType = {
            ext: "apng",
            mime: "image/apng"
          };
          await tokenizer.ignore(8);
          async function readChunkHeader() {
            return {
              length: await tokenizer.readToken(INT32_BE),
              type: await tokenizer.readToken(new StringType(4, "latin1"))
            };
          }
          const isUnknownPngStream = hasUnknownFileSize(tokenizer);
          const pngScanStart = tokenizer.position;
          let pngChunkCount = 0;
          let hasSeenImageHeader = false;
          do {
            pngChunkCount++;
            if (pngChunkCount > maximumPngChunkCount) {
              break;
            }
            if (hasExceededUnknownSizeScanBudget(tokenizer, pngScanStart, maximumPngStreamScanBudgetInBytes)) {
              break;
            }
            const previousPosition = tokenizer.position;
            const chunk = await readChunkHeader();
            if (chunk.length < 0) {
              return;
            }
            if (chunk.type === "IHDR") {
              if (chunk.length !== 13) {
                return;
              }
              hasSeenImageHeader = true;
            }
            switch (chunk.type) {
              case "IDAT":
                return pngFileType;
              case "acTL":
                return apngFileType;
              default:
                if (!hasSeenImageHeader && chunk.type !== "CgBI") {
                  return;
                }
                if (isUnknownPngStream && chunk.length > maximumPngChunkSizeInBytes) {
                  return hasSeenImageHeader && isPngAncillaryChunk(chunk.type) ? pngFileType : void 0;
                }
                try {
                  await safeIgnore(tokenizer, chunk.length + 4, {
                    maximumLength: isUnknownPngStream ? maximumPngChunkSizeInBytes + 4 : tokenizer.fileInfo.size,
                    reason: "PNG chunk payload"
                  });
                } catch (error) {
                  if (!isUnknownPngStream && (error instanceof ParserHardLimitError || error instanceof EndOfStreamError)) {
                    return pngFileType;
                  }
                  throw error;
                }
            }
            if (tokenizer.position <= previousPosition) {
              break;
            }
          } while (tokenizer.position + 8 < tokenizer.fileInfo.size);
          return pngFileType;
        }
        if (this.check([65, 82, 82, 79, 87, 49, 0, 0])) {
          return {
            ext: "arrow",
            mime: "application/vnd.apache.arrow.file"
          };
        }
        if (this.check([103, 108, 84, 70, 2, 0, 0, 0])) {
          return {
            ext: "glb",
            mime: "model/gltf-binary"
          };
        }
        if (this.check([102, 114, 101, 101], { offset: 4 }) || this.check([109, 100, 97, 116], { offset: 4 }) || this.check([109, 111, 111, 118], { offset: 4 }) || this.check([119, 105, 100, 101], { offset: 4 })) {
          return {
            ext: "mov",
            mime: "video/quicktime"
          };
        }
        if (this.check([73, 73, 82, 79, 8, 0, 0, 0, 24])) {
          return {
            ext: "orf",
            mime: "image/x-olympus-orf"
          };
        }
        if (this.checkString("gimp xcf ")) {
          return {
            ext: "xcf",
            mime: "image/x-xcf"
          };
        }
        if (this.checkString("ftyp", { offset: 4 }) && (this.buffer[8] & 96) !== 0) {
          const brandMajor = new StringType(4, "latin1").get(this.buffer, 8).replace("\0", " ").trim();
          switch (brandMajor) {
            case "avif":
            case "avis":
              return { ext: "avif", mime: "image/avif" };
            case "mif1":
              return { ext: "heic", mime: "image/heif" };
            case "msf1":
              return { ext: "heic", mime: "image/heif-sequence" };
            case "heic":
            case "heix":
              return { ext: "heic", mime: "image/heic" };
            case "hevc":
            case "hevx":
              return { ext: "heic", mime: "image/heic-sequence" };
            case "qt":
              return { ext: "mov", mime: "video/quicktime" };
            case "M4V":
            case "M4VH":
            case "M4VP":
              return { ext: "m4v", mime: "video/x-m4v" };
            case "M4P":
              return { ext: "m4p", mime: "video/mp4" };
            case "M4B":
              return { ext: "m4b", mime: "audio/mp4" };
            case "M4A":
              return { ext: "m4a", mime: "audio/x-m4a" };
            case "F4V":
              return { ext: "f4v", mime: "video/mp4" };
            case "F4P":
              return { ext: "f4p", mime: "video/mp4" };
            case "F4A":
              return { ext: "f4a", mime: "audio/mp4" };
            case "F4B":
              return { ext: "f4b", mime: "audio/mp4" };
            case "crx":
              return { ext: "cr3", mime: "image/x-canon-cr3" };
            default:
              if (brandMajor.startsWith("3g")) {
                if (brandMajor.startsWith("3g2")) {
                  return { ext: "3g2", mime: "video/3gpp2" };
                }
                return { ext: "3gp", mime: "video/3gpp" };
              }
              return { ext: "mp4", mime: "video/mp4" };
          }
        }
        if (this.checkString("REGEDIT4\r\n")) {
          return {
            ext: "reg",
            mime: "application/x-ms-regedit"
          };
        }
        if (this.check([82, 73, 70, 70])) {
          if (this.checkString("WEBP", { offset: 8 })) {
            return {
              ext: "webp",
              mime: "image/webp"
            };
          }
          if (this.check([65, 86, 73], { offset: 8 })) {
            return {
              ext: "avi",
              mime: "video/vnd.avi"
            };
          }
          if (this.check([87, 65, 86, 69], { offset: 8 })) {
            return {
              ext: "wav",
              mime: "audio/wav"
            };
          }
          if (this.check([81, 76, 67, 77], { offset: 8 })) {
            return {
              ext: "qcp",
              mime: "audio/qcelp"
            };
          }
        }
        if (this.check([73, 73, 85, 0, 24, 0, 0, 0, 136, 231, 116, 216])) {
          return {
            ext: "rw2",
            mime: "image/x-panasonic-rw2"
          };
        }
        if (this.check([48, 38, 178, 117, 142, 102, 207, 17, 166, 217])) {
          let isMalformedAsf = false;
          try {
            async function readHeader() {
              const guid = new Uint8Array(16);
              await safeReadBuffer(tokenizer, guid, void 0, {
                maximumLength: guid.length,
                reason: "ASF header GUID"
              });
              return {
                id: guid,
                size: Number(await tokenizer.readToken(UINT64_LE))
              };
            }
            await safeIgnore(tokenizer, 30, {
              maximumLength: 30,
              reason: "ASF header prelude"
            });
            const isUnknownFileSize = hasUnknownFileSize(tokenizer);
            const asfHeaderScanStart = tokenizer.position;
            let asfHeaderObjectCount = 0;
            while (tokenizer.position + 24 < tokenizer.fileInfo.size) {
              asfHeaderObjectCount++;
              if (asfHeaderObjectCount > maximumAsfHeaderObjectCount) {
                break;
              }
              if (hasExceededUnknownSizeScanBudget(tokenizer, asfHeaderScanStart, maximumUntrustedSkipSizeInBytes)) {
                break;
              }
              const previousPosition = tokenizer.position;
              const header = await readHeader();
              let payload = header.size - 24;
              if (!Number.isFinite(payload) || payload < 0) {
                isMalformedAsf = true;
                break;
              }
              if (_check(header.id, [145, 7, 220, 183, 183, 169, 207, 17, 142, 230, 0, 192, 12, 32, 83, 101])) {
                const typeId = new Uint8Array(16);
                payload -= await safeReadBuffer(tokenizer, typeId, void 0, {
                  maximumLength: typeId.length,
                  reason: "ASF stream type GUID"
                });
                if (_check(typeId, [64, 158, 105, 248, 77, 91, 207, 17, 168, 253, 0, 128, 95, 92, 68, 43])) {
                  return {
                    ext: "asf",
                    mime: "audio/x-ms-asf"
                  };
                }
                if (_check(typeId, [192, 239, 25, 188, 77, 91, 207, 17, 168, 253, 0, 128, 95, 92, 68, 43])) {
                  return {
                    ext: "asf",
                    mime: "video/x-ms-asf"
                  };
                }
                break;
              }
              if (isUnknownFileSize && payload > maximumAsfHeaderPayloadSizeInBytes) {
                isMalformedAsf = true;
                break;
              }
              await safeIgnore(tokenizer, payload, {
                maximumLength: isUnknownFileSize ? maximumAsfHeaderPayloadSizeInBytes : tokenizer.fileInfo.size,
                reason: "ASF header payload"
              });
              if (tokenizer.position <= previousPosition) {
                isMalformedAsf = true;
                break;
              }
            }
          } catch (error) {
            if (error instanceof EndOfStreamError || error instanceof ParserHardLimitError) {
              if (hasUnknownFileSize(tokenizer)) {
                isMalformedAsf = true;
              }
            } else {
              throw error;
            }
          }
          if (isMalformedAsf) {
            return;
          }
          return {
            ext: "asf",
            mime: "application/vnd.ms-asf"
          };
        }
        if (this.check([171, 75, 84, 88, 32, 49, 49, 187, 13, 10, 26, 10])) {
          return {
            ext: "ktx",
            mime: "image/ktx"
          };
        }
        if ((this.check([126, 16, 4]) || this.check([126, 24, 4])) && this.check([48, 77, 73, 69], { offset: 4 })) {
          return {
            ext: "mie",
            mime: "application/x-mie"
          };
        }
        if (this.check([39, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], { offset: 2 })) {
          return {
            ext: "shp",
            mime: "application/x-esri-shape"
          };
        }
        if (this.check([255, 79, 255, 81])) {
          return {
            ext: "j2c",
            mime: "image/j2c"
          };
        }
        if (this.check([0, 0, 0, 12, 106, 80, 32, 32, 13, 10, 135, 10])) {
          await tokenizer.ignore(20);
          const type = await tokenizer.readToken(new StringType(4, "ascii"));
          switch (type) {
            case "jp2 ":
              return {
                ext: "jp2",
                mime: "image/jp2"
              };
            case "jpx ":
              return {
                ext: "jpx",
                mime: "image/jpx"
              };
            case "jpm ":
              return {
                ext: "jpm",
                mime: "image/jpm"
              };
            case "mjp2":
              return {
                ext: "mj2",
                mime: "image/mj2"
              };
            default:
              return;
          }
        }
        if (this.check([255, 10]) || this.check([0, 0, 0, 12, 74, 88, 76, 32, 13, 10, 135, 10])) {
          return {
            ext: "jxl",
            mime: "image/jxl"
          };
        }
        if (this.check([254, 255])) {
          if (this.checkString("<?xml ", { offset: 2, encoding: "utf-16be" })) {
            return {
              ext: "xml",
              mime: "application/xml"
            };
          }
          return void 0;
        }
        if (this.check([208, 207, 17, 224, 161, 177, 26, 225])) {
          return {
            ext: "cfb",
            mime: "application/x-cfb"
          };
        }
        await tokenizer.peekBuffer(this.buffer, { length: Math.min(256, tokenizer.fileInfo.size), mayBeLess: true });
        if (this.check([97, 99, 115, 112], { offset: 36 })) {
          return {
            ext: "icc",
            mime: "application/vnd.iccprofile"
          };
        }
        if (this.checkString("**ACE", { offset: 7 }) && this.checkString("**", { offset: 12 })) {
          return {
            ext: "ace",
            mime: "application/x-ace-compressed"
          };
        }
        if (this.checkString("BEGIN:")) {
          if (this.checkString("VCARD", { offset: 6 })) {
            return {
              ext: "vcf",
              mime: "text/vcard"
            };
          }
          if (this.checkString("VCALENDAR", { offset: 6 })) {
            return {
              ext: "ics",
              mime: "text/calendar"
            };
          }
        }
        if (this.checkString("FUJIFILMCCD-RAW")) {
          return {
            ext: "raf",
            mime: "image/x-fujifilm-raf"
          };
        }
        if (this.checkString("Extended Module:")) {
          return {
            ext: "xm",
            mime: "audio/x-xm"
          };
        }
        if (this.checkString("Creative Voice File")) {
          return {
            ext: "voc",
            mime: "audio/x-voc"
          };
        }
        if (this.check([4, 0, 0, 0]) && this.buffer.length >= 16) {
          const jsonSize = new DataView(this.buffer.buffer).getUint32(12, true);
          if (jsonSize > 12 && this.buffer.length >= jsonSize + 16) {
            try {
              const header = new TextDecoder().decode(this.buffer.subarray(16, jsonSize + 16));
              const json = JSON.parse(header);
              if (json.files) {
                return {
                  ext: "asar",
                  mime: "application/x-asar"
                };
              }
            } catch {
            }
          }
        }
        if (this.check([6, 14, 43, 52, 2, 5, 1, 1, 13, 1, 2, 1, 1, 2])) {
          return {
            ext: "mxf",
            mime: "application/mxf"
          };
        }
        if (this.checkString("SCRM", { offset: 44 })) {
          return {
            ext: "s3m",
            mime: "audio/x-s3m"
          };
        }
        if (this.check([71]) && this.check([71], { offset: 188 })) {
          return {
            ext: "mts",
            mime: "video/mp2t"
          };
        }
        if (this.check([71], { offset: 4 }) && this.check([71], { offset: 196 })) {
          return {
            ext: "mts",
            mime: "video/mp2t"
          };
        }
        if (this.check([66, 79, 79, 75, 77, 79, 66, 73], { offset: 60 })) {
          return {
            ext: "mobi",
            mime: "application/x-mobipocket-ebook"
          };
        }
        if (this.check([68, 73, 67, 77], { offset: 128 })) {
          return {
            ext: "dcm",
            mime: "application/dicom"
          };
        }
        if (this.check([76, 0, 0, 0, 1, 20, 2, 0, 0, 0, 0, 0, 192, 0, 0, 0, 0, 0, 0, 70])) {
          return {
            ext: "lnk",
            mime: "application/x.ms.shortcut"
            // Invented by us
          };
        }
        if (this.check([98, 111, 111, 107, 0, 0, 0, 0, 109, 97, 114, 107, 0, 0, 0, 0])) {
          return {
            ext: "alias",
            mime: "application/x.apple.alias"
            // Invented by us
          };
        }
        if (this.checkString("Kaydara FBX Binary  \0")) {
          return {
            ext: "fbx",
            mime: "application/x.autodesk.fbx"
            // Invented by us
          };
        }
        if (this.check([76, 80], { offset: 34 }) && (this.check([0, 0, 1], { offset: 8 }) || this.check([1, 0, 2], { offset: 8 }) || this.check([2, 0, 2], { offset: 8 }))) {
          return {
            ext: "eot",
            mime: "application/vnd.ms-fontobject"
          };
        }
        if (this.check([6, 6, 237, 245, 216, 29, 70, 229, 189, 49, 239, 231, 254, 116, 183, 29])) {
          return {
            ext: "indd",
            mime: "application/x-indesign"
          };
        }
        if (this.check([255, 255, 0, 0, 7, 0, 0, 0, 4, 0, 0, 0, 1, 0, 1, 0]) || this.check([0, 0, 255, 255, 0, 0, 0, 7, 0, 0, 0, 4, 0, 1, 0, 1])) {
          return {
            ext: "jmp",
            mime: "application/x-jmp-data"
          };
        }
        await tokenizer.peekBuffer(this.buffer, { length: Math.min(512, tokenizer.fileInfo.size), mayBeLess: true });
        if (this.checkString("ustar", { offset: 257 }) && (this.checkString("\0", { offset: 262 }) || this.checkString(" ", { offset: 262 })) || this.check([0, 0, 0, 0, 0, 0], { offset: 257 }) && tarHeaderChecksumMatches(this.buffer)) {
          return {
            ext: "tar",
            mime: "application/x-tar"
          };
        }
        if (this.check([255, 254])) {
          const encoding = "utf-16le";
          if (this.checkString("<?xml ", { offset: 2, encoding })) {
            return {
              ext: "xml",
              mime: "application/xml"
            };
          }
          if (this.check([255, 14], { offset: 2 }) && this.checkString("SketchUp Model", { offset: 4, encoding })) {
            return {
              ext: "skp",
              mime: "application/vnd.sketchup.skp"
            };
          }
          if (this.checkString("Windows Registry Editor Version 5.00\r\n", { offset: 2, encoding })) {
            return {
              ext: "reg",
              mime: "application/x-ms-regedit"
            };
          }
          return void 0;
        }
        if (this.checkString("-----BEGIN PGP MESSAGE-----")) {
          return {
            ext: "pgp",
            mime: "application/pgp-encrypted"
          };
        }
      };
      // Detections with limited supporting data, resulting in a higher likelihood of false positives
      detectImprecise = async (tokenizer) => {
        this.buffer = new Uint8Array(reasonableDetectionSizeInBytes);
        const fileSize = getKnownFileSizeOrMaximum(tokenizer.fileInfo.size);
        await tokenizer.peekBuffer(this.buffer, { length: Math.min(8, fileSize), mayBeLess: true });
        if (this.check([0, 0, 1, 186]) || this.check([0, 0, 1, 179])) {
          return {
            ext: "mpg",
            mime: "video/mpeg"
          };
        }
        if (this.check([0, 1, 0, 0, 0])) {
          return {
            ext: "ttf",
            mime: "font/ttf"
          };
        }
        if (this.check([0, 0, 1, 0])) {
          return {
            ext: "ico",
            mime: "image/x-icon"
          };
        }
        if (this.check([0, 0, 2, 0])) {
          return {
            ext: "cur",
            mime: "image/x-icon"
          };
        }
        await tokenizer.peekBuffer(this.buffer, { length: Math.min(2 + this.options.mpegOffsetTolerance, fileSize), mayBeLess: true });
        if (this.buffer.length >= 2 + this.options.mpegOffsetTolerance) {
          for (let depth = 0; depth <= this.options.mpegOffsetTolerance; ++depth) {
            const type = this.scanMpeg(depth);
            if (type) {
              return type;
            }
          }
        }
      };
      async readTiffTag(bigEndian) {
        const tagId = await this.tokenizer.readToken(bigEndian ? UINT16_BE : UINT16_LE);
        await this.tokenizer.ignore(10);
        switch (tagId) {
          case 50341:
            return {
              ext: "arw",
              mime: "image/x-sony-arw"
            };
          case 50706:
            return {
              ext: "dng",
              mime: "image/x-adobe-dng"
            };
          default:
        }
      }
      async readTiffIFD(bigEndian) {
        const numberOfTags = await this.tokenizer.readToken(bigEndian ? UINT16_BE : UINT16_LE);
        if (numberOfTags > maximumTiffTagCount) {
          return;
        }
        if (hasUnknownFileSize(this.tokenizer) && 2 + numberOfTags * 12 > maximumTiffIfdOffsetInBytes) {
          return;
        }
        for (let n = 0; n < numberOfTags; ++n) {
          const fileType = await this.readTiffTag(bigEndian);
          if (fileType) {
            return fileType;
          }
        }
      }
      async readTiffHeader(bigEndian) {
        const tiffFileType = {
          ext: "tif",
          mime: "image/tiff"
        };
        const version = (bigEndian ? UINT16_BE : UINT16_LE).get(this.buffer, 2);
        const ifdOffset = (bigEndian ? UINT32_BE : UINT32_LE).get(this.buffer, 4);
        if (version === 42) {
          if (ifdOffset >= 6) {
            if (this.checkString("CR", { offset: 8 })) {
              return {
                ext: "cr2",
                mime: "image/x-canon-cr2"
              };
            }
            if (ifdOffset >= 8) {
              const someId1 = (bigEndian ? UINT16_BE : UINT16_LE).get(this.buffer, 8);
              const someId2 = (bigEndian ? UINT16_BE : UINT16_LE).get(this.buffer, 10);
              if (someId1 === 28 && someId2 === 254 || someId1 === 31 && someId2 === 11) {
                return {
                  ext: "nef",
                  mime: "image/x-nikon-nef"
                };
              }
            }
          }
          if (hasUnknownFileSize(this.tokenizer) && ifdOffset > maximumTiffStreamIfdOffsetInBytes) {
            return tiffFileType;
          }
          const maximumTiffOffset = hasUnknownFileSize(this.tokenizer) ? maximumTiffIfdOffsetInBytes : this.tokenizer.fileInfo.size;
          try {
            await safeIgnore(this.tokenizer, ifdOffset, {
              maximumLength: maximumTiffOffset,
              reason: "TIFF IFD offset"
            });
          } catch (error) {
            if (error instanceof EndOfStreamError) {
              return;
            }
            throw error;
          }
          let fileType;
          try {
            fileType = await this.readTiffIFD(bigEndian);
          } catch (error) {
            if (error instanceof EndOfStreamError) {
              return;
            }
            throw error;
          }
          return fileType ?? tiffFileType;
        }
        if (version === 43) {
          return tiffFileType;
        }
      }
      /**
        Scan check MPEG 1 or 2 Layer 3 header, or 'layer 0' for ADTS (MPEG sync-word 0xFFE).

        @param offset - Offset to scan for sync-preamble.
        @returns {{ext: string, mime: string}}
        */
      scanMpeg(offset) {
        if (this.check([255, 224], { offset, mask: [255, 224] })) {
          if (this.check([16], { offset: offset + 1, mask: [22] })) {
            if (this.check([8], { offset: offset + 1, mask: [8] })) {
              return {
                ext: "aac",
                mime: "audio/aac"
              };
            }
            return {
              ext: "aac",
              mime: "audio/aac"
            };
          }
          if (this.check([2], { offset: offset + 1, mask: [6] })) {
            return {
              ext: "mp3",
              mime: "audio/mpeg"
            };
          }
          if (this.check([4], { offset: offset + 1, mask: [6] })) {
            return {
              ext: "mp2",
              mime: "audio/mpeg"
            };
          }
          if (this.check([6], { offset: offset + 1, mask: [6] })) {
            return {
              ext: "mp1",
              mime: "audio/mpeg"
            };
          }
        }
      }
    };
    supportedExtensions = new Set(extensions);
    supportedMimeTypes = new Set(mimeTypes);
  }
});

// node_modules/file-type/index.js
var init_file_type = __esm({
  "node_modules/file-type/index.js"() {
    init_lib();
    init_core2();
  }
});

// packages/communications/src/attachments.ts
var attachments_exports = {};
__export(attachments_exports, {
  createAttachments: () => createAttachments,
  inspectFile: () => inspectFile,
  readBounded: () => readBounded,
  scanClamAV: () => scanClamAV
});
import { createConnection } from "node:net";
import { randomUUID as randomUUID3 } from "node:crypto";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { resolve, join } from "node:path";
async function inspectFile(buffer, declared) {
  if (!buffer.length || buffer.length > MAX_FILE_BYTES) return fail("FILE_TOO_LARGE", 413);
  const detected = await fileTypeFromBuffer(buffer).catch(() => void 0);
  let mime = detected?.mime;
  if (!mime && declared === "text/plain") {
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
      if (!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text) && !/<\s*(?:html|script|svg|iframe|!doctype)/i.test(text))
        mime = "text/plain";
    } catch {
    }
  }
  if (!mime || !allowed.has(mime)) return fail("FILE_FORMAT_NOT_ALLOWED", 415);
  const declaredBase = declared.split(";", 1)[0].trim().toLowerCase(), detectedBase = mime.split(";", 1)[0].trim().toLowerCase();
  if (declaredBase && declaredBase !== "application/octet-stream" && declaredBase !== detectedBase && !(declaredBase === "audio/ogg" && detectedBase === "audio/opus"))
    return fail("FILE_TYPE_MISMATCH", 415);
  return { mime, kind: allowed.get(mime), extension: detected?.ext || "txt" };
}
async function readBounded(stream, size) {
  if (size !== void 0 && (!/^\d+$/.test(String(size)) || Number(size) > MAX_FILE_BYTES))
    return fail("FILE_TOO_LARGE", 413);
  const chunks = [];
  let length = 0;
  for await (const chunk of stream) {
    length += chunk.length;
    if (length > MAX_FILE_BYTES) return fail("FILE_TOO_LARGE", 413);
    chunks.push(Buffer.from(chunk));
  }
  if (size !== void 0 && length !== Number(size)) return fail("FILE_SIZE_MISMATCH");
  return Buffer.concat(chunks);
}
async function scanClamAV(buffer, host, port = 3310) {
  return new Promise((resolveScan, reject) => {
    const socket = createConnection({ host, port });
    let result = "";
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      error ? reject(error) : resolveScan(value);
    };
    socket.setTimeout(3e4, () => finish(new Error("SCANNER_UNAVAILABLE")));
    socket.on("error", () => finish(new Error("SCANNER_UNAVAILABLE")));
    socket.on("data", (chunk) => {
      result += chunk.toString();
      if (result.length > 4096) return finish(new Error("SCANNER_PROTOCOL"));
      if (result.includes("\0")) {
        if (/: OK\0/.test(result)) finish(void 0, "clean");
        else if (/ FOUND\0/.test(result)) finish(void 0, "infected");
        else finish(new Error("SCANNER_UNAVAILABLE"));
      }
    });
    socket.on("end", () => {
      if (!settled) finish(new Error("SCANNER_UNAVAILABLE"));
    });
    socket.on("connect", () => {
      socket.write("zINSTREAM\0");
      for (let i = 0; i < buffer.length; i += 65536) {
        const part = buffer.subarray(i, i + 65536), header = Buffer.alloc(4);
        header.writeUInt32BE(part.length);
        socket.write(header);
        socket.write(part);
      }
      socket.write(Buffer.alloc(4));
    });
  });
}
function createAttachments(context, service) {
  const db = context.database, root = resolve(
    String(context.env.ISVOI_COMMUNICATIONS_PRIVATE_DIR || "/directus/private-communications")
  );
  function path(key) {
    if (!UUID.test(key)) return fail("INVALID_STORAGE_KEY");
    return join(root, key);
  }
  async function store(buffer, metadata) {
    const inspected = await inspectFile(buffer, metadata.mime || "");
    await mkdir(root, { recursive: true, mode: 448 });
    const key = randomUUID3();
    await writeFile(path(key), buffer, { flag: "wx", mode: 384 });
    try {
      const values = {
        ...metadata,
        mime: inspected.mime,
        kind: metadata.kind === "voice" && inspected.kind === "audio" ? "voice" : inspected.kind,
        name: `${String(metadata.name || "file").replace(/[\x00-\x1f/\\<>:"|?*]/g, "_").slice(0, 140)}`,
        storage_key: key,
        sha256: digest(buffer),
        size: buffer.length,
        state: "quarantine"
      };
      if (metadata.id) {
        delete values.id;
        const changed = await db("comm_attachments").where({ id: metadata.id, state: "pending" }).update(values);
        if (!changed) {
          await unlink(path(key));
          return fail("FILE_STATE_CHANGED", 409);
        }
        return { id: metadata.id, state: "quarantine" };
      }
      return (await db("comm_attachments").insert(values).returning(["id", "state", "name"]))[0];
    } catch (error) {
      await unlink(path(key));
      throw error;
    }
  }
  async function upload(a, conversationId, stream, metadata) {
    const { c } = await service.permitted(db, a, conversationId);
    const waiting = await db("comm_attachments").where({ uploaded_by: a.user }).whereIn("state", ["pending", "quarantine"]).count("* as count").first();
    if (Number(waiting.count) >= 10) return fail("TOO_MANY_PENDING_FILES", 429);
    const buffer = await readBounded(stream, metadata.size);
    return store(buffer, {
      conversation_id: conversationId,
      connection_id: c.connection_id,
      uploaded_by: a.user,
      name: metadata.name,
      mime: metadata.mime
    });
  }
  async function scanOne(connectionId) {
    const row = await db.transaction(async (trx) => {
      await trx("comm_attachments").where({ state: "scanning", connection_id: connectionId }).andWhere("checked_at", "<", trx.raw("now()-interval '2 minutes'")).update({ state: "quarantine", error_code: "SCANNER_INTERRUPTED", checked_at: null });
      const row2 = await trx("comm_attachments").where({ state: "quarantine", connection_id: connectionId }).orderBy("created_at").forUpdate().skipLocked().first();
      if (!row2) return null;
      await trx("comm_attachments").where({ id: row2.id, state: "quarantine" }).update({ state: "scanning", checked_at: trx.fn.now(), error_code: null });
      return row2;
    });
    if (!row) return null;
    let bytes;
    try {
      bytes = await readFile(path(row.storage_key));
    } catch {
      await db("comm_attachments").where({ id: row.id, state: "scanning" }).update({ state: "rejected", error_code: "FILE_MISSING", checked_at: db.fn.now() });
      return { id: row.id, state: "rejected" };
    }
    if (digest(bytes) !== row.sha256) {
      await db("comm_attachments").where({ id: row.id, state: "scanning" }).update({ state: "rejected", error_code: "FILE_INTEGRITY", checked_at: db.fn.now() });
      return { id: row.id, state: "rejected" };
    }
    let result;
    try {
      result = await scanClamAV(
        bytes,
        String(context.env.ISVOI_COMMUNICATIONS_CLAMAV_HOST || "clamav")
      );
    } catch {
      await db("comm_attachments").where({ id: row.id, state: "scanning" }).update({ state: "quarantine", error_code: "SCANNER_UNAVAILABLE", checked_at: null });
      return { id: row.id, state: "quarantine", error_code: "SCANNER_UNAVAILABLE" };
    }
    const state = result === "clean" ? "ready" : "rejected";
    const changed = await db("comm_attachments").where({ id: row.id, state: "scanning" }).update({
      state,
      checked_at: db.fn.now(),
      error_code: result === "clean" ? null : "MALWARE_DETECTED"
    });
    if (!changed) return fail("FILE_STATE_CHANGED", 409);
    return { id: row.id, state };
  }
  async function get(a, id) {
    if (!UUID.test(id)) return fail("NOT_FOUND", 404);
    const row = await db("comm_attachments").where({ id }).first();
    if (!row) return fail("NOT_FOUND", 404);
    await service.permitted(db, a, row.conversation_id);
    if (row.state !== "ready") return fail("FILE_NOT_READY", 409);
    return { ...row, path: path(row.storage_key) };
  }
  return { store, upload, scanOne, get, path };
}
var allowed;
var init_attachments = __esm({
  "packages/communications/src/attachments.ts"() {
    "use strict";
    init_file_type();
    init_policy();
    allowed = /* @__PURE__ */ new Map([
      ["image/jpeg", "image"],
      ["image/png", "image"],
      ["image/webp", "image"],
      ["image/gif", "image"],
      ["audio/ogg", "audio"],
      ["audio/ogg; codecs=opus", "audio"],
      ["audio/opus", "audio"],
      ["audio/mpeg", "audio"],
      ["audio/mp4", "audio"],
      ["audio/wav", "audio"],
      ["audio/x-wav", "audio"],
      ["audio/flac", "audio"],
      ["video/mp4", "video"],
      ["video/webm", "video"],
      ["video/quicktime", "video"],
      ["application/pdf", "document"],
      ["application/msword", "document"],
      ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "document"],
      ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "document"],
      ["application/vnd.openxmlformats-officedocument.presentationml.presentation", "document"],
      ["text/plain", "document"]
    ]);
  }
});

// packages/communications/src/endpoint.ts
import { createReadStream } from "node:fs";

// packages/communications/src/service.ts
init_policy();
import { randomBytes, randomUUID } from "node:crypto";

// packages/communications/src/normalize.ts
init_policy();
var date = (value, milliseconds = false) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fail("EVENT_TIME_REQUIRED");
  return new Date(milliseconds ? n : n * 1e3).toISOString();
};
var media = (kind, value) => ({
  kind,
  externalId: identifier(value.file_id),
  name: String(value.file_name || kind).slice(0, 200),
  mime: String(value.mime_type || "application/octet-stream"),
  size: Number.isSafeInteger(value.file_size) && value.file_size >= 0 ? value.file_size : null
});
function normalize(platform, raw) {
  if (!raw || typeof raw !== "object") return fail("INVALID_EVENT");
  if (platform === "telegram") {
    const id = identifier(raw.update_id), member = raw.my_chat_member;
    if (member?.chat?.type === "private")
      return {
        id,
        platform,
        actorId: identifier(member.chat.id),
        peerId: identifier(member.chat.id),
        kind: "availability",
        occurredAt: date(member.date),
        text: "",
        attachments: [],
        availability: member.new_chat_member?.status === "kicked" ? "blocked" : "allowed"
      };
    const cb = raw.callback_query, m2 = raw.edited_message || raw.message || cb?.message;
    if (m2?.chat?.type === "supergroup")
      return {
        id,
        platform,
        kind: "staff",
        actorId: identifier(cb?.from?.id ?? m2.from?.id),
        peerId: identifier(m2.chat.id),
        occurredAt: (/* @__PURE__ */ new Date()).toISOString(),
        text: "",
        attachments: [],
        raw
      };
    if (!m2 || m2.chat?.type !== "private") return fail("NON_PRIVATE_EVENT");
    const attachments2 = [];
    if (m2.photo?.length) attachments2.push(media("image", m2.photo.at(-1)));
    for (const kind2 of ["voice", "audio", "video", "document"])
      if (m2[kind2]) attachments2.push(media(kind2, m2[kind2]));
    if (m2.video_note) attachments2.push(media("video", m2.video_note));
    if (cb?.from?.is_bot || !cb && m2.from?.is_bot || String(cb?.from?.id ?? m2.from?.id) !== String(m2.chat.id))
      return fail("INVALID_PRIVATE_ACTOR");
    return {
      id,
      platform,
      actorId: identifier(cb?.from?.id ?? m2.from?.id),
      peerId: identifier(m2.chat.id),
      kind: cb ? "callback" : raw.edited_message ? "edited" : m2.sticker || m2.contact || m2.location ? "unsupported" : "message",
      occurredAt: cb ? (/* @__PURE__ */ new Date()).toISOString() : date(m2.edit_date ?? m2.date),
      externalMessageId: identifier(m2.message_id),
      text: String(m2.text ?? m2.caption ?? ""),
      attachments: attachments2,
      albumId: m2.media_group_id ? identifier(m2.media_group_id) : void 0,
      callbackId: cb ? identifier(cb.id) : void 0,
      callbackData: cb?.data
    };
  }
  if (platform === "max") {
    const m2 = raw.message, u = raw.user || raw.callback?.user || m2?.sender;
    const actorId2 = identifier(u?.user_id), peerId2 = identifier(m2?.recipient?.chat_id ?? raw.chat_id ?? actorId2);
    if (m2?.recipient?.chat_type && m2.recipient.chat_type !== "dialog")
      return fail("NON_PRIVATE_EVENT");
    const kind2 = raw.update_type === "bot_stopped" ? "availability" : raw.update_type === "bot_started" ? "started" : raw.update_type === "message_callback" ? "callback" : raw.update_type === "message_edited" ? "edited" : raw.update_type === "message_created" ? "message" : "unsupported";
    const occurredAt = date(raw.timestamp, true);
    const id = String(
      raw.event_id ?? `${raw.update_type}:${m2?.body?.mid ?? raw.callback?.callback_id ?? actorId2}:${raw.timestamp}`
    );
    const attachments2 = (m2?.body?.attachments || []).filter((a) => ["image", "video", "audio", "file"].includes(a.type)).map((a) => ({
      kind: { image: "image", video: "video", audio: "audio", file: "document" }[a.type],
      externalId: String(a.payload?.token ?? a.payload?.video_id ?? digest(canonical(a.payload))),
      url: a.payload?.url,
      name: String(a.filename || a.type),
      mime: String(a.mime_type || "application/octet-stream"),
      size: Number.isSafeInteger(a.size) ? a.size : null
    }));
    return {
      id,
      platform,
      actorId: actorId2,
      peerId: peerId2,
      kind: kind2,
      occurredAt,
      externalMessageId: m2?.body?.mid ? identifier(m2.body.mid) : void 0,
      text: kind2 === "started" && raw.payload ? `/start ${String(raw.payload)}` : String(m2?.body?.text ?? ""),
      attachments: attachments2,
      callbackId: raw.callback?.callback_id,
      callbackData: raw.callback?.payload,
      availability: kind2 === "availability" ? "blocked" : kind2 === "started" ? "allowed" : void 0
    };
  }
  const m = raw.object?.message || raw.object, actorId = identifier(m?.from_id ?? m?.user_id), peerId = identifier(m?.peer_id ?? actorId);
  if (Number(peerId) >= 2e9 || Number(actorId) <= 0) return fail("NON_PRIVATE_EVENT");
  const kind = raw.type === "message_allow" || raw.type === "message_deny" ? "availability" : raw.type === "message_event" ? "callback" : raw.type === "message_edit" ? "edited" : raw.type === "message_new" ? "message" : "unsupported";
  if (!raw.event_id) return fail("EVENT_ID_REQUIRED");
  const attachments = (m.attachments || []).map((a) => {
    const v = a[a.type] || {};
    const kind2 = {
      photo: "image",
      audio_message: "voice",
      audio: "audio",
      video: "video",
      doc: "document"
    }[a.type];
    if (!kind2) return null;
    return {
      kind: kind2,
      externalId: `${a.type}${identifier(v.owner_id)}_${identifier(v.id)}${v.access_key ? "_" + v.access_key : ""}`,
      url: v.url ?? v.link_mp3 ?? v.sizes?.at(-1)?.url,
      name: String(v.title || kind2),
      mime: "application/octet-stream",
      size: Number.isSafeInteger(v.size) ? v.size : null
    };
  }).filter(Boolean);
  return {
    id: identifier(raw.event_id),
    platform,
    actorId,
    peerId,
    kind,
    occurredAt: m.date ? date(m.date) : (/* @__PURE__ */ new Date()).toISOString(),
    externalMessageId: m.id ? identifier(m.id) : m.conversation_message_id ? identifier(m.conversation_message_id) : void 0,
    text: m.ref ? `/start ${String(m.ref)}` : String(m.text || ""),
    attachments,
    callbackId: m.event_id,
    callbackData: typeof m.payload === "string" ? m.payload : m.payload?.action,
    availability: kind === "availability" ? raw.type === "message_deny" ? "blocked" : "allowed" : void 0
  };
}

// packages/communications/src/sla.ts
var defaultServiceLevel = {
  enabled: true,
  timezone: "Europe/Moscow",
  working_days: [1, 2, 3, 4, 5, 6, 7],
  workday_start: "10:00",
  workday_end: "20:00",
  first_response_minutes: 10,
  escalation_minutes: 15
};
var formatter = (timezone) => new Intl.DateTimeFormat("en-CA", {
  timeZone: timezone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23"
});
function localParts(value, timezone) {
  const parts = Object.fromEntries(
    formatter(timezone).formatToParts(value).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)])
  );
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second
  };
}
function utcForLocal(value, timezone) {
  const desired = Date.UTC(value.year, value.month - 1, value.day, value.hour, value.minute);
  let result = desired;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const actual = localParts(new Date(result), timezone);
    const represented = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second
    );
    const next = result + desired - represented;
    if (next === result) break;
    result = next;
  }
  return new Date(result);
}
function clock(value) {
  const match = String(value).match(/^(\d{1,2}):(\d{2})/);
  if (!match) throw new Error("INVALID_SERVICE_LEVEL_CLOCK");
  const hour = Number(match[1]), minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new Error("INVALID_SERVICE_LEVEL_CLOCK");
  return hour * 60 + minute;
}
function nextDate(value) {
  const date2 = new Date(Date.UTC(value.year, value.month - 1, value.day + 1));
  return { year: date2.getUTCFullYear(), month: date2.getUTCMonth() + 1, day: date2.getUTCDate() };
}
function isoWeekday(value) {
  return new Date(Date.UTC(value.year, value.month - 1, value.day)).getUTCDay() || 7;
}
function addWorkingMinutes(start, minutes, level) {
  if (!Number.isInteger(minutes) || minutes < 0) throw new Error("INVALID_SERVICE_LEVEL_MINUTES");
  const days = new Set(level.working_days.map(Number));
  const dayStart = clock(level.workday_start), dayEnd = clock(level.workday_end);
  if (!days.size || [...days].some((day) => day < 1 || day > 7) || dayEnd <= dayStart)
    throw new Error("INVALID_SERVICE_LEVEL_SCHEDULE");
  let cursor = new Date(start);
  if (Number.isNaN(cursor.getTime())) throw new Error("INVALID_SERVICE_LEVEL_START");
  let remaining = minutes * 6e4;
  for (let guard = 0; guard < 370; guard += 1) {
    let local = localParts(cursor, level.timezone);
    const minuteOfDay = local.hour * 60 + local.minute;
    if (!days.has(isoWeekday(local)) || minuteOfDay >= dayEnd) {
      const date3 = nextDate(local);
      cursor = utcForLocal(
        { ...date3, hour: Math.floor(dayStart / 60), minute: dayStart % 60 },
        level.timezone
      );
      continue;
    }
    if (minuteOfDay < dayStart) {
      cursor = utcForLocal(
        { ...local, hour: Math.floor(dayStart / 60), minute: dayStart % 60 },
        level.timezone
      );
      local = localParts(cursor, level.timezone);
    }
    const end = utcForLocal(
      { ...local, hour: Math.floor(dayEnd / 60), minute: dayEnd % 60 },
      level.timezone
    );
    const available = Math.max(0, end.getTime() - cursor.getTime());
    if (remaining <= available) return new Date(cursor.getTime() + remaining);
    remaining -= available;
    const date2 = nextDate(local);
    cursor = utcForLocal(
      { ...date2, hour: Math.floor(dayStart / 60), minute: dayStart % 60 },
      level.timezone
    );
  }
  throw new Error("SERVICE_LEVEL_SCHEDULE_EXHAUSTED");
}
function serviceDeadlines(start, level = defaultServiceLevel) {
  if (!level.enabled) return { firstResponseDueAt: null, escalationDueAt: null };
  return {
    firstResponseDueAt: addWorkingMinutes(start, level.first_response_minutes, level),
    escalationDueAt: addWorkingMinutes(start, level.escalation_minutes, level)
  };
}

// packages/communications/src/service.ts
var activeLead = (lead) => ["new", "in_progress", "waiting"].includes(lead?.status);
var incomingKinds = /* @__PURE__ */ new Set([
  "message",
  "edited",
  "callback",
  "availability",
  "started",
  "unsupported",
  "staff"
]);
function isStoredEvent(value) {
  if (!value || typeof value !== "object") return false;
  const event = value;
  return typeof event.id === "string" && typeof event.platform === "string" && typeof event.actorId === "string" && typeof event.peerId === "string" && typeof event.kind === "string" && incomingKinds.has(event.kind) && typeof event.occurredAt === "string" && !Number.isNaN(Date.parse(event.occurredAt)) && typeof event.text === "string" && Array.isArray(event.attachments);
}
var menu = [
  ["\u041A\u0443\u043F\u0438\u0442\u044C / \u043F\u043E\u0434\u043E\u0431\u0440\u0430\u0442\u044C", "kind:selection"],
  ["\u041F\u0440\u043E\u0434\u0430\u0442\u044C / \u043E\u0431\u043C\u0435\u043D\u044F\u0442\u044C", "kind:trade"],
  ["\u0417\u0430\u0434\u0430\u0442\u044C \u0432\u043E\u043F\u0440\u043E\u0441", "kind:support"],
  ["\u041C\u043E\u0438 \u0437\u0430\u044F\u0432\u043A\u0438", "dialogs"],
  ["\u041F\u043E\u0434\u043F\u0438\u0441\u043A\u0438", "news"]
];
function keyboard(platform, rows) {
  if (platform === "telegram")
    return {
      reply_markup: {
        inline_keyboard: rows.map(([text, data]) => [{ text, callback_data: data }])
      }
    };
  if (platform === "max")
    return {
      attachments: [
        {
          type: "inline_keyboard",
          payload: {
            buttons: rows.map(([text, data]) => [{ type: "callback", text, payload: data }])
          }
        }
      ]
    };
  return {
    keyboard: JSON.stringify({
      inline: true,
      buttons: rows.map(([label, action]) => [
        {
          action: { type: "callback", label, payload: JSON.stringify({ action }) },
          color: "secondary"
        }
      ])
    })
  };
}
function createService(context) {
  const { database: db, services, getSchema, env } = context;
  const enabled = () => {
    if (!flag(env.ISVOI_COMMUNICATIONS_ENABLED)) fail("COMMUNICATIONS_DISABLED", 503);
  };
  let staffProcessor;
  const setStaffProcessor = (fn) => {
    staffProcessor = fn;
  };
  let staffNotifier;
  const setStaffNotifier = (fn) => {
    staffNotifier = fn;
  };
  async function userAccountability(trx, id) {
    const user = await trx("directus_users").where({ id, status: "active" }).first();
    if (!user) return fail("FORBIDDEN", 403);
    const roles = [];
    let role = user.role;
    while (role) {
      if (roles.includes(role) || roles.length > 30) fail("INVALID_ROLE_TREE", 403);
      roles.push(role);
      role = (await trx("directus_roles").where({ id: role }).first())?.parent;
    }
    return { user: id, role: user.role, roles, admin: false, app: true };
  }
  async function actor(userId) {
    enabled();
    if (typeof userId !== "string" || !UUID.test(userId)) return fail("FORBIDDEN", 403);
    const accountability = await userAccountability(db, userId);
    if (!await db("comm_staff").where({ user_id: userId, enabled: true }).first())
      return fail("FORBIDDEN", 403);
    return { user: userId, accountability };
  }
  async function itemService(trx, collection, accountability) {
    return new services.ItemsService(collection, {
      knex: trx,
      schema: await getSchema(),
      accountability
    });
  }
  async function permitted(trx, a, conversationId, manage = false) {
    if (!UUID.test(conversationId || "")) return fail("INVALID_CONVERSATION");
    const c = await trx("comm_conversations as c").join("comm_threads as t", "t.id", "c.thread_id").join("comm_connections as n", "n.id", "t.connection_id").where("c.id", conversationId).select("c.*", "t.identity_id", "t.connection_id", "n.store_id").first();
    if (!c) return fail("NOT_FOUND", 404);
    const staff = await trx("comm_staff").where({ user_id: a.user, store_id: c.store_id, enabled: true }).first();
    if (!staff || manage && !staff.can_manage) return fail("FORBIDDEN", 403);
    const accountability = await userAccountability(trx, a.user);
    const service = await itemService(trx, "leads", accountability);
    const lead = await service.readOne(c.lead_id, {
      fields: [
        "id",
        "status",
        "assigned_to",
        "store_location_id",
        "is_test",
        "reference_code",
        "kind"
      ]
    });
    if (lead.store_location_id && lead.store_location_id !== c.store_id)
      return fail("FORBIDDEN", 403);
    return { c, lead, service, staff, accountability };
  }
  async function event(trx, values) {
    await trx("comm_events").insert(values).onConflict("dedupe_key").ignore();
  }
  async function maxUserId(trx, thread) {
    const identity = await trx("comm_identities").where({ id: thread.identity_id }).first("external_user_id");
    if (!identity?.external_user_id) return fail("IDENTITY_NOT_FOUND", 409);
    return identity.external_user_id;
  }
  async function enqueue(trx, connection, thread, text, values = {}, rows = []) {
    const id = randomUUID();
    const [outbox] = await trx("comm_outbox").insert({
      id,
      connection_id: connection.id,
      thread_id: thread.id,
      identity_id: thread.identity_id,
      purpose: "service",
      dedupe_key: `notice:${id}`,
      ...values
    }).returning("*");
    const payload = connection.platform === "telegram" ? { chat_id: thread.external_peer_id, text } : connection.platform === "max" ? { user_id: await maxUserId(trx, thread), text } : {
      peer_id: thread.external_peer_id,
      message: text,
      random_id: parseInt(digest(id).slice(0, 7), 16)
    };
    Object.assign(payload, keyboard(connection.platform, rows));
    await trx("comm_operations").insert({ outbox_id: outbox.id, method: "text", payload });
    return outbox;
  }
  async function ingest(connectionId, raw) {
    enabled();
    const n = await db("comm_connections").where({ id: connectionId, enabled: true }).first();
    if (!n) return fail("CONNECTION_DISABLED", 403);
    let e;
    try {
      e = normalize(n.platform, raw);
    } catch (error) {
      if (n.platform !== "telegram" || error.code !== "NON_PRIVATE_EVENT") throw error;
      const id = identifier(raw?.update_id);
      await db("comm_inbound").insert({
        connection_id: n.id,
        external_id: id,
        event: null,
        state: "done",
        error_code: "NON_PRIVATE_EVENT",
        processed_at: db.fn.now()
      }).onConflict(["connection_id", "external_id"]).ignore();
      return { accepted: true, id: null };
    }
    if (e.kind !== "staff" && n.mode === "test" && !(n.settings?.pilot_user_ids || []).map(String).includes(e.actorId)) {
      await db("comm_inbound").insert({
        connection_id: n.id,
        external_id: e.id,
        event: null,
        state: "done",
        error_code: "PILOT_ONLY",
        processed_at: db.fn.now()
      }).onConflict(["connection_id", "external_id"]).ignore();
      return { accepted: true, id: null };
    }
    const [row] = await db("comm_inbound").insert({ connection_id: n.id, external_id: e.id, event: e }).onConflict(["connection_id", "external_id"]).ignore().returning("id");
    await db("comm_connections").where({ id: n.id }).update({ last_received_at: db.fn.now() });
    return { accepted: true, id: row?.id || null };
  }
  async function ensureIdentity(trx, n, e) {
    let identity = await trx("comm_identities").where({ connection_id: n.id, external_user_id: e.actorId }).first();
    if (!identity) {
      const [contact] = await trx("comm_contacts").insert({}).returning("id");
      [identity] = await trx("comm_identities").insert({
        contact_id: contact.id,
        connection_id: n.id,
        external_user_id: e.actorId,
        first_seen_at: e.occurredAt,
        is_test: n.mode === "test"
      }).returning("*");
      await event(trx, {
        connection_id: n.id,
        identity_id: identity.id,
        kind: "first_seen",
        dedupe_key: `identity:${identity.id}`,
        occurred_at: e.occurredAt,
        is_test: identity.is_test
      });
    }
    let thread = await trx("comm_threads").where({ connection_id: n.id, external_peer_id: e.peerId }).first();
    if (!thread)
      [thread] = await trx("comm_threads").insert({ connection_id: n.id, identity_id: identity.id, external_peer_id: e.peerId }).returning("*");
    if (thread.identity_id !== identity.id) return fail("THREAD_IDENTITY_CONFLICT", 409);
    return { identity, thread };
  }
  async function makeLead(trx, n, thread, e, kind = "support") {
    if (!n.service_user_id) return fail("INTAKE_NOT_CONFIGURED", 503);
    const accountability = await userAccountability(trx, n.service_user_id);
    const service = await itemService(trx, "leads", accountability);
    const id = await service.createOne({
      kind,
      status: "new",
      contact: `${n.platform}:${e.actorId}`,
      contact_channel: n.platform,
      message: e.text,
      source: n.platform,
      source_path: `bot:${n.external_id}`,
      store_location_id: n.store_id,
      is_test: n.mode === "test"
    });
    await trx("comm_service_levels").insert({ store_id: n.store_id }).onConflict("store_id").ignore();
    const configured = await trx("comm_service_levels").where({ store_id: n.store_id }).first();
    const level = { ...defaultServiceLevel, ...configured };
    const deadlines = serviceDeadlines(e.occurredAt, level);
    const [c] = await trx("comm_conversations").insert({
      lead_id: id,
      thread_id: thread.id,
      first_response_due_at: deadlines.firstResponseDueAt,
      escalation_due_at: deadlines.escalationDueAt
    }).returning("*");
    await trx("comm_threads").where({ id: thread.id }).update({ selected_conversation_id: c.id, pending_kind: null });
    await trx("comm_access_grants").insert({ identity_id: thread.identity_id, lead_id: id }).onConflict(["identity_id", "lead_id"]).ignore();
    await event(trx, {
      connection_id: n.id,
      identity_id: thread.identity_id,
      lead_id: id,
      kind: "lead_created",
      dedupe_key: `lead:${id}`,
      is_test: n.mode === "test"
    });
    return c;
  }
  async function subscriptions(trx, n, thread, selected, source) {
    const settings = n.settings || {};
    if (settings.subscriptions_pilot_only) {
      const i = await trx("comm_identities").where({ id: thread.identity_id }).first();
      if (!(settings.pilot_user_ids || []).map(String).includes(i.external_user_id))
        return enqueue(
          trx,
          n,
          thread,
          "\u041F\u043E\u0434\u043F\u0438\u0441\u043A\u0438 \u043F\u043E\u043A\u0430 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B \u0442\u043E\u043B\u044C\u043A\u043E \u0443\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u0430\u043C \u0437\u0430\u043A\u0440\u044B\u0442\u043E\u0433\u043E \u043F\u0438\u043B\u043E\u0442\u0430."
        );
    }
    if (!settings.consent_version || !settings.consent_text || !settings.subscriptions_enabled)
      return enqueue(
        trx,
        n,
        thread,
        "\u041F\u043E\u0434\u043F\u0438\u0441\u043A\u0438 \u043F\u043E\u043A\u0430 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B. \u041E\u0431\u0440\u0430\u0449\u0435\u043D\u0438\u044F \u043A \u043C\u0435\u043D\u0435\u0434\u0436\u0435\u0440\u0443 \u0440\u0430\u0431\u043E\u0442\u0430\u044E\u0442.",
        {},
        menu
      );
    if (selected) {
      const topics2 = await trx("comm_topics").where({ active: true }).orderBy("sort");
      for (const topic of topics2) {
        const consent = selected.includes(topic.key);
        const old = await trx("comm_subscriptions").where({ identity_id: thread.identity_id, topic_key: topic.key }).first();
        if (Boolean(old?.consent) === consent) continue;
        await trx("comm_subscriptions").insert({
          identity_id: thread.identity_id,
          topic_key: topic.key,
          consent,
          consent_version: String(settings.consent_version)
        }).onConflict(["identity_id", "topic_key"]).merge({
          consent,
          consent_version: String(settings.consent_version),
          updated_at: trx.fn.now()
        });
        await trx("comm_consent_events").insert({
          identity_id: thread.identity_id,
          topic_key: topic.key,
          consent,
          version: String(settings.consent_version),
          source
        });
        if (!consent)
          await trx("comm_outbox").where({ identity_id: thread.identity_id, purpose: "marketing", state: "pending" }).whereIn(
            "campaign_id",
            trx("comm_campaigns").where({ topic_key: topic.key }).select("id")
          ).update({ state: "cancelled", error_code: "CONSENT_WITHDRAWN" });
        await event(trx, {
          connection_id: n.id,
          identity_id: thread.identity_id,
          kind: consent ? "subscribed" : "unsubscribed",
          dedupe_key: `consent:${source}:${topic.key}`,
          facts: { topic: topic.key },
          is_test: n.mode === "test"
        });
      }
      await trx("comm_threads").where({ id: thread.id }).update({ subscription_draft: null });
      return enqueue(
        trx,
        n,
        thread,
        selected.length ? "\u041F\u043E\u0434\u043F\u0438\u0441\u043A\u0438 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u044B." : "\u0412\u0441\u0435 \u043F\u043E\u0434\u043F\u0438\u0441\u043A\u0438 \u043E\u0442\u043A\u043B\u044E\u0447\u0435\u043D\u044B.",
        {},
        menu
      );
    }
    const active = await trx("comm_subscriptions").where({ identity_id: thread.identity_id, consent: true }).pluck("topic_key");
    const draft = thread.subscription_draft ?? active;
    const topics = await trx("comm_topics").where({ active: true }).orderBy("sort");
    const rows = topics.map((t) => [
      `${draft.includes(t.key) ? "\u2713 " : "\u25CB "}${t.label}`,
      `news:toggle:${t.key}`
    ]);
    rows.push(
      ["\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u043F\u043E\u0434\u043F\u0438\u0441\u043A\u0438", "news:save"],
      ["\u041E\u0442\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u0432\u0441\u0451", "news:off"],
      ["\u0413\u043B\u0430\u0432\u043D\u043E\u0435 \u043C\u0435\u043D\u044E", "main"]
    );
    return enqueue(
      trx,
      n,
      thread,
      `${settings.consent_text}
\u0418\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F \u043F\u0440\u0438\u043C\u0435\u043D\u044F\u044E\u0442\u0441\u044F \u043F\u043E\u0441\u043B\u0435 \u043D\u0430\u0436\u0430\u0442\u0438\u044F \xAB\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u043F\u043E\u0434\u043F\u0438\u0441\u043A\u0438\xBB.`,
      {},
      rows
    );
  }
  async function bindToken(trx, n, thread, token) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
    const link = await trx("comm_link_tokens").where({ hash: digest(token), state: "pending" }).andWhere("expires_at", ">", trx.fn.now()).forUpdate().first();
    if (!link) return false;
    const lead = await trx("leads").where({ id: link.lead_id }).first();
    if (!activeLead(lead) || lead.store_location_id !== n.store_id) return false;
    if (link.source_identity_id) {
      if (link.source_identity_id === thread.identity_id) return false;
      await trx("comm_link_tokens").where({ hash: link.hash }).update({ target_identity_id: thread.identity_id, state: "confirm" });
      const source = await trx("comm_threads").where({ identity_id: link.source_identity_id }).first();
      const sourceConnection = await trx("comm_connections").where({ id: source.connection_id }).first();
      await enqueue(
        trx,
        sourceConnection,
        source,
        `\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u0435 \u043F\u0440\u043E\u0434\u043E\u043B\u0436\u0435\u043D\u0438\u0435 \u044D\u0442\u043E\u0439 \u0437\u0430\u044F\u0432\u043A\u0438 \u0432 ${n.platform}.`,
        {},
        [["\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C", `link:${Buffer.from(link.hash, "hex").toString("base64url")}`]]
      );
      await enqueue(trx, n, thread, "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u0435 \u0441\u0432\u044F\u0437\u044C \u0432 \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u043C \u0447\u0430\u0442\u0435. \u0418\u0441\u0442\u043E\u0440\u0438\u044F \u043F\u043E\u043A\u0430 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430.");
      return true;
    }
    const [c] = await trx("comm_conversations").insert({ thread_id: thread.id, lead_id: lead.id }).onConflict(["thread_id", "lead_id"]).merge({ thread_id: thread.id }).returning("*");
    await trx("comm_access_grants").insert({ identity_id: thread.identity_id, lead_id: lead.id }).onConflict(["identity_id", "lead_id"]).merge({ revoked_at: null });
    await trx("comm_link_tokens").where({ hash: link.hash }).update({ state: "done", target_identity_id: thread.identity_id });
    await trx("comm_threads").where({ id: thread.id }).update({ selected_conversation_id: c.id });
    await enqueue(trx, n, thread, "\u0417\u0430\u044F\u0432\u043A\u0430 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0430. \u041D\u0430\u043F\u0438\u0448\u0438\u0442\u0435 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 \u043C\u0435\u043D\u0435\u0434\u0436\u0435\u0440\u0443.");
    return true;
  }
  async function processIncoming(connectionId) {
    enabled();
    return db.transaction(async (trx) => {
      const n = await trx("comm_connections").where({ id: connectionId, enabled: true }).forUpdate().first();
      if (!n) return null;
      const row = await trx("comm_inbound").where({ connection_id: n.id, state: "pending" }).orderBy("received_at").forUpdate().skipLocked().first();
      if (!row) return null;
      if (!isStoredEvent(row.event)) {
        await trx("comm_inbound").where({ id: row.id }).update({
          state: "failed",
          processed_at: trx.fn.now(),
          error_code: "INVALID_STORED_EVENT",
          result: { result: "failed", error: "INVALID_STORED_EVENT" }
        });
        return { id: row.id, failed: true, error: "INVALID_STORED_EVENT" };
      }
      const e = row.event;
      if (e.kind === "staff") {
        if (!staffProcessor) return fail("STAFF_ADAPTER_UNAVAILABLE", 503);
        const result = await staffProcessor(trx, n, row);
        await trx("comm_inbound").where({ id: row.id }).update({ state: "done", processed_at: trx.fn.now(), result });
        return result;
      }
      const { identity, thread } = await ensureIdentity(trx, n, e);
      if (e.kind === "availability" || e.kind === "started") {
        if (!identity.availability_at || new Date(identity.availability_at) <= new Date(e.occurredAt)) {
          await trx("comm_identities").where({ id: identity.id }).update({ availability: e.availability, availability_at: e.occurredAt });
          if (e.availability === "blocked")
            await trx("comm_outbox").where({ identity_id: identity.id, state: "pending" }).update({ state: "blocked", error_code: "RECIPIENT_UNAVAILABLE" });
        }
      }
      if (["message", "callback", "started"].includes(e.kind)) {
        await trx("comm_identities").where({ id: identity.id }).where(
          (q) => q.whereNull("last_active_at").orWhere("last_active_at", "<", e.occurredAt)
        ).update({ last_active_at: e.occurredAt });
        await event(trx, {
          connection_id: n.id,
          identity_id: identity.id,
          kind: "active",
          dedupe_key: `active:${row.id}`,
          occurred_at: e.occurredAt,
          is_test: identity.is_test
        });
      }
      let handled = false, resultCode = "ignored";
      let text = e.kind === "callback" ? e.callbackData || "" : e.text.trim();
      if (e.kind === "callback" && text.startsWith("conv:")) text = `dialog:${text.slice(5)}`;
      const start = text.match(/^\/start(?:@\w+)?(?:\s+(\S+))?$/);
      if (start?.[1] && /^[A-Za-z0-9_-]{43}$/.test(start[1])) {
        const linked = await bindToken(trx, n, thread, start[1]);
        resultCode = linked ? "linked" : "invalid_link";
        if (!linked)
          await enqueue(
            trx,
            n,
            thread,
            "\u0421\u0441\u044B\u043B\u043A\u0430 \u0443\u0436\u0435 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u043D\u0430 \u0438\u043B\u0438 \u0441\u0440\u043E\u043A \u0435\u0451 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044F \u0438\u0441\u0442\u0451\u043A. \u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0443\u044E\u0449\u0443\u044E \u0437\u0430\u044F\u0432\u043A\u0443 \u0438\u043B\u0438 \u0441\u043E\u0437\u0434\u0430\u0439\u0442\u0435 \u043D\u043E\u0432\u043E\u0435 \u043E\u0431\u0440\u0430\u0449\u0435\u043D\u0438\u0435.",
            {},
            menu
          );
        handled = true;
      } else if (start || ["/help", "main", "/start"].includes(text) || e.kind === "started") {
        if (start?.[1] && start[1].length < 65)
          await trx("comm_identities").where({ id: identity.id }).whereNull("source").update({ source: start[1] });
        await enqueue(
          trx,
          n,
          thread,
          String(
            n.settings?.welcome_text || "\u0417\u0434\u0440\u0430\u0432\u0441\u0442\u0432\u0443\u0439\u0442\u0435! \u042D\u0442\u043E I \u0421\u0412\u041E\u0418. \u041F\u043E\u043C\u043E\u0436\u0435\u043C \u043F\u043E\u0434\u043E\u0431\u0440\u0430\u0442\u044C, \u043F\u0440\u043E\u0434\u0430\u0442\u044C \u0438\u043B\u0438 \u043E\u0431\u043C\u0435\u043D\u044F\u0442\u044C \u0442\u0435\u0445\u043D\u0438\u043A\u0443 \u0438 \u043E\u0442\u0432\u0435\u0442\u0438\u043C \u043D\u0430 \u0432\u043E\u043F\u0440\u043E\u0441\u044B."
          ),
          {},
          menu
        );
        handled = true;
        resultCode = "selected";
      }
      if (e.kind === "callback" && text.startsWith("link:")) {
        const hash = Buffer.from(text.slice(5), "base64url").toString("hex"), link = await trx("comm_link_tokens").where({ hash, state: "confirm", source_identity_id: identity.id }).andWhere("expires_at", ">", trx.fn.now()).forUpdate().first();
        if (link) {
          const ids = [identity.id, link.target_identity_id].sort();
          const identities = await trx("comm_identities").whereIn("id", ids).orderBy("id").forUpdate();
          const target = identities.find((i) => i.id === link.target_identity_id);
          const contacts = await trx("comm_contacts").whereIn("id", [identity.contact_id, target.contact_id]).orderBy("id").forUpdate();
          if (contacts.some((c2) => c2.merged_into)) return fail("CONTACT_ALREADY_MERGED", 409);
          if (target.contact_id !== identity.contact_id) {
            await trx("comm_identities").where({ contact_id: target.contact_id }).update({ contact_id: identity.contact_id });
            await trx("comm_frequency").where({ contact_id: target.contact_id }).update({ contact_id: identity.contact_id });
            await trx("comm_outbox").where({ contact_id: target.contact_id, purpose: "marketing", state: "pending" }).update({ state: "cancelled", error_code: "IDENTITY_LINK_RECHECK" });
            await trx("comm_contacts").where({ id: target.contact_id }).update({ merged_into: identity.contact_id });
          }
          const targetThread = await trx("comm_threads").where({ identity_id: target.id }).first();
          const [c] = await trx("comm_conversations").insert({ thread_id: targetThread.id, lead_id: link.lead_id }).onConflict(["thread_id", "lead_id"]).merge({ thread_id: targetThread.id }).returning("*");
          await trx("comm_access_grants").insert({ identity_id: target.id, lead_id: link.lead_id }).onConflict(["identity_id", "lead_id"]).merge({ revoked_at: null });
          await trx("comm_threads").where({ id: targetThread.id }).update({ selected_conversation_id: c.id });
          await trx("comm_link_tokens").where({ hash }).update({ state: "done" });
          await event(trx, {
            identity_id: identity.id,
            kind: "identity_linked",
            dedupe_key: `link:${hash}`,
            facts: { target: target.id, lead: link.lead_id },
            is_test: identity.is_test
          });
          await enqueue(trx, n, thread, "\u0421\u0432\u044F\u0437\u044C \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0430 \u0434\u043B\u044F \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u0439 \u0437\u0430\u044F\u0432\u043A\u0438.");
        }
        handled = true;
      }
      if (["news", "/news"].includes(text)) {
        await subscriptions(trx, n, thread, null, e.id);
        handled = true;
        resultCode = "selected";
      }
      if (e.kind === "callback" && text.startsWith("news:")) {
        if (text === "news:discard") {
          await trx("comm_threads").where({ id: thread.id }).update({ subscription_draft: null });
          await subscriptions(trx, n, { ...thread, subscription_draft: null }, null, e.id);
        }
        if (text === "news:off") await subscriptions(trx, n, thread, [], e.id);
        else if (text === "news:save") {
          if (Array.isArray(thread.subscription_draft))
            await subscriptions(trx, n, thread, thread.subscription_draft, e.id);
        } else if (text.startsWith("news:toggle:")) {
          const key = text.slice(12);
          if (await trx("comm_topics").where({ key, active: true }).first()) {
            let draft = thread.subscription_draft ?? await trx("comm_subscriptions").where({ identity_id: identity.id, consent: true }).pluck("topic_key");
            draft = draft.includes(key) ? draft.filter((v) => v !== key) : [...draft, key];
            await trx("comm_threads").where({ id: thread.id }).update({ subscription_draft: JSON.stringify(draft) });
            await subscriptions(trx, n, { ...thread, subscription_draft: draft }, null, e.id);
          }
        }
        handled = true;
        resultCode = "selected";
      }
      if (["/dialogs", "dialogs"].includes(text)) {
        const choices = await trx("comm_conversations as c").join("leads as l", "l.id", "c.lead_id").where("c.thread_id", thread.id).whereIn("l.status", ["new", "in_progress", "waiting"]).select("c.id", "l.reference_code");
        await enqueue(
          trx,
          n,
          thread,
          choices.length ? "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0437\u0430\u044F\u0432\u043A\u0443." : "\u0410\u043A\u0442\u0438\u0432\u043D\u044B\u0445 \u0437\u0430\u044F\u0432\u043E\u043A \u043F\u043E\u043A\u0430 \u043D\u0435\u0442.",
          {},
          choices.map((c) => [c.reference_code || "\u0417\u0430\u044F\u0432\u043A\u0430", `dialog:${c.id}`])
        );
        handled = true;
        resultCode = "selected";
      }
      if (e.kind === "callback" && text.startsWith("dialog:")) {
        const id = text.slice(7);
        const c = UUID.test(id) ? await trx("comm_conversations").where({ id, thread_id: thread.id }).first() : null;
        if (c && await trx("comm_access_grants").where({ identity_id: identity.id, lead_id: c.lead_id }).whereNull("revoked_at").first()) {
          await trx("comm_threads").where({ id: thread.id }).update({ selected_conversation_id: id });
          await enqueue(trx, n, thread, "\u041D\u0430\u043F\u0438\u0448\u0438\u0442\u0435 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 \u043F\u043E \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u0439 \u0437\u0430\u044F\u0432\u043A\u0435.");
        }
        handled = true;
        resultCode = "selected";
      }
      if (["/new", "new"].includes(text)) {
        await enqueue(trx, n, thread, "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0442\u0435\u043C\u0443 \u043D\u043E\u0432\u043E\u0433\u043E \u043E\u0431\u0440\u0430\u0449\u0435\u043D\u0438\u044F.", {}, menu.slice(0, 3));
        handled = true;
        resultCode = "selected";
      }
      if (e.kind === "callback" && /^kind:(selection|trade|support)$/.test(text)) {
        await trx("comm_threads").where({ id: thread.id }).update({ pending_kind: text.slice(5), selected_conversation_id: null });
        await enqueue(trx, n, thread, "\u041E\u043F\u0438\u0448\u0438\u0442\u0435 \u0432\u043E\u043F\u0440\u043E\u0441 \u0438\u043B\u0438 \u043F\u0440\u0438\u043B\u043E\u0436\u0438\u0442\u0435 \u0444\u0430\u0439\u043B.");
        handled = true;
        resultCode = "selected";
      }
      if (e.kind === "unsupported")
        await enqueue(
          trx,
          n,
          thread,
          "\u042D\u0442\u043E\u0442 \u0444\u043E\u0440\u043C\u0430\u0442 \u043F\u043E\u043A\u0430 \u043D\u0435 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0435\u0442\u0441\u044F. \u041D\u0430\u043F\u0438\u0448\u0438\u0442\u0435 \u0442\u0435\u043A\u0441\u0442 \u0438\u043B\u0438 \u043F\u0440\u0438\u043B\u043E\u0436\u0438\u0442\u0435 \u0444\u043E\u0442\u043E, \u0430\u0443\u0434\u0438\u043E, \u0432\u0438\u0434\u0435\u043E \u043B\u0438\u0431\u043E \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442 \u0434\u043E 20 \u041C\u0411."
        );
      if (e.kind === "edited") {
        const original = await trx("comm_messages").where({ thread_id: thread.id, external_id: e.externalMessageId, direction: "in" }).first();
        if (original && (!original.edited_at || new Date(original.edited_at) < new Date(e.occurredAt)))
          await trx("comm_messages").where({ id: original.id }).update({ text: validText(e.text, 2e4), edited_at: e.occurredAt });
        if (!original) {
          await trx("comm_inbound").where({ id: row.id }).update({ state: "failed", error_code: "EDIT_AWAITS_ORIGINAL" });
          return { id: row.id, deferred: true };
        }
        resultCode = "received";
      } else if (e.kind === "message" && !handled && (e.text.trim() || e.attachments.length)) {
        let c = thread.selected_conversation_id ? await trx("comm_conversations").where({ id: thread.selected_conversation_id }).first() : null;
        const lead = c ? await trx("leads").where({ id: c.lead_id }).first() : null;
        if (c && !await trx("comm_access_grants").where({ identity_id: identity.id, lead_id: c.lead_id }).whereNull("revoked_at").first())
          c = null;
        if (!c || !activeLead(lead))
          c = await makeLead(trx, n, thread, e, thread.pending_kind || "support");
        const [message] = await trx("comm_messages").insert({
          thread_id: thread.id,
          conversation_id: c.id,
          direction: "in",
          text: validText(e.text, 2e4),
          external_id: e.externalMessageId,
          occurred_at: e.occurredAt,
          album_id: e.albumId
        }).onConflict(["thread_id", "external_id", "direction"]).ignore().returning("*");
        if (message)
          for (const a of e.attachments)
            await trx("comm_attachments").insert({
              message_id: message.id,
              conversation_id: c.id,
              connection_id: n.id,
              kind: a.kind,
              name: a.name,
              mime: a.mime,
              size: a.size !== null && a.size <= MAX_FILE_BYTES ? a.size : null,
              state: a.size !== null && a.size > MAX_FILE_BYTES ? "rejected" : "pending",
              error_code: a.size !== null && a.size > MAX_FILE_BYTES ? "FILE_TOO_LARGE" : null,
              external_ref: a
            });
        if (message && staffNotifier) await staffNotifier(trx, n, c, message);
        if (message)
          await trx("comm_inbound").where({ connection_id: n.id, state: "failed", error_code: "EDIT_AWAITS_ORIGINAL" }).whereRaw("event->>'externalMessageId'=?", [e.externalMessageId]).update({ state: "pending", error_code: null });
        await trx("comm_conversations").where({ id: c.id }).update({
          last_inbound_at: e.occurredAt,
          awaiting_since: c.awaiting_since || e.occurredAt,
          handling: lead?.assigned_to ? "agent" : "queued",
          version: trx.raw("version+1")
        });
        if (!lead) await enqueue(trx, n, thread, "\u041E\u0431\u0440\u0430\u0449\u0435\u043D\u0438\u0435 \u043F\u0440\u0438\u043D\u044F\u0442\u043E. \u041E\u0442\u0432\u0435\u0442 \u043C\u0435\u043D\u0435\u0434\u0436\u0435\u0440\u0430 \u043F\u0440\u0438\u0434\u0451\u0442 \u0441\u044E\u0434\u0430.");
        resultCode = "received";
      }
      await event(trx, {
        connection_id: n.id,
        identity_id: identity.id,
        kind: e.kind,
        dedupe_key: `event:${row.id}`,
        occurred_at: e.occurredAt,
        is_test: identity.is_test
      });
      await trx("comm_inbound").where({ id: row.id }).update({ state: "done", processed_at: trx.fn.now(), result: { result: resultCode } });
      return { id: row.id, result: resultCode };
    });
  }
  async function commands(a, command, transaction) {
    if (!UUID.test(command.key || "")) return fail("COMMAND_KEY_REQUIRED");
    const execute = async (trx) => {
      const fingerprint = digest(canonical(command));
      await trx("comm_command_receipts").insert({
        actor_id: a.user,
        command_type: command.type,
        command_key: command.key,
        fingerprint
      }).onConflict(["actor_id", "command_type", "command_key"]).ignore();
      const receipt = await trx("comm_command_receipts").where({ actor_id: a.user, command_type: command.type, command_key: command.key }).forUpdate().first();
      if (receipt.fingerprint !== fingerprint) return fail("IDEMPOTENCY_PARAMETER_MISMATCH", 409);
      const { c, service, staff, accountability } = await permitted(
        trx,
        a,
        command.conversation_id || ""
      );
      if (receipt.result) return receipt.result;
      await trx("leads").where({ id: c.lead_id }).forUpdate().first();
      const lead = await service.readOne(c.lead_id, {
        fields: [
          "id",
          "status",
          "assigned_to",
          "store_location_id",
          "is_test",
          "reference_code",
          "kind"
        ]
      });
      const locked = await trx("comm_conversations").where({ id: c.id }).forUpdate().first();
      if (command.type !== "read" && command.expected_version !== locked.version)
        return fail("STALE_CONVERSATION", 409);
      const n = await trx("comm_connections").where({ id: c.connection_id }).first(), thread = await trx("comm_threads").where({ id: c.thread_id }).first();
      const p = command.payload || {};
      let result = { ok: true };
      if (command.type === "read") {
        const latest = await trx("comm_messages").where({ conversation_id: c.id }).max("sequence as sequence").first();
        await trx("comm_reads").insert({ user_id: a.user, conversation_id: c.id, sequence: latest.sequence || 0 }).onConflict(["user_id", "conversation_id"]).merge({ sequence: latest.sequence || 0 });
      } else if (command.type === "claim" || command.type === "assign") {
        const current = await trx("leads").where({ id: lead.id }).forUpdate().first();
        if (!activeLead(current)) return fail("LEAD_CLOSED", 409);
        if (command.type === "claim" && current.assigned_to && current.assigned_to !== a.user)
          return fail("ALREADY_ASSIGNED", 409);
        const assignee = command.type === "claim" ? a.user : String(p.user_id || "");
        if (command.type === "assign" && !staff.can_manage) return fail("FORBIDDEN", 403);
        if (!UUID.test(assignee) || !await trx("comm_staff").where({ user_id: assignee, store_id: c.store_id, enabled: true }).first())
          return fail("INVALID_ASSIGNEE");
        await userAccountability(trx, assignee);
        await service.updateOne(lead.id, { assigned_to: assignee, status: "in_progress" });
        await trx("comm_conversations").where({ id: c.id }).update({ handling: "agent" });
      } else if (command.type === "reply" || command.type === "note") {
        if (command.type === "reply" && (!activeLead(lead) || lead.assigned_to !== a.user))
          return fail("CLAIM_REQUIRED", 403);
        const text = validText(p.text ?? "");
        const ids = Array.isArray(p.attachment_ids) ? p.attachment_ids : [];
        if (ids.length > 10 || ids.some((id) => typeof id !== "string" || !UUID.test(id)))
          return fail("INVALID_ATTACHMENTS");
        if (!text && !ids.length) return fail("EMPTY_MESSAGE");
        const files = ids.length ? await trx("comm_attachments").whereIn("id", ids).where({ uploaded_by: a.user, conversation_id: c.id, state: "ready" }).whereNull("message_id").forUpdate() : [];
        if (files.length !== ids.length) return fail("ATTACHMENT_NOT_READY", 409);
        const comments = await itemService(trx, "lead_comments", accountability);
        await comments.createOne({
          lead: lead.id,
          comment: text || "\u0412\u043B\u043E\u0436\u0435\u043D\u0438\u0435",
          outcome: "note",
          created_by: a.user
        });
        const [m] = await trx("comm_messages").insert({
          thread_id: thread.id,
          conversation_id: c.id,
          direction: command.type === "note" ? "internal" : "out",
          text,
          created_by: a.user
        }).returning("*");
        if (ids.length)
          await trx("comm_attachments").whereIn("id", ids).update({ message_id: m.id });
        if (command.type === "reply") {
          const outbox = await enqueue(trx, n, thread, text || "\u0412\u043B\u043E\u0436\u0435\u043D\u0438\u0435", {
            conversation_id: c.id,
            message_id: m.id,
            created_by: a.user,
            expected_version: locked.version + 1,
            dedupe_key: `reply:${command.key}`,
            expires_at: new Date(Date.now() + 24 * 36e5)
          });
          if (!text) await trx("comm_operations").where({ outbox_id: outbox.id }).delete();
          let position = text ? 1 : 0;
          const attachmentRecipient = n.platform === "max" ? { user_id: await maxUserId(trx, thread) } : { peer_id: thread.external_peer_id };
          for (const f of files)
            await trx("comm_operations").insert({
              outbox_id: outbox.id,
              position: position++,
              method: "attachment",
              payload: { attachment_id: f.id, ...attachmentRecipient }
            });
        }
        result = { ok: true, message_id: m.id };
      } else if (command.type === "handling") {
        if (lead.assigned_to !== a.user && !staff.can_manage) return fail("FORBIDDEN", 403);
        const handling = nextHandling(locked.handling, p.state);
        await trx("comm_conversations").where({ id: c.id }).update({ handling, ...handling === "closed" ? { closed_at: trx.fn.now() } : {} });
        if (handling === "closed") await service.updateOne(lead.id, { status: "closed" });
        else if (handling === "waiting") await service.updateOne(lead.id, { status: "waiting" });
        else if (handling === "agent") await service.updateOne(lead.id, { status: "in_progress" });
      } else if (command.type === "link_start") {
        if (lead.assigned_to !== a.user) return fail("CLAIM_REQUIRED", 403);
        const token = randomBytes(32).toString("base64url");
        await trx("comm_link_tokens").insert({
          hash: digest(token),
          source_identity_id: thread.identity_id,
          lead_id: lead.id,
          expires_at: new Date(Date.now() + 15 * 6e4)
        });
        result = { ok: true, token, expires_in: 900 };
      } else return fail("UNKNOWN_COMMAND");
      if (command.type !== "read")
        await trx("comm_conversations").where({ id: c.id }).increment("version", 1);
      result.version = (await trx("comm_conversations").where({ id: c.id }).first()).version;
      await event(trx, {
        connection_id: c.connection_id,
        lead_id: lead.id,
        kind: command.type,
        dedupe_key: `command:${receipt.id}`,
        facts: { actor: a.user },
        is_test: Boolean(lead.is_test)
      });
      await trx("comm_command_receipts").where({ id: receipt.id }).update({
        result: command.type === "link_start" ? { ok: true, issued: true, expires_in: 900, version: result.version } : result
      });
      return result;
    };
    return transaction ? execute(transaction) : db.transaction(execute);
  }
  async function inbox(a, query = {}) {
    const stores = await db("comm_staff").where({ user_id: a.user, enabled: true }).pluck("store_id");
    let q = db("comm_conversations as c").join("leads as l", "l.id", "c.lead_id").join("comm_threads as t", "t.id", "c.thread_id").join("comm_connections as n", "n.id", "t.connection_id").join("comm_identities as i", "i.id", "t.identity_id").leftJoin("comm_reads as r", function() {
      this.on("r.conversation_id", "=", "c.id").andOn("r.user_id", "=", db.raw("?", [a.user]));
    }).whereIn("n.store_id", stores).whereRaw("(l.store_location_id IS NULL OR l.store_location_id=n.store_id)");
    const view = query.view || query.filter;
    if (view === "mine") q = q.where("l.assigned_to", a.user);
    else if (view === "unassigned") q = q.whereNull("l.assigned_to");
    else if (view === "awaiting") q = q.whereNotNull("c.awaiting_since");
    else if (view === "closed") q = q.where("c.handling", "closed");
    else q = q.whereNot("c.handling", "closed");
    if (["telegram", "max", "vk"].includes(query.platform))
      q = q.where("n.platform", query.platform);
    const rows = await q.orderByRaw("c.awaiting_since ASC NULLS LAST").orderBy("c.created_at", "desc").limit(100).select(
      "c.*",
      "l.reference_code",
      "l.kind",
      "l.status",
      "l.assigned_to",
      "n.platform",
      "i.external_user_id",
      db.raw(`CASE
          WHEN c.first_agent_response_at IS NOT NULL AND c.first_response_due_at IS NOT NULL
            THEN CASE WHEN c.first_agent_response_at<=c.first_response_due_at THEN 'met' ELSE 'breached' END
          WHEN c.sla_escalated_at IS NOT NULL THEN 'escalated'
          WHEN c.escalation_due_at<=now() THEN 'overdue'
          WHEN c.first_response_due_at<=now() THEN 'warning'
          WHEN c.first_response_due_at IS NOT NULL THEN 'on_track'
          ELSE 'untracked'
        END AS sla_state`),
      db.raw(
        "(SELECT count(*)::int FROM comm_messages m WHERE m.conversation_id=c.id AND m.direction='in' AND m.deleted_at IS NULL AND m.sequence>COALESCE(r.sequence,0)) AS unread_count"
      )
    );
    const service = await itemService(db, "leads", await userAccountability(db, a.user));
    const ids = rows.map((r) => r.lead_id);
    if (!ids.length) return [];
    const allowed2 = await service.readByQuery({
      fields: ["id"],
      limit: 100,
      filter: { id: { _in: ids } }
    });
    return rows.filter((r) => allowed2.some((v) => v.id === r.lead_id));
  }
  async function messages(a, threadId, query = {}) {
    const conversationId = String(query.conversation_id || "");
    const { c } = await permitted(db, a, conversationId);
    if (c.thread_id !== threadId) return fail("FORBIDDEN", 403);
    let q = db("comm_messages").where({ conversation_id: c.id }).whereNull("deleted_at");
    if (query.before) {
      if (!/^\d+$/.test(String(query.before))) return fail("INVALID_CURSOR");
      q = q.where("sequence", "<", query.before);
    }
    const rows = await q.orderBy("sequence", "desc").limit(50);
    const files = rows.length ? await db("comm_attachments").whereIn(
      "message_id",
      rows.map((r) => r.id)
    ).select("id", "message_id", "kind", "name", "mime", "size", "state", "error_code") : [];
    const jobs = rows.length ? await db("comm_outbox").whereIn(
      "message_id",
      rows.map((r) => r.id)
    ).select("message_id", "state", "error_code") : [];
    return rows.map((m) => ({
      ...m,
      attachments: files.filter((f) => f.message_id === m.id),
      delivery: jobs.find((j) => j.message_id === m.id) || null
    })).reverse();
  }
  async function audience(a) {
    const scopes = await db("comm_staff").where({ user_id: a.user, enabled: true, can_manage: true }).pluck("store_id");
    if (!scopes.length) return fail("FORBIDDEN", 403);
    const result = await db.raw(
      `SELECT n.id,n.name,n.platform,count(DISTINCT i.id)::int AS users,
      count(DISTINCT i.id) FILTER(WHERE EXISTS(SELECT 1 FROM comm_subscriptions s WHERE s.identity_id=i.id AND s.consent))::int AS subscribers,
      count(DISTINCT i.id) FILTER(WHERE i.last_active_at>=now()-interval '30 days')::int AS active_30,
      count(DISTINCT i.id) FILTER(WHERE i.last_active_at>=now()-interval '7 days')::int AS active_7,
      count(DISTINCT i.id) FILTER(WHERE i.first_seen_at>=now()-interval '30 days')::int AS new_30,
      count(DISTINCT i.id) FILTER(WHERE i.availability='blocked')::int AS blocked,
      count(DISTINCT i.id) FILTER(WHERE i.availability='unknown')::int AS unknown,
      n.last_received_at,n.last_sent_at FROM comm_connections n LEFT JOIN comm_identities i ON i.connection_id=n.id AND NOT i.is_test
      WHERE n.store_id=ANY(?::uuid[]) GROUP BY n.id ORDER BY n.name`,
      [scopes]
    );
    const topics = await db.raw(
      `SELECT n.id AS connection_id,s.topic_key,count(DISTINCT s.identity_id)::int AS subscribers
      FROM comm_subscriptions s JOIN comm_identities i ON i.id=s.identity_id JOIN comm_connections n ON n.id=i.connection_id
      WHERE s.consent AND NOT i.is_test AND n.store_id=ANY(?::uuid[]) GROUP BY n.id,s.topic_key`,
      [scopes]
    );
    const daily = await db.raw(
      `SELECT e.connection_id,(e.occurred_at AT TIME ZONE 'Europe/Moscow')::date AS day,e.kind,count(*)::int AS events
      FROM comm_events e JOIN comm_connections n ON n.id=e.connection_id WHERE NOT e.is_test AND n.store_id=ANY(?::uuid[])
      AND e.occurred_at>=now()-interval '30 days' AND e.kind IN ('first_seen','subscribed','unsubscribed','lead_created') GROUP BY 1,2,3 ORDER BY 2`,
      [scopes]
    );
    return {
      connections: result.rows,
      topics: topics.rows,
      daily: daily.rows,
      baseline_at: (await db("comm_runtime").where({ id: 1 }).first())?.baseline_at
    };
  }
  return {
    actor,
    permitted,
    userAccountability,
    ingest,
    processIncoming,
    commands,
    inbox,
    messages,
    audience,
    enqueue,
    event,
    setStaffProcessor,
    setStaffNotifier
  };
}

// packages/communications/src/delivery.ts
init_policy();
import { randomUUID as randomUUID2 } from "node:crypto";
function providerAttachment(platform, outcome) {
  if (!("resume" in outcome) || !outcome.resume || outcome.resume.platform !== platform)
    return null;
  if (platform === "max") {
    const value2 = outcome.resume.attachment;
    if (!value2 || !["image", "video", "audio", "file"].includes(value2.type) || typeof value2.payload?.token !== "string" || !value2.payload.token || value2.payload.token.length > 2e3)
      return fail("INVALID_PROVIDER_RESUME");
    return { type: value2.type, payload: { token: value2.payload.token } };
  }
  const value = outcome.resume.attachment;
  if (typeof value !== "string" || !/^(?:photo|doc)-?\d+_\d+(?:_[A-Za-z0-9_-]+)?$/.test(value))
    return fail("INVALID_PROVIDER_RESUME");
  return value;
}
function createDelivery(context, service) {
  const db = context.database;
  async function worker(trx, connectionId, user) {
    if (typeof user !== "string" || !UUID.test(user)) return fail("FORBIDDEN", 403);
    const connection = await trx("comm_connections").where({ id: connectionId, worker_user_id: user, enabled: true }).forUpdate().first();
    if (!connection) return fail("FORBIDDEN", 403);
    const u = await trx("directus_users").where({ id: user, status: "active" }).first();
    if (!u) return fail("FORBIDDEN", 403);
    const accountability = await service.userAccountability(trx, user);
    const admin = await trx("directus_access as a").join("directus_policies as p", "p.id", "a.policy").where("p.admin_access", true).where((q) => q.where("a.user", user).orWhereIn("a.role", accountability.roles)).first();
    if (admin) return fail("ADMIN_WORKER_FORBIDDEN", 403);
    return connection;
  }
  async function summary(trx, outboxId) {
    const ops = await trx("comm_operations").where({ outbox_id: outboxId });
    let state = "sending";
    if (ops.some((o) => o.state === "uncertain")) state = "uncertain";
    else if (ops.every((o) => o.state === "accepted")) state = "accepted";
    else if (ops.some((o) => o.state === "failed" || o.state === "cancelled"))
      state = ops.some((o) => o.state === "accepted") ? "partial" : "failed";
    else if (ops.every((o) => o.state === "pending")) state = "pending";
    await trx("comm_outbox").where({ id: outboxId }).update({ state, ...state === "accepted" ? { accepted_at: trx.fn.now() } : {} });
    return state;
  }
  async function next(connectionId, user, allowedMethods) {
    if (!flag(context.env.ISVOI_COMMUNICATIONS_ENABLED))
      return fail("COMMUNICATIONS_DISABLED", 503);
    return db.transaction(async (trx) => {
      const n = await worker(trx, connectionId, user);
      const runtime = await trx("comm_runtime").where({ id: 1 }).first();
      if (!runtime?.active || !runtime.sending_enabled || runtime.recovery_hold) return null;
      const expired = await trx("comm_operations as o").join("comm_outbox as b", "b.id", "o.outbox_id").where("b.connection_id", n.id).where("o.state", "in_flight").andWhere("o.lease_until", "<", trx.fn.now()).select("o.id", "o.outbox_id");
      for (const o of expired) {
        await trx("comm_operations").where({ id: o.id }).update({ state: "uncertain", error_code: "LEASE_EXPIRED_UNKNOWN" });
        await summary(trx, o.outbox_id);
      }
      if (new Date(n.send_after) > /* @__PURE__ */ new Date()) return null;
      const jobs = await trx("comm_outbox as b").where("b.connection_id", n.id).whereIn("b.state", ["pending", "sending"]).andWhere("b.due_at", "<=", trx.fn.now()).whereRaw(
        "NOT EXISTS (SELECT 1 FROM comm_outbox older WHERE older.thread_id=b.thread_id AND (older.created_at,older.id)<(b.created_at,b.id) AND older.state IN ('pending','sending','uncertain','partial'))"
      ).orderByRaw("CASE WHEN b.purpose IN ('service','staff') THEN 0 ELSE 1 END").orderBy("b.created_at").limit(100).select("b.*").forUpdate().skipLocked();
      for (const b of jobs) {
        const reject = async (code) => {
          await trx("comm_outbox").where({ id: b.id }).update({ state: "suppressed", error_code: code });
          await trx("comm_operations").where({ outbox_id: b.id, state: "pending" }).update({ state: "cancelled", error_code: code });
        };
        if (b.expires_at && new Date(b.expires_at) <= /* @__PURE__ */ new Date()) {
          await reject("EXPIRED");
          continue;
        }
        if (b.identity_id) {
          const identity = await trx("comm_identities").where({ id: b.identity_id }).first();
          if (identity.availability === "blocked") {
            await reject("RECIPIENT_UNAVAILABLE");
            continue;
          }
          if (b.thread_id && !await trx("comm_threads").where({ id: b.thread_id, identity_id: b.identity_id, connection_id: n.id }).first()) {
            await reject("RECIPIENT_CHANGED");
            continue;
          }
        }
        if (b.created_by && b.purpose === "service") {
          try {
            const { lead } = await service.permitted(
              trx,
              { user: b.created_by },
              b.conversation_id
            );
            if (lead.assigned_to !== b.created_by || !["new", "in_progress", "waiting"].includes(lead.status)) {
              await reject("ASSIGNMENT_CHANGED");
              continue;
            }
          } catch {
            await reject("AUTHOR_ACCESS_REVOKED");
            continue;
          }
        }
        if (b.purpose === "marketing") {
          const campaign = await trx("comm_campaigns").where({ id: b.campaign_id }).first();
          const identity = await trx("comm_identities").where({ id: b.identity_id }).first();
          if (!n.marketing_enabled || !campaign || !["approved", "sending"].includes(campaign.state) || identity.contact_id !== b.contact_id || identity.is_test !== campaign.is_test) {
            await reject("CAMPAIGN_NOT_ALLOWED");
            continue;
          }
          if (!await trx("comm_subscriptions").where({ identity_id: b.identity_id, topic_key: campaign.topic_key, consent: true }).first()) {
            await reject("CONSENT_WITHDRAWN");
            continue;
          }
          const window2 = marketingWindow(/* @__PURE__ */ new Date());
          if (!window2.allowed) {
            await trx("comm_outbox").where({ id: b.id }).update({ due_at: window2.next });
            continue;
          }
          await trx("comm_contacts").where({ id: b.contact_id }).forUpdate().first();
          if (!await trx("comm_frequency").where({ outbox_id: b.id }).first()) {
            const count = await trx("comm_frequency").where({ contact_id: b.contact_id }).whereNull("released_at").andWhere("reserved_at", ">", trx.raw("now()-interval '7 days'")).count("* as count").first();
            if (Number(count.count) >= 2) {
              await reject("FREQUENCY_LIMIT");
              continue;
            }
            await trx("comm_frequency").insert({ contact_id: b.contact_id, outbox_id: b.id });
          }
        }
        const ops = await trx("comm_operations").where({ outbox_id: b.id }).orderBy("position").forUpdate();
        const op = ops.find((o) => o.state !== "accepted");
        if (!op || op.state !== "pending") continue;
        if (allowedMethods && !allowedMethods.includes(op.method)) continue;
        let payload = { ...op.payload };
        if (payload.card_id) {
          const card = await trx("comm_staff_cards").where({ id: payload.card_id, connection_id: n.id }).first();
          if (!card) {
            await reject("STAFF_CARD_MISSING");
            continue;
          }
          if (op.method !== "topic" && !card.topic_id) continue;
          if (op.method !== "topic") payload.message_thread_id = Number(card.topic_id);
          for (const key of ["card_id", "is_card", "draft_id", "draft_stage", "conversation_id"])
            delete payload[key];
        }
        const attemptId = randomUUID2(), leaseVersion = op.lease_version + 1;
        await trx("comm_operations").where({ id: op.id }).update({
          state: "in_flight",
          attempt_id: attemptId,
          lease_version: leaseVersion,
          lease_until: new Date(Date.now() + 9e4),
          worker_id: user,
          attempts: op.attempts + 1
        });
        await trx("comm_attempts").insert({
          id: attemptId,
          operation_id: op.id,
          lease_version: leaseVersion
        });
        await trx("comm_outbox").where({ id: b.id }).update({ state: "sending" });
        await trx("comm_connections").where({ id: n.id }).update({ send_after: new Date(Date.now() + (b.purpose === "marketing" ? 3200 : 1100)) });
        return {
          ...op,
          payload,
          state: "in_flight",
          attempt_id: attemptId,
          lease_version: leaseVersion,
          connection_id: n.id,
          platform: n.platform
        };
      }
      return null;
    });
  }
  async function complete(connectionId, user, input) {
    if (!UUID.test(input?.attempt_id || "")) return fail("INVALID_ATTEMPT");
    const outcome = input.outcome;
    if (!outcome || ![
      "accepted",
      "rate_limited",
      "retryable",
      "rejected",
      "blocked",
      "connection_error",
      "unknown"
    ].includes(outcome.type))
      return fail("INVALID_OUTCOME");
    if (outcome.type === "accepted" && (typeof outcome.externalId !== "string" || !outcome.externalId || outcome.externalId.length > 200))
      return fail("INVALID_EXTERNAL_ID");
    return db.transaction(async (trx) => {
      const n = await worker(trx, connectionId, user);
      const preparedAttachment = providerAttachment(n.platform, outcome);
      const attempt = await trx("comm_attempts").where({ id: input.attempt_id }).forUpdate().first();
      if (!attempt) return fail("NOT_FOUND", 404);
      const op = await trx("comm_operations").where({ id: attempt.operation_id }).forUpdate().first();
      const b = await trx("comm_outbox").where({ id: op.outbox_id, connection_id: n.id }).forUpdate().first();
      if (!b || op.worker_id !== user || attempt.lease_version !== input.lease_version)
        return fail("FORBIDDEN", 403);
      if (attempt.completed_at) return { state: b.state, replayed: true };
      if (op.attempt_id !== attempt.id) return fail("SUPERSEDED_ATTEMPT", 409);
      await trx("comm_attempts").where({ id: attempt.id }).update({
        completed_at: trx.fn.now(),
        outcome,
        late: new Date(op.lease_until) < /* @__PURE__ */ new Date()
      });
      let state = "failed", error = "code" in outcome ? String(outcome.code).slice(0, 100) : null;
      if (outcome.type === "accepted") {
        state = "accepted";
        await trx("comm_connections").where({ id: n.id }).update({ last_sent_at: trx.fn.now(), error_code: null });
      } else if (outcome.type === "unknown") state = "uncertain";
      else if (outcome.type === "retryable") {
        if (op.attempts >= 8) {
          state = "failed";
          error = "RETRY_LIMIT_REACHED";
        } else {
          state = "pending";
          const delaySeconds = Math.min(300, 2 ** Math.min(op.attempts, 8));
          const due = new Date(Date.now() + delaySeconds * 1e3);
          await trx("comm_outbox").where({ id: b.id }).update({ due_at: due });
          await trx("comm_connections").where({ id: n.id }).update({ send_after: due });
        }
      } else if (outcome.type === "rate_limited") {
        state = "pending";
        const due = new Date(
          Date.now() + Math.max(1, Math.min(86400, Number(outcome.retryAfter) || 60)) * 1e3
        );
        await trx("comm_outbox").where({ id: b.id }).update({ due_at: due });
        await trx("comm_connections").where({ id: n.id }).update({ send_after: due });
      } else if (outcome.type === "connection_error")
        await trx("comm_connections").where({ id: n.id }).update({ enabled: false, error_code: error });
      else if (outcome.type === "blocked" && b.identity_id)
        await trx("comm_identities").where({ id: b.identity_id }).update({ availability: "blocked", availability_at: trx.fn.now() });
      await trx("comm_operations").where({ id: op.id }).update({
        state,
        error_code: error,
        external_id: outcome.type === "accepted" ? outcome.externalId : null,
        ...preparedAttachment ? { payload: { ...op.payload, provider_attachment: preparedAttachment } } : {}
      });
      if (outcome.type === "accepted" && op.payload.card_id) {
        if (op.method === "topic")
          await trx("comm_staff_cards").where({ id: op.payload.card_id }).update({ topic_id: outcome.externalId });
        else if (op.payload.is_card)
          await trx("comm_staff_cards").where({ id: op.payload.card_id }).update({ message_id: outcome.externalId });
        if (op.payload.draft_id && ["prompt", "preview"].includes(op.payload.draft_stage))
          await trx("comm_staff_drafts").where({ id: op.payload.draft_id }).update({ [`${op.payload.draft_stage}_message_id`]: outcome.externalId });
      }
      const result = await summary(trx, b.id);
      if (outcome.type === "accepted" && b.message_id && b.purpose === "service") {
        const message = await trx("comm_messages").where({ id: b.message_id }).first();
        const conversation = await trx("comm_conversations").where({ id: b.conversation_id }).forUpdate().first("first_agent_response_at", "lead_id");
        await trx("comm_conversations").where({ id: b.conversation_id }).update({
          last_agent_reply_at: trx.fn.now(),
          first_agent_response_at: trx.raw("COALESCE(first_agent_response_at,now())"),
          awaiting_since: trx.raw(
            "CASE WHEN last_inbound_at<=? THEN NULL ELSE awaiting_since END",
            [message.occurred_at]
          )
        });
        if (!conversation.first_agent_response_at)
          await service.event(trx, {
            connection_id: n.id,
            identity_id: b.identity_id,
            lead_id: conversation.lead_id,
            kind: "first_agent_response",
            dedupe_key: `conversation:${b.conversation_id}:first-agent-response`,
            is_test: n.mode === "test"
          });
      }
      await service.event(trx, {
        connection_id: n.id,
        identity_id: b.identity_id,
        kind: "delivery_result",
        dedupe_key: `attempt:${attempt.id}`,
        facts: { outbox: b.id, outcome: outcome.type },
        is_test: n.mode === "test"
      });
      return { state: result };
    });
  }
  return { worker, next, complete };
}

// packages/communications/src/endpoint.ts
init_attachments();

// packages/communications/src/staff.ts
init_policy();
import { randomUUID as randomUUID4 } from "node:crypto";
var commandKey = (s) => {
  const h = digest(s);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
function createStaff(context, service) {
  async function queue(trx, n, card, text, values = {}, markup) {
    const destination = await trx("comm_destinations").where({ id: card.destination_id, enabled: true, kind: "staff" }).first();
    if (!destination) return fail("STAFF_DESTINATION_DISABLED", 503);
    const id = randomUUID4();
    await trx("comm_outbox").insert({
      id,
      connection_id: n.id,
      purpose: "staff",
      dedupe_key: `staff:${id}`,
      conversation_id: values.conversation_id
    });
    await trx("comm_operations").insert({
      outbox_id: id,
      method: "text",
      payload: {
        chat_id: destination.external_id,
        text,
        card_id: card.id,
        ...values,
        ...markup ? { reply_markup: markup } : {}
      }
    });
    return id;
  }
  async function ensureCard(trx, n, c) {
    if (n.platform !== "telegram") return;
    const destination = await trx("comm_destinations").where({ connection_id: n.id, kind: "staff", enabled: true }).first();
    if (!destination) return;
    const lead = await trx("leads").where({ id: c.lead_id }).first();
    let card = await trx("comm_staff_cards").where({ connection_id: n.id, lead_id: c.lead_id }).first();
    if (!card) {
      [card] = await trx("comm_staff_cards").insert({ connection_id: n.id, lead_id: c.lead_id, destination_id: destination.id }).returning("*");
      const id = randomUUID4();
      await trx("comm_outbox").insert({
        id,
        connection_id: n.id,
        purpose: "staff",
        dedupe_key: `staff-card:${card.id}`
      });
      await trx("comm_operations").insert([
        {
          outbox_id: id,
          position: 0,
          method: "topic",
          payload: {
            chat_id: destination.external_id,
            name: String(lead.reference_code || "\u041E\u0431\u0440\u0430\u0449\u0435\u043D\u0438\u0435").slice(0, 128),
            card_id: card.id
          }
        },
        {
          outbox_id: id,
          position: 1,
          method: "text",
          payload: {
            chat_id: destination.external_id,
            text: `${lead.reference_code || "\u0417\u0430\u044F\u0432\u043A\u0430"} \xB7 ${lead.kind}
\u041D\u043E\u0432\u044B\u0439 \u043A\u043B\u0438\u0435\u043D\u0442\u0441\u043A\u0438\u0439 \u0434\u0438\u0430\u043B\u043E\u0433.`,
            card_id: card.id,
            is_card: true,
            reply_markup: {
              inline_keyboard: [
                [{ text: "\u041F\u0440\u0438\u043D\u044F\u0442\u044C \u0432 \u0440\u0430\u0431\u043E\u0442\u0443", callback_data: `take:${card.id}` }],
                [{ text: "\u041E\u0442\u0432\u0435\u0442\u0438\u0442\u044C \u043A\u043B\u0438\u0435\u043D\u0442\u0443", callback_data: `reply:${c.id}` }]
              ]
            }
          }
        }
      ]);
    }
    return card;
  }
  async function notify(trx, n, c, message) {
    const card = await ensureCard(trx, n, c);
    if (!card) return;
    await queue(
      trx,
      n,
      card,
      `\u041A\u043B\u0438\u0435\u043D\u0442:
${String(message.text || "\u0412\u043B\u043E\u0436\u0435\u043D\u0438\u0435").slice(0, 3500)}`,
      { conversation_id: c.id },
      { inline_keyboard: [[{ text: "\u041E\u0442\u0432\u0435\u0442\u0438\u0442\u044C \u043A\u043B\u0438\u0435\u043D\u0442\u0443", callback_data: `reply:${c.id}` }]] }
    );
  }
  async function sweep(trx, n) {
    if (n.platform !== "telegram") return null;
    const c = await trx("comm_conversations as c").join("comm_threads as t", "t.id", "c.thread_id").join("leads as l", "l.id", "c.lead_id").where({ "t.connection_id": n.id }).whereNull("c.closed_at").whereNull("c.first_agent_response_at").whereNull("c.sla_escalated_at").where("c.escalation_due_at", "<=", trx.fn.now()).orderBy("c.escalation_due_at").select("c.*", "l.reference_code").forUpdate("c").skipLocked().first();
    if (!c) return null;
    const card = await ensureCard(trx, n, c);
    if (!card) return null;
    await queue(
      trx,
      n,
      card,
      `SLA: \u043F\u043E \u0437\u0430\u044F\u0432\u043A\u0435 ${c.reference_code || c.lead_id} \u043D\u0435\u0442 \u043F\u0435\u0440\u0432\u043E\u0433\u043E \u043E\u0442\u0432\u0435\u0442\u0430 \u043C\u0435\u043D\u0435\u0434\u0436\u0435\u0440\u0430 \u0437\u0430 \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043D\u043E\u0435 \u0440\u0430\u0431\u043E\u0447\u0435\u0435 \u0432\u0440\u0435\u043C\u044F.`,
      { conversation_id: c.id },
      {
        inline_keyboard: [
          [{ text: "\u041F\u0440\u0438\u043D\u044F\u0442\u044C \u0432 \u0440\u0430\u0431\u043E\u0442\u0443", callback_data: `take:${card.id}` }],
          [{ text: "\u041E\u0442\u0432\u0435\u0442\u0438\u0442\u044C \u043A\u043B\u0438\u0435\u043D\u0442\u0443", callback_data: `reply:${c.id}` }]
        ]
      }
    );
    await trx("comm_conversations").where({ id: c.id }).update({ sla_escalated_at: trx.fn.now() });
    await service.event(trx, {
      connection_id: n.id,
      lead_id: c.lead_id,
      kind: "sla_escalated",
      dedupe_key: `conversation:${c.id}:sla-escalated`,
      is_test: n.mode === "test",
      facts: { conversation_id: c.id }
    });
    return { result: "sla_escalated", conversation_id: c.id };
  }
  async function process2(trx, n, row) {
    const raw = row.event.raw, q = raw.callback_query, m = q?.message || raw.message, from = q?.from || m?.from;
    if (!m || from?.is_bot !== false || m.sender_chat || !m.message_thread_id)
      return { result: "ignored" };
    if (q && String(m.from?.id) !== n.external_id) return { result: "ignored" };
    const account = await trx("comm_staff_accounts").where({ connection_id: n.id, external_user_id: String(from.id), enabled: true }).first();
    if (!account) return { result: "forbidden" };
    const card = await trx("comm_staff_cards as c").join("comm_destinations as d", "d.id", "c.destination_id").where({
      "c.connection_id": n.id,
      "c.topic_id": String(m.message_thread_id),
      "d.external_id": String(m.chat.id),
      "d.enabled": true
    }).select("c.*").first();
    if (!card) return { result: "stale" };
    const a = {
      user: account.user_id,
      accountability: await service.userAccountability(trx, account.user_id)
    };
    const c = await trx("comm_conversations").where({ lead_id: card.lead_id }).orderBy("created_at", "desc").first();
    if (!c) return { result: "stale" };
    await service.permitted(trx, a, c.id);
    const data = String(q?.data || "");
    if (data === `take:${card.id}`) {
      if (String(m.message_id) !== card.message_id) return { result: "stale" };
      await service.commands(
        a,
        {
          type: "claim",
          key: commandKey(`take:${n.id}:${row.external_id}`),
          conversation_id: c.id,
          expected_version: c.version,
          payload: {}
        },
        trx
      );
      await queue(trx, n, card, "\u0417\u0430\u044F\u0432\u043A\u0430 \u043F\u0440\u0438\u043D\u044F\u0442\u0430 \u0432 \u0440\u0430\u0431\u043E\u0442\u0443.");
      return { result: "claimed" };
    }
    if (data === `reply:${c.id}`) {
      const sent = await trx("comm_operations as o").join("comm_outbox as b", "b.id", "o.outbox_id").where({
        "b.connection_id": n.id,
        "o.external_id": String(m.message_id),
        "o.state": "accepted"
      }).select("o.payload").first();
      if (String(m.message_id) !== card.message_id && !sent?.payload?.reply_markup?.inline_keyboard?.flat().some((b) => b.callback_data === data))
        return { result: "stale" };
      await trx("comm_staff_drafts").where({ conversation_id: c.id, user_id: a.user }).whereIn("state", ["awaiting", "preview"]).update({ state: "cancelled" });
      const [draft2] = await trx("comm_staff_drafts").insert({ conversation_id: c.id, user_id: a.user, external_user_id: String(from.id) }).returning("*");
      await queue(
        trx,
        n,
        card,
        "\u041E\u0442\u0432\u0435\u0442\u044C\u0442\u0435 \u0438\u043C\u0435\u043D\u043D\u043E \u043D\u0430 \u044D\u0442\u043E \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 \u0442\u0435\u043A\u0441\u0442\u043E\u043C \u0438\u043B\u0438 \u043E\u0434\u043D\u0438\u043C \u0444\u043E\u0442\u043E. \u0417\u0430\u0442\u0435\u043C \u043F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0447\u0435\u0440\u043D\u043E\u0432\u0438\u043A \u0438 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u0435 \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0443. \u0421\u0440\u043E\u043A \u2014 10 \u043C\u0438\u043D\u0443\u0442.",
        { draft_id: draft2.id, draft_stage: "prompt" },
        { force_reply: true }
      );
      return { result: "draft_started" };
    }
    const match = data.match(/^(send|cancel):([0-9a-f-]{36})$/);
    if (match && UUID.test(match[2])) {
      const draft2 = await trx("comm_staff_drafts").where({
        id: match[2],
        conversation_id: c.id,
        user_id: a.user,
        external_user_id: String(from.id),
        state: "preview",
        preview_message_id: String(m.message_id)
      }).where("expires_at", ">", trx.fn.now()).forUpdate().first();
      if (!draft2) return { result: "stale" };
      if (match[1] === "cancel") {
        await trx("comm_staff_drafts").where({ id: draft2.id }).update({ state: "cancelled" });
        return { result: "cancelled" };
      }
      if (draft2.attachment_id && !await trx("comm_attachments").where({ id: draft2.attachment_id, state: "ready" }).first()) {
        await queue(
          trx,
          n,
          card,
          "\u0412\u043B\u043E\u0436\u0435\u043D\u0438\u0435 \u0435\u0449\u0451 \u043F\u0440\u043E\u0432\u0435\u0440\u044F\u0435\u0442\u0441\u044F \u0438\u043B\u0438 \u043E\u0442\u043A\u043B\u043E\u043D\u0435\u043D\u043E. \u041E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u0437\u0430\u044F\u0432\u043A\u0443 \u0432 Directus \u0434\u043B\u044F \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u044F."
        );
        return { result: "file_not_ready" };
      }
      await service.commands(
        a,
        {
          type: "reply",
          key: draft2.id,
          conversation_id: c.id,
          expected_version: c.version,
          payload: {
            text: draft2.text,
            attachment_ids: draft2.attachment_id ? [draft2.attachment_id] : []
          }
        },
        trx
      );
      await trx("comm_staff_drafts").where({ id: draft2.id }).update({ state: "confirmed" });
      return { result: "queued" };
    }
    if (data || !m.reply_to_message?.message_id) return { result: "internal" };
    const draft = await trx("comm_staff_drafts").where({
      conversation_id: c.id,
      user_id: a.user,
      external_user_id: String(from.id),
      state: "awaiting",
      prompt_message_id: String(m.reply_to_message.message_id)
    }).where("expires_at", ">", trx.fn.now()).forUpdate().first();
    if (!draft) return { result: "internal" };
    if (m.media_group_id || m.voice || m.video || m.document || !m.text && !m.photo?.length) {
      await queue(
        trx,
        n,
        card,
        "\u0414\u043B\u044F \u0431\u044B\u0441\u0442\u0440\u043E\u0433\u043E \u043E\u0442\u0432\u0435\u0442\u0430 \u043F\u0440\u0438\u0448\u043B\u0438\u0442\u0435 \u0442\u0435\u043A\u0441\u0442 \u0438\u043B\u0438 \u043E\u0434\u043D\u043E \u0444\u043E\u0442\u043E. \u041E\u0441\u0442\u0430\u043B\u044C\u043D\u044B\u0435 \u0432\u043B\u043E\u0436\u0435\u043D\u0438\u044F \u043C\u043E\u0436\u043D\u043E \u043E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u0438\u0437 Directus."
      );
      return { result: "unsupported" };
    }
    const text = validText(m.text || m.caption || "");
    let attachmentId = null;
    if (m.photo?.length) {
      const photo = m.photo.at(-1);
      const [f] = await trx("comm_attachments").insert({
        conversation_id: c.id,
        connection_id: n.id,
        uploaded_by: a.user,
        kind: "image",
        name: "\u0424\u043E\u0442\u043E \u043C\u0435\u043D\u0435\u0434\u0436\u0435\u0440\u0430",
        mime: "application/octet-stream",
        external_ref: { externalId: photo.file_id, size: photo.file_size || null, kind: "image" }
      }).returning("id");
      attachmentId = f.id;
    }
    await trx("comm_staff_drafts").where({ id: draft.id }).update({ state: "preview", text, attachment_id: attachmentId });
    await queue(
      trx,
      n,
      card,
      `\u041A \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0435 \u043A\u043B\u0438\u0435\u043D\u0442\u0443:
${text}${attachmentId ? "\n[\u0424\u043E\u0442\u043E \u043E\u0436\u0438\u0434\u0430\u0435\u0442 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438]" : ""}`,
      { draft_id: draft.id, draft_stage: "preview" },
      {
        inline_keyboard: [
          [{ text: "\u041E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u043A\u043B\u0438\u0435\u043D\u0442\u0443", callback_data: `send:${draft.id}` }],
          [{ text: "\u041E\u0442\u043C\u0435\u043D\u0430", callback_data: `cancel:${draft.id}` }]
        ]
      }
    );
    return { result: "draft_ready" };
  }
  service.setStaffProcessor(process2);
  service.setStaffNotifier(notify);
  return { notify, process: process2, sweep };
}

// packages/communications/src/endpoint.ts
init_policy();
var endpoint_default = {
  id: "isvoi-communications",
  handler(router, context) {
    const service = createService(context), delivery = createDelivery(context, service), attachments = createAttachments(context, service), staff = createStaff(context, service), db = context.database;
    const handler = (fn) => async (req, res) => {
      try {
        if (!flag(context.env.ISVOI_COMMUNICATIONS_ENABLED)) fail("COMMUNICATIONS_DISABLED", 503);
        await fn(req, res);
      } catch (e) {
        if (!(e instanceof CommunicationError))
          context.logger?.error(e, "Unexpected communications endpoint failure");
        res.status(e instanceof CommunicationError ? e.status : 500).json({
          errors: [
            {
              message: e instanceof CommunicationError ? e.code : "COMMUNICATIONS_OPERATION_FAILED"
            }
          ]
        });
      }
    };
    router.get(
      "/v1/inbox",
      handler(
        async (req, res) => res.json({
          data: await service.inbox(await service.actor(req.accountability?.user), req.query)
        })
      )
    );
    router.get(
      "/v1/threads/:id/messages",
      handler(
        async (req, res) => res.json({
          data: await service.messages(
            await service.actor(req.accountability?.user),
            req.params.id,
            req.query
          )
        })
      )
    );
    router.post(
      "/v1/commands",
      handler(
        async (req, res) => res.json({
          data: await service.commands(await service.actor(req.accountability?.user), req.body)
        })
      )
    );
    router.get(
      "/v1/audience",
      handler(
        async (req, res) => res.json({ data: await service.audience(await service.actor(req.accountability?.user)) })
      )
    );
    router.get(
      "/v1/staff",
      handler(async (req, res) => {
        const a = await service.actor(req.accountability?.user);
        const stores = await db("comm_staff").where({ user_id: a.user, enabled: true }).pluck("store_id");
        res.json({
          data: await db("comm_staff as s").join("directus_users as u", "u.id", "s.user_id").whereIn("s.store_id", stores).where({ "s.enabled": true, "u.status": "active" }).select("s.user_id", "s.store_id", "u.first_name", "u.last_name")
        });
      })
    );
    router.post(
      "/v1/attachments",
      handler(async (req, res) => {
        if (req.headers["content-type"] !== "application/octet-stream")
          return fail("BINARY_UPLOAD_REQUIRED", 415);
        res.status(201).json({
          data: await attachments.upload(
            await service.actor(req.accountability?.user),
            String(req.query.conversation_id || ""),
            req,
            { name: req.query.name, mime: req.query.mime, size: req.headers["content-length"] }
          )
        });
      })
    );
    router.get(
      "/v1/attachments/:id/status",
      handler(async (req, res) => {
        if (!UUID.test(req.params.id)) return fail("NOT_FOUND", 404);
        const f = await db("comm_attachments").where({ id: req.params.id }).first();
        if (!f) return fail("NOT_FOUND", 404);
        await service.permitted(
          db,
          await service.actor(req.accountability?.user),
          f.conversation_id
        );
        res.json({ data: { id: f.id, name: f.name, state: f.state, error_code: f.error_code } });
      })
    );
    router.get(
      "/v1/attachments/:id",
      handler(async (req, res) => {
        const file = await attachments.get(
          await service.actor(req.accountability?.user),
          req.params.id
        );
        res.set({
          "Content-Type": file.mime,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "default-src 'none'; sandbox",
          "Accept-Ranges": "bytes",
          "Content-Disposition": `${file.kind === "document" ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(file.name)}`
        });
        let start = 0, end = Number(file.size) - 1;
        if (req.headers.range) {
          const m = String(req.headers.range).match(/^bytes=(\d+)-(\d*)$/);
          if (!m) return res.status(416).end();
          start = Number(m[1]);
          end = m[2] ? Math.min(Number(m[2]), end) : end;
          if (start > end) return res.status(416).end();
          res.status(206).set("Content-Range", `bytes ${start}-${end}/${file.size}`);
        }
        res.set("Content-Length", String(end - start + 1));
        const stream = createReadStream(file.path, { start, end });
        stream.on("error", () => res.destroy());
        stream.pipe(res);
      })
    );
    router.post(
      "/v1/webhooks/:connectionId",
      handler(async (req, res) => {
        if (!UUID.test(req.params.connectionId)) return fail("NOT_FOUND", 404);
        const n = await db("comm_connections").where({ id: req.params.connectionId, enabled: true }).first();
        if (!n || !["max", "vk"].includes(n.platform)) return fail("NOT_FOUND", 404);
        if (!/^[A-Z][A-Z0-9_]{2,100}$/.test(n.secret_ref))
          return fail("CONNECTION_NOT_CONFIGURED", 503);
        const expected = context.env[`${n.secret_ref}_WEBHOOK_SECRET`];
        if (!verifySecret(
          n.platform === "max" ? req.headers["x-max-bot-api-secret"] : req.body?.secret,
          expected
        ))
          return fail("FORBIDDEN", 403);
        if (n.platform === "vk" && String(req.body?.group_id) !== n.external_id)
          return fail("FORBIDDEN", 403);
        if (n.platform === "vk" && req.body?.type === "confirmation")
          return res.type("text/plain").send(String(context.env[`${n.secret_ref}_CONFIRMATION`] || ""));
        await service.ingest(n.id, req.body);
        res.type("text/plain").send(n.platform === "vk" ? "ok" : "ok");
      })
    );
    router.post(
      "/v1/workers/:id/next",
      handler(
        async (req, res) => res.json({ data: await delivery.next(req.params.id, req.accountability?.user) })
      )
    );
    router.post(
      "/v1/workers/:id/complete",
      handler(
        async (req, res) => res.json({
          data: await delivery.complete(req.params.id, req.accountability?.user, req.body)
        })
      )
    );
    router.post(
      "/v1/workers/:id/process",
      handler(async (req, res) => {
        await db.transaction(
          (trx) => delivery.worker(trx, req.params.id, req.accountability?.user)
        );
        const incoming = await service.processIncoming(req.params.id);
        if (incoming) return res.json({ data: incoming });
        const connection = await db("comm_connections").where({ id: req.params.id, enabled: true }).first();
        if (!connection) return fail("CONNECTION_DISABLED", 403);
        res.json({ data: await db.transaction((trx) => staff.sweep(trx, connection)) });
      })
    );
    router.post(
      "/v1/workers/:id/scan",
      handler(async (req, res) => {
        await db.transaction(
          (trx) => delivery.worker(trx, req.params.id, req.accountability?.user)
        );
        res.json({ data: await attachments.scanOne(req.params.id) });
      })
    );
    router.get(
      "/v1/workers/:id/media",
      handler(async (req, res) => {
        await db.transaction(
          (trx) => delivery.worker(trx, req.params.id, req.accountability?.user)
        );
        const f = await db("comm_attachments").where({ connection_id: req.params.id, state: "pending" }).orderBy("created_at").first();
        res.json({
          data: f ? { id: f.id, external_ref: f.external_ref, kind: f.kind, name: f.name, mime: f.mime } : null
        });
      })
    );
    router.post(
      "/v1/workers/:id/media/:fileId",
      handler(async (req, res) => {
        await db.transaction(
          (trx) => delivery.worker(trx, req.params.id, req.accountability?.user)
        );
        if (!UUID.test(req.params.fileId)) return fail("NOT_FOUND", 404);
        const f = await db("comm_attachments").where({ id: req.params.fileId, connection_id: req.params.id, state: "pending" }).first();
        if (!f) return fail("NOT_FOUND", 404);
        if (req.body?.error_code) {
          const code = String(req.body.error_code);
          if (![
            "FILE_TOO_LARGE",
            "FILE_FORMAT_NOT_ALLOWED",
            "MEDIA_URL_FORBIDDEN",
            "MEDIA_ADDRESS_FORBIDDEN",
            "MEDIA_UNAVAILABLE"
          ].includes(code))
            return fail("INVALID_MEDIA_ERROR");
          await db("comm_attachments").where({ id: f.id }).update({ state: "rejected", error_code: code });
          return res.json({ data: { id: f.id, state: "rejected" } });
        }
        const { readBounded: readBounded2 } = await Promise.resolve().then(() => (init_attachments(), attachments_exports));
        const bytes = await readBounded2(req, req.headers["content-length"]);
        res.json({
          data: await attachments.store(bytes, {
            id: f.id,
            name: f.name,
            mime: f.mime,
            kind: f.kind
          })
        });
      })
    );
    router.get(
      "/v1/workers/:id/media/:fileId",
      handler(async (req, res) => {
        await db.transaction(
          (trx) => delivery.worker(trx, req.params.id, req.accountability?.user)
        );
        const op = await db("comm_operations as o").join("comm_outbox as b", "b.id", "o.outbox_id").where({
          "o.attempt_id": req.query.attempt_id,
          "o.worker_id": req.accountability.user,
          "o.state": "in_flight",
          "b.connection_id": req.params.id
        }).select("o.payload").first();
        if (!op || op.payload.attachment_id !== req.params.fileId) return fail("FORBIDDEN", 403);
        const f = await db("comm_attachments").where({ id: req.params.fileId, state: "ready" }).first();
        if (!f) return fail("FILE_NOT_READY", 409);
        res.set({
          "Content-Type": f.mime,
          "Content-Length": String(f.size),
          "Cache-Control": "no-store",
          "X-Media-Kind": f.kind,
          "X-Media-Name": encodeURIComponent(f.name)
        });
        const stream = createReadStream(attachments.path(f.storage_key));
        stream.on("error", () => res.destroy());
        stream.pipe(res);
      })
    );
    router.post(
      "/v1/workers/:id/ingest",
      handler(async (req, res) => {
        await db.transaction(async (trx) => {
          const n = await delivery.worker(trx, req.params.id, req.accountability?.user);
          if (n.platform !== "telegram") fail("FORBIDDEN", 403);
        });
        res.json({ data: await service.ingest(req.params.id, req.body.update) });
      })
    );
    router.post(
      "/v1/workers/:id/poll",
      handler(async (req, res) => {
        if (!UUID.test(req.body?.instance_id || "")) return fail("INSTANCE_REQUIRED");
        const data = await db.transaction(async (trx) => {
          const n = await delivery.worker(trx, req.params.id, req.accountability?.user);
          if (n.platform !== "telegram") return fail("FORBIDDEN", 403);
          if (n.poll_owner && n.poll_owner !== req.body.instance_id && new Date(n.poll_until) > /* @__PURE__ */ new Date())
            return fail("POLLER_ALREADY_ACTIVE", 409);
          await trx("comm_connections").where({ id: n.id }).update({ poll_owner: req.body.instance_id, poll_until: new Date(Date.now() + 9e4) });
          return { offset: Number(n.poll_offset) };
        });
        res.json({ data });
      })
    );
    router.post(
      "/v1/workers/:id/poll-result",
      handler(async (req, res) => {
        const n = await db.transaction(
          (trx) => delivery.worker(trx, req.params.id, req.accountability?.user)
        );
        if (n.platform !== "telegram" || n.poll_owner !== req.body.instance_id || new Date(n.poll_until) <= /* @__PURE__ */ new Date())
          return fail("POLL_LEASE_EXPIRED", 409);
        const update = req.body.update;
        if (!Number.isSafeInteger(update?.update_id) || update.update_id < 0)
          return fail("INVALID_UPDATE");
        await service.ingest(n.id, update);
        const changed = await db("comm_connections").where({ id: n.id, poll_owner: req.body.instance_id }).where("poll_until", ">", db.fn.now()).update({ poll_offset: db.raw("GREATEST(poll_offset,?)", [update.update_id + 1]) });
        if (!changed) return fail("POLL_LEASE_EXPIRED", 409);
        res.json({ data: { accepted: true } });
      })
    );
  }
};
export {
  endpoint_default as default
};
