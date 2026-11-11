const assert = require('assert');
const { createWhatsAppExif, injectWhatsAppMetadata } = require('./services/exif');
const fs = require('fs');
const path = require('path');

console.log('--- Testing WhatsApp EXIF Generation & Parsing ---');

const metadata = {
  packId: 'test-pack-123',
  packName: 'My Epic Pack',
  author: 'TwitSticker Bot',
  emojis: ['🔥', '✨', '🐦']
};

const exifData = createWhatsAppExif(metadata);
console.log('EXIF Data length:', exifData.length);

// Verify TIFF header
assert.strictEqual(exifData.toString('ascii', 0, 4), 'II*\x00', 'TIFF header magic must be II*\\0');
assert.strictEqual(exifData.readUInt32LE(4), 8, 'IFD offset must be 8');
assert.strictEqual(exifData.readUInt16LE(8), 1, 'IFD entry count must be 1');
assert.strictEqual(exifData.readUInt16LE(10), 0x5741, 'Tag must be 0x5741 (WA)');
assert.strictEqual(exifData.readUInt16LE(12), 7, 'Type must be 7 (UNDEFINED)');

const declaredLen = exifData.readUInt32LE(14);
const payloadOffset = exifData.readUInt32LE(18);
assert.strictEqual(payloadOffset, 22, 'Payload offset must be 22');

const jsonStr = exifData.slice(payloadOffset, payloadOffset + declaredLen).toString('utf8');
const parsed = JSON.parse(jsonStr);
console.log('Parsed JSON from EXIF:', parsed);

assert.strictEqual(parsed['sticker-pack-name'], 'My Epic Pack');
assert.strictEqual(parsed['sticker-pack-publisher'], 'TwitSticker Bot');
assert.deepStrictEqual(parsed.emojis, ['🔥', '✨', '🐦']);

console.log('--- Testing WebP Injection & Round-Trip Extraction ---');
// Minimal dummy VP8X WebP buffer
const dummyVp8x = Buffer.alloc(30);
dummyVp8x.write('RIFF', 0, 'ascii');
dummyVp8x.writeUInt32LE(22, 4); // size
dummyVp8x.write('WEBP', 8, 'ascii');
dummyVp8x.write('VP8X', 12, 'ascii');
dummyVp8x.writeUInt32LE(10, 16); // VP8X size
dummyVp8x[20] = 0x02; // animation bit set

const injected = injectWhatsAppMetadata(dummyVp8x, metadata);

// Check VP8X flag bit 3 (0x08)
assert.strictEqual((injected[20] & 0x08), 0x08, 'VP8X must have EXIF bit set');

// Find EXIF chunk
const exifIndex = injected.indexOf(Buffer.from('EXIF'));
assert.notStrictEqual(exifIndex, -1, 'EXIF chunk must exist in WebP');

const exifSize = injected.readUInt32LE(exifIndex + 4);
const extractedExif = injected.slice(exifIndex + 8, exifIndex + 8 + exifSize);
assert.strictEqual(extractedExif.toString('ascii', 0, 4), 'II*\x00');
const extractedTag = extractedExif.readUInt16LE(10);
assert.strictEqual(extractedTag, 0x5741);

const extractedJsonLen = extractedExif.readUInt32LE(14);
const extractedJson = extractedExif.slice(22, 22 + extractedJsonLen).toString('utf8');
const roundTripObj = JSON.parse(extractedJson);
assert.strictEqual(roundTripObj['sticker-pack-name'], 'My Epic Pack');

console.log('✅ Round-trip WebP EXIF injection and extraction successful!');
