import { crc32 } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { zip } from './zip.ts';

/** Reads the archive back through its central directory, as an unzip tool does. */
function unzip(archive: Uint8Array) {
  const bytes = Buffer.from(archive);
  const end = bytes.length - 22;
  expect(bytes.readUInt32LE(end)).toBe(0x06054b50);
  const count = bytes.readUInt16LE(end + 10);
  let at = bytes.readUInt32LE(end + 16);
  const entries = [];
  for (let i = 0; i < count; i++) {
    expect(bytes.readUInt32LE(at)).toBe(0x02014b50);
    const size = bytes.readUInt32LE(at + 24);
    const nameLength = bytes.readUInt16LE(at + 28);
    const mode = (bytes.readUInt32LE(at + 38) >>> 16) & 0o777;
    const local = bytes.readUInt32LE(at + 42);
    const path = bytes.toString('utf8', at + 46, at + 46 + nameLength);
    const dataStart = local + 30 + bytes.readUInt16LE(local + 26);
    const data = bytes.subarray(dataStart, dataStart + size);
    expect(bytes.readUInt32LE(at + 16)).toBe(crc32(data));
    entries.push({ path, content: data.toString('utf8'), mode });
    at += 46 + nameLength;
  }
  return entries;
}

describe('zip', () => {
  it('stores files with their content and permissions', () => {
    expect(
      unzip(
        zip([
          { path: 'manifest.json', content: '{"name":"cv-kit"}' },
          { path: 'server/run.sh', content: '#!/bin/sh\necho ✓\n', mode: 0o755 },
        ]),
      ),
    ).toEqual([
      { path: 'manifest.json', content: '{"name":"cv-kit"}', mode: 0o644 },
      { path: 'server/run.sh', content: '#!/bin/sh\necho ✓\n', mode: 0o755 },
    ]);
  });

  it('gives the same bytes for the same files', () => {
    const files = [{ path: 'a.txt', content: 'a' }];
    expect(zip(files)).toEqual(zip(files));
  });
});
