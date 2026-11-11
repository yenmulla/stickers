/**
 * WhatsApp Sticker EXIF Metadata Injector
 * WhatsApp expects animated and static WebP stickers to follow specific EXIF tagging
 * containing JSON metadata with sticker-pack-id, name, publisher, and emojis.
 */

function createWhatsAppExif(metadata = {}) {
  const payload = {
    'sticker-pack-id': metadata.packId || `pack-${Date.now()}`,
    'sticker-pack-name': metadata.packName || 'Twitter Sticker',
    'sticker-pack-publisher': metadata.author || 'Twitter Sticker Maker',
    'emojis': Array.isArray(metadata.emojis) ? metadata.emojis : (metadata.emojis ? [metadata.emojis] : ['⚡', '🐦']),
    'android-app-store-link': 'https://play.google.com/store/apps/details?id=com.whatsapp',
    'ios-app-store-link': 'https://apps.apple.com/app/whatsapp-messenger/id310633997'
  };

  const jsonStr = JSON.stringify(payload);
  const jsonBuf = Buffer.from(jsonStr, 'utf8');

  // WhatsApp Exif TIFF structure:
  // Little-endian header ('II*') + 1 IFD entry with tag 0x5741 ('WA')
  const exifAttr = Buffer.from([
    0x49, 0x49, 0x2A, 0x00, // II * \0
    0x08, 0x00, 0x00, 0x00, // Offset to first IFD (8)
    0x01, 0x00,             // Number of directory entries: 1
    0x41, 0x57,             // Tag: 0x5741 ('WA' for WhatsApp)
    0x07, 0x00,             // Type: UNDEFINED (7)
    0x00, 0x00, 0x00, 0x00, // Length (placeholder for jsonBuf.length)
    0x16, 0x00, 0x00, 0x00  // Offset to payload: 22 bytes from TIFF start (0x16)
  ]);

  exifAttr.writeUInt32LE(jsonBuf.length, 14);

  return Buffer.concat([exifAttr, jsonBuf]);
}

function injectWhatsAppMetadata(webpBuffer, metadata = {}) {
  try {
    const exifData = createWhatsAppExif(metadata);

    // Validate RIFF WEBP header
    if (webpBuffer.toString('ascii', 0, 4) !== 'RIFF' || webpBuffer.toString('ascii', 8, 12) !== 'WEBP') {
      return webpBuffer;
    }

    const exifChunkSize = exifData.length;
    const pad = (exifChunkSize % 2 !== 0) ? Buffer.from([0x00]) : Buffer.alloc(0);

    const chunkHeader = Buffer.alloc(8);
    chunkHeader.write('EXIF', 0, 4, 'ascii');
    chunkHeader.writeUInt32LE(exifChunkSize, 4);

    const fullExifChunk = Buffer.concat([chunkHeader, exifData, pad]);

    const firstChunkFourCC = webpBuffer.toString('ascii', 12, 16);
    let newBuffer;

    if (firstChunkFourCC === 'VP8X') {
      // Set EXIF flag in VP8X chunk (flags are at offset 20, bit 3 is EXIF flag: 0x08)
      const modifiedWebp = Buffer.from(webpBuffer);
      modifiedWebp[20] = modifiedWebp[20] | 0x08;
      newBuffer = Buffer.concat([modifiedWebp, fullExifChunk]);
    } else {
      newBuffer = Buffer.concat([webpBuffer, fullExifChunk]);
    }

    // Update RIFF total size at offset 4
    newBuffer.writeUInt32LE(newBuffer.length - 8, 4);
    return newBuffer;
  } catch (err) {
    console.error('Error injecting EXIF metadata:', err);
    return webpBuffer;
  }
}

module.exports = {
  createWhatsAppExif,
  injectWhatsAppMetadata
};

