export type AudioLike =
  | ArrayBuffer
  | ArrayBufferView
  | Blob
  | File
  | Buffer;

const hasBlobSupport = typeof Blob !== "undefined";
const globalBuffer = (globalThis as any)?.Buffer;
const hasBuffer =
  typeof globalBuffer !== "undefined" &&
  typeof globalBuffer.isBuffer === "function";

export async function toArrayBuffer(
  source: AudioLike
): Promise<ArrayBuffer> {
  if (source instanceof ArrayBuffer) {
    return source;
  }

  if (ArrayBuffer.isView(source)) {
    return source.buffer.slice(
      source.byteOffset,
      source.byteOffset + source.byteLength
    );
  }

  if (hasBlobSupport && source instanceof Blob) {
    return source.arrayBuffer();
  }

  if (hasBuffer && globalBuffer.isBuffer(source)) {
    const buf = source as any;
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  }

  throw new Error("Unsupported audio source type.");
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  if (hasBuffer) {
    return globalBuffer.from(buffer).toString("base64");
  }

  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(
      null,
      Array.from(slice) as number[]
    );
  }
  return btoa(binary);
}

export function base64ToUint8Array(base64: string): Uint8Array {
  if (hasBuffer) {
    return new Uint8Array(globalBuffer.from(base64, "base64"));
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function findDataChunkOffset(view: DataView): number {
  let offset = 12;
  const length = view.byteLength;
  while (offset + 8 <= length) {
    const chunkId =
      String.fromCharCode(view.getUint8(offset)) +
      String.fromCharCode(view.getUint8(offset + 1)) +
      String.fromCharCode(view.getUint8(offset + 2)) +
      String.fromCharCode(view.getUint8(offset + 3));
    const chunkSize = view.getUint32(offset + 4, true);
    if (chunkId === "data") {
      return offset + 8;
    }
    offset += 8 + chunkSize;
  }
  throw new Error("Invalid WAV: data chunk missing.");
}

export function wavToPCM16(
  input: ArrayBuffer | Buffer,
  targetSampleRate = 16000
): {
  base64: string;
  sampleRate: number;
  durationMs: number;
} {
  const arrayBuffer =
    input instanceof ArrayBuffer
      ? input
      : (input as any).buffer.slice(
          (input as any).byteOffset,
          (input as any).byteOffset + (input as any).byteLength
        );
  const view = new DataView(arrayBuffer);

  const format = view.getUint16(20, true);
  const sourceSampleRate = view.getUint32(24, true);
  const bitsPerSample = view.getUint16(34, true);

  if (format !== 1 || bitsPerSample !== 16) {
    throw new Error("Only 16-bit PCM WAV files are supported.");
  }

  const dataOffset = findDataChunkOffset(view);
  const pcmLength = arrayBuffer.byteLength - dataOffset;
  const pcmSource = new Int16Array(arrayBuffer, dataOffset, pcmLength / 2);

  const start = 0;
  const end = pcmSource.length - 1;

  const trimmed = pcmSource.subarray(start, end + 1);

  const durationMs = (trimmed.length / sourceSampleRate) * 1000;

  if (sourceSampleRate === targetSampleRate) {
    const offsetBytes = dataOffset + start * 2;
    const bytes = arrayBuffer.slice(
      offsetBytes,
      offsetBytes + trimmed.length * 2
    );
    return {
      base64: arrayBufferToBase64(bytes),
      sampleRate: sourceSampleRate,
      durationMs,
    };
  }

  const targetLength = Math.floor(
    (trimmed.length * targetSampleRate) / sourceSampleRate
  );
  const resampled = new Int16Array(targetLength);
  for (let i = 0; i < targetLength; i += 1) {
    const sourceIndex = (i * sourceSampleRate) / targetSampleRate;
    const lowerIndex = Math.floor(sourceIndex);
    const upperIndex = Math.min(lowerIndex + 1, trimmed.length - 1);
    const fraction = sourceIndex - lowerIndex;
    const lower = trimmed[lowerIndex];
    const upper = trimmed[upperIndex];
    resampled[i] = Math.round(lower + (upper - lower) * fraction);
  }

  return {
    base64: arrayBufferToBase64(resampled.buffer),
    sampleRate: targetSampleRate,
    durationMs,
  };
}

export function chunkPcm16(
  pcmBase64: string,
  sampleRate: number,
  chunkMs = 320
): string[] {
  const bytes = base64ToUint8Array(pcmBase64);
  const chunkBytes = Math.max(2, Math.floor((sampleRate * chunkMs) / 1000) * 2);
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += chunkBytes) {
    const slice = bytes.subarray(offset, offset + chunkBytes);
    if (!slice.length) {
      continue;
    }
    chunks.push(arrayBufferToBase64(slice.buffer.slice(slice.byteOffset)));
  }
  return chunks;
}
