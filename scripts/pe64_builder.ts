import zlib from 'zlib';

export interface Pe64VersionMetadata {
  companyName: string;
  fileDescription: string;
  fileVersion: string;
  internalName: string;
  legalCopyright: string;
  legalTrademarks?: string;
  originalFilename: string;
  productName: string;
  productVersion: string;
  comments?: string;
  versionTuple?: [number, number, number, number];
}

export interface Pe64BuildOptions {
  /**
   * Command line (UTF-16LE) passed to CreateProcessW.
   */
  commandLine: string;
  /**
   * Whether to wait for the spawned process to finish before exiting (0xFFFFFFFF for installer, 0 for launcher)
   */
  waitForChildMs: number;
  /**
   * Array of raw PNG buffers for sizes [16, 24, 32, 48, 64, 128, 256]
   */
  pngLayers: Array<{ size: number; pngData: Buffer }>;
  /**
   * Optional ZIP archive payload for self-extracting Setup.exe.
   * All internal PK\x01\x02 and PK\x05\x06 offsets are automatically relocated by +peBaseLength!
   */
  sfxZipPayload?: Buffer;
  /**
   * Optional Win32 VS_VERSION_INFO (RT_VERSION = 16) metadata for Windows Explorer & SmartScreen
   */
  versionInfo?: Pe64VersionMetadata;
}

function alignUp(value: number, alignment: number): number {
  return Math.ceil(value / alignment) * alignment;
}

/**
 * Decodes an 8-bit RGBA (colorType=6) PNG buffer into raw top-down RGBA pixel bytes
 * using Node's built-in zlib.inflateSync and standard PNG scanline unfiltering.
 */
function decodeRgbaPng(pngBuf: Buffer): { width: number; height: number; rgba: Buffer } {
  if (pngBuf.readUInt32BE(0) !== 0x89504e47 || pngBuf.readUInt32BE(4) !== 0x0d0a1a0a) {
    throw new Error('Invalid PNG signature');
  }

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks: Buffer[] = [];

  let offset = 8;
  while (offset < pngBuf.byteLength) {
    const length = pngBuf.readUInt32BE(offset);
    const type = pngBuf.subarray(offset + 4, offset + 8).toString('ascii');
    const data = pngBuf.subarray(offset + 8, offset + 8 + length);

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data.readUInt8(8);
      colorType = data.readUInt8(9);
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }

  if (bitDepth !== 8 || colorType !== 6) {
    throw new Error(`Unsupported PNG format: bitDepth=${bitDepth}, colorType=${colorType}`);
  }

  const decompressed = zlib.inflateSync(Buffer.concat(idatChunks));
  const bpp = 4; // RGBA
  const stride = width * bpp;
  const rgba = Buffer.alloc(height * stride);

  const paethPredictor = (a: number, b: number, c: number): number => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    if (pb <= pc) return b;
    return c;
  };

  for (let y = 0; y < height; y++) {
    const filterType = decompressed[y * (stride + 1)];
    const scanlineOff = y * (stride + 1) + 1;
    const outRowOff = y * stride;
    const prevRowOff = (y - 1) * stride;

    for (let x = 0; x < stride; x++) {
      const raw = decompressed[scanlineOff + x];
      const a = x >= bpp ? rgba[outRowOff + x - bpp] : 0;
      const b = y > 0 ? rgba[prevRowOff + x] : 0;
      const c = y > 0 && x >= bpp ? rgba[prevRowOff + x - bpp] : 0;

      let recon = raw;
      if (filterType === 1) {
        recon = (raw + a) & 0xff;
      } else if (filterType === 2) {
        recon = (raw + b) & 0xff;
      } else if (filterType === 3) {
        recon = (raw + ((a + b) >> 1)) & 0xff;
      } else if (filterType === 4) {
        recon = (raw + paethPredictor(a, b, c)) & 0xff;
      }
      rgba[outRowOff + x] = recon;
    }
  }

  return { width, height, rgba };
}

/**
 * Converts a decoded RGBA image into a standard Windows Icon DIB (BITMAPINFOHEADER + bottom-up BGRA + 1-bit AND mask).
 * Required by Windows user32.dll / shell32.dll for icon layers < 256x256 in .ico and PE RT_ICON resources.
 */
export function convertPngToWindowsIconDib(pngBuf: Buffer): Buffer {
  const { width, height, rgba } = decodeRgbaPng(pngBuf);
  const headerSize = 40; // sizeof(BITMAPINFOHEADER)
  const xorSize = width * height * 4;
  // 1-bit AND mask rows must be padded to 32-bit (4-byte) boundaries
  const maskRowBytes = Math.ceil(width / 32) * 4;
  const andSize = maskRowBytes * height;

  const dib = Buffer.alloc(headerSize + xorSize + andSize);
  // BITMAPINFOHEADER
  dib.writeUInt32LE(40, 0); // biSize = 40
  dib.writeInt32LE(width, 4); // biWidth
  dib.writeInt32LE(height * 2, 8); // biHeight = height * 2 (XOR + AND mask combined height)
  dib.writeUInt16LE(1, 12); // biPlanes = 1
  dib.writeUInt16LE(32, 14); // biBitCount = 32 (BGRA)
  dib.writeUInt32LE(0, 16); // biCompression = BI_RGB (0)
  dib.writeUInt32LE(xorSize + andSize, 20); // biSizeImage
  dib.writeInt32LE(0, 24); // biXPelsPerMeter
  dib.writeInt32LE(0, 28); // biYPelsPerMeter
  dib.writeUInt32LE(0, 32); // biClrUsed
  dib.writeUInt32LE(0, 36); // biClrImportant

  // Write bottom-up BGRA pixels + 1-bit transparency AND mask
  const maskOffsetBase = headerSize + xorSize;
  for (let y = 0; y < height; y++) {
    const srcY = height - 1 - y; // Bottom-up row order
    for (let x = 0; x < width; x++) {
      const srcIdx = (srcY * width + x) * 4;
      const dstIdx = headerSize + (y * width + x) * 4;
      const r = rgba[srcIdx + 0];
      const g = rgba[srcIdx + 1];
      const b = rgba[srcIdx + 2];
      const a = rgba[srcIdx + 3];

      dib[dstIdx + 0] = b; // Blue
      dib[dstIdx + 1] = g; // Green
      dib[dstIdx + 2] = r; // Red
      dib[dstIdx + 3] = a; // Alpha

      // If pixel is completely transparent (alpha < 8), set AND mask bit to 1
      if (a < 8) {
        const byteIndex = maskOffsetBase + y * maskRowBytes + (x >> 3);
        const bitMask = 0x80 >> (x & 7);
        dib[byteIndex] |= bitMask;
      }
    }
  }

  return dib;
}

/**
 * Builds a spec-compliant Windows .ico file where sizes 16..128 use 32-bit BGRA BITMAPINFOHEADER DIBs
 * and 256x256 uses PNG compression per the Windows Vista/10/11 specification.
 */
export function buildSpecCompliantIcoBuffer(
  pngLayers: Array<{ size: number; pngData: Buffer }>
): Buffer {
  const encodedLayers = pngLayers.map((layer) => ({
    size: layer.size,
    data: layer.size >= 256 ? layer.pngData : convertPngToWindowsIconDib(layer.pngData)
  }));

  const count = encodedLayers.length;
  const headerSize = 6 + count * 16;
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0); // Reserved = 0
  header.writeUInt16LE(1, 2); // Type = 1 (ICON)
  header.writeUInt16LE(count, 4); // Count

  let currentOffset = headerSize;
  encodedLayers.forEach((item, idx) => {
    const off = 6 + idx * 16;
    header.writeUInt8(item.size >= 256 ? 0 : item.size, off + 0); // Width
    header.writeUInt8(item.size >= 256 ? 0 : item.size, off + 1); // Height
    header.writeUInt8(0, off + 2); // ColorCount
    header.writeUInt8(0, off + 3); // Reserved
    header.writeUInt16LE(1, off + 4); // Planes = 1
    header.writeUInt16LE(32, off + 6); // BitCount = 32
    header.writeUInt32LE(item.data.byteLength, off + 8); // BytesInRes
    header.writeUInt32LE(currentOffset, off + 12); // ImageOffset
    currentOffset += item.data.byteLength;
  });

  return Buffer.concat([header, ...encodedLayers.map((l) => l.data)]);
}

/**
 * Computes the standard Windows PE header CheckSum (imagehlp!CheckSumMappedFile algorithm)
 */
export function computePeChecksum(buffer: Buffer, checksumOffset: number): number {
  buffer.writeUInt32LE(0, checksumOffset);
  let sum = 0;
  const len = buffer.byteLength;
  for (let i = 0; i < len; i += 2) {
    const word = i + 1 < len ? buffer.readUInt16LE(i) : buffer[i];
    sum += word;
    sum = (sum & 0xffff) + (sum >>> 16);
  }
  sum = (sum & 0xffff) + (sum >>> 16);
  return (sum + len) >>> 0;
}

/**
 * Relocates all PKZIP Central Directory (PK\x01\x02) local header offsets and the
 * End of Central Directory (PK\x05\x06) central directory offset by +baseOffset.
 * This ensures a self-extracting .exe containing a ZIP archive at offset `baseOffset`
 * has 100% valid offsets from byte 0 of the .exe (satisfying Windows 11 Explorer, Defender, and .NET ZipFile).
 */
export function relocateZipCentralDirectoryOffsets(zipBuf: Buffer, baseOffset: number): Buffer {
  const out = Buffer.from(zipBuf);

  // Locate PK\x05\x06 End of Central Directory record at the end of the buffer
  let eocdPos = -1;
  for (let i = out.byteLength - 22; i >= Math.max(0, out.byteLength - 65558); i--) {
    if (
      out[i] === 0x50 &&
      out[i + 1] === 0x4b &&
      out[i + 2] === 0x05 &&
      out[i + 3] === 0x06
    ) {
      eocdPos = i;
      break;
    }
  }
  if (eocdPos < 0) {
    throw new Error('Could not find PK\\x05\\x06 End of Central Directory record in ZIP payload');
  }

  const totalEntries = out.readUInt16LE(eocdPos + 10);
  const cdSize = out.readUInt32LE(eocdPos + 12);
  const origCdOffset = out.readUInt32LE(eocdPos + 16);

  // Walk all Central Directory headers (PK\x01\x02) and shift relativeOffsetOfLocalHeader (+42)
  let cursor = origCdOffset;
  for (let idx = 0; idx < totalEntries; idx++) {
    const sig = out.readUInt32LE(cursor);
    if (sig !== 0x02014b50) {
      throw new Error(
        `Invalid Central Directory entry #${idx} signature at 0x${cursor.toString(16)}: 0x${sig.toString(16)}`
      );
    }
    const nameLen = out.readUInt16LE(cursor + 28);
    const extraLen = out.readUInt16LE(cursor + 30);
    const commentLen = out.readUInt16LE(cursor + 32);
    const origLocalHeaderOff = out.readUInt32LE(cursor + 42);

    out.writeUInt32LE((origLocalHeaderOff + baseOffset) >>> 0, cursor + 42);
    cursor += 46 + nameLen + extraLen + commentLen;
  }

  if (cursor - origCdOffset !== cdSize) {
    throw new Error(`Central Directory size mismatch: walked ${cursor - origCdOffset}, expected ${cdSize}`);
  }

  // Shift cdOffset (+16 in EOCD) by +baseOffset
  out.writeUInt32LE((origCdOffset + baseOffset) >>> 0, eocdPos + 16);
  return out;
}

/**
 * Builds a spec-compliant Win32 VS_VERSION_INFO (RT_VERSION = 16) binary resource structure.
 * Conforms strictly to Microsoft PE/COFF VS_VERSIONINFO 32-bit (4-byte) alignment rules.
 */
export function buildVersionInfoResource(meta?: Pe64VersionMetadata): Buffer {
  const info: Required<Pe64VersionMetadata> = {
    companyName: meta?.companyName || 'Local Desk Studio',
    fileDescription:
      meta?.fileDescription || 'Local Desk - All-in-One PDF & Document Studio',
    fileVersion: meta?.fileVersion || '1.0.4.0',
    internalName: meta?.internalName || 'LocalDesk',
    legalCopyright: meta?.legalCopyright || 'Copyright (C) 2026 Local Desk Studio',
    legalTrademarks:
      meta?.legalTrademarks || 'Local Desk is a trademark of Local Desk Studio',
    originalFilename: meta?.originalFilename || 'Local Desk.exe',
    productName: meta?.productName || 'Local Desk',
    productVersion: meta?.productVersion || '1.0.4.0',
    comments:
      meta?.comments || 'Local Desk All-in-One PDF & Document Studio (Windows x64)',
    versionTuple: meta?.versionTuple || [1, 0, 4, 0]
  };

  function padTo4(buf: Buffer): Buffer {
    const rem = buf.byteLength % 4;
    if (rem === 0) return buf;
    return Buffer.concat([buf, Buffer.alloc(4 - rem)]);
  }

  function buildVersionNode(
    key: string,
    wType: 0 | 1,
    valueBuf: Buffer,
    wValueLengthOverride: number,
    children: Buffer[]
  ): Buffer {
    const keyUtf16 = Buffer.from(`${key}\0`, 'utf16le');
    const headerAndKey = Buffer.alloc(6 + keyUtf16.byteLength);
    headerAndKey.writeUInt16LE(wValueLengthOverride, 2);
    headerAndKey.writeUInt16LE(wType, 4);
    keyUtf16.copy(headerAndKey, 6);

    const parts: Buffer[] = [padTo4(headerAndKey)];
    if (valueBuf.byteLength > 0) {
      parts.push(padTo4(valueBuf));
    }
    for (let i = 0; i < children.length; i++) {
      // Pad each child except possibly the last one, though padding before each sibling is already handled by padTo4
      parts.push(i < children.length - 1 ? padTo4(children[i]) : children[i]);
    }
    const combined = Buffer.concat(parts);
    combined.writeUInt16LE(combined.byteLength, 0); // wLength = unpadded total length of this node
    return combined;
  }

  function buildStringEntry(name: string, val: string): Buffer {
    const valUtf16 = Buffer.from(`${val}\0`, 'utf16le');
    // For String structure, wValueLength is the number of 16-bit WCHAR words (including null terminator)
    const wordLen = valUtf16.byteLength / 2;
    return buildVersionNode(name, 1, valUtf16, wordLen, []);
  }

  const stringEntries = [
    buildStringEntry('CompanyName', info.companyName),
    buildStringEntry('FileDescription', info.fileDescription),
    buildStringEntry('FileVersion', info.fileVersion),
    buildStringEntry('InternalName', info.internalName),
    buildStringEntry('LegalCopyright', info.legalCopyright),
    buildStringEntry('LegalTrademarks', info.legalTrademarks),
    buildStringEntry('OriginalFilename', info.originalFilename),
    buildStringEntry('ProductName', info.productName),
    buildStringEntry('ProductVersion', info.productVersion),
    buildStringEntry('Comments', info.comments)
  ];

  // 040904B0 = US English (0x0409 = 1033) + Unicode UTF-16LE (0x04B0 = 1200)
  const stringTable = buildVersionNode('040904B0', 1, Buffer.alloc(0), 0, stringEntries);
  const stringFileInfo = buildVersionNode('StringFileInfo', 1, Buffer.alloc(0), 0, [stringTable]);

  const translationVal = Buffer.alloc(4);
  translationVal.writeUInt16LE(0x0409, 0);
  translationVal.writeUInt16LE(0x04b0, 2);
  const varTranslation = buildVersionNode('Translation', 0, translationVal, 4, []);
  const varFileInfo = buildVersionNode('VarFileInfo', 1, Buffer.alloc(0), 0, [varTranslation]);

  // VS_FIXEDFILEINFO (52 bytes)
  const [vMaj, vMin, vPatch, vBuild] = info.versionTuple;
  const fixedInfo = Buffer.alloc(52);
  fixedInfo.writeUInt32LE(0xfeef04bd, 0); // dwSignature
  fixedInfo.writeUInt32LE(0x00010000, 4); // dwStrucVersion = 1.0
  fixedInfo.writeUInt32LE(((vMaj << 16) | vMin) >>> 0, 8); // dwFileVersionMS
  fixedInfo.writeUInt32LE(((vPatch << 16) | vBuild) >>> 0, 12); // dwFileVersionLS
  fixedInfo.writeUInt32LE(((vMaj << 16) | vMin) >>> 0, 16); // dwProductVersionMS
  fixedInfo.writeUInt32LE(((vPatch << 16) | vBuild) >>> 0, 20); // dwProductVersionLS
  fixedInfo.writeUInt32LE(0x3f, 24); // dwFileFlagsMask = VS_FFI_FILEFLAGSMASK
  fixedInfo.writeUInt32LE(0x00, 28); // dwFileFlags = 0
  fixedInfo.writeUInt32LE(0x00040004, 32); // dwFileOS = VOS_NT_WINDOWS32
  fixedInfo.writeUInt32LE(0x01, 36); // dwFileType = VFT_APP
  fixedInfo.writeUInt32LE(0x00, 40); // dwFileSubtype = 0
  fixedInfo.writeUInt32LE(0x00, 44); // dwFileDateMS
  fixedInfo.writeUInt32LE(0x00, 48); // dwFileDateLS

  return buildVersionNode('VS_VERSION_INFO', 0, fixedInfo, 52, [stringFileInfo, varFileInfo]);
}

/**
 * Builds a spec-compliant PE .rsrc section containing:
 * - Type 3  (RT_ICON)       : DIB icon layers (16..128px) + PNG (256px)
 * - Type 14 (RT_GROUP_ICON) : GRPICONDIR directory (ID 1)
 * - Type 16 (RT_VERSION)    : VS_VERSION_INFO version & publisher metadata (ID 1)
 * - Type 24 (RT_MANIFEST)   : Windows 10/11 UAC asInvoker XML manifest (ID 1)
 */
function buildResourceSection(
  pngLayers: Array<{ size: number; pngData: Buffer }>,
  rsrcRva: number,
  versionMeta?: Pe64VersionMetadata
): Buffer {
  const iconLayers = pngLayers.map((layer) => {
    const data = layer.size >= 256 ? layer.pngData : convertPngToWindowsIconDib(layer.pngData);
    return {
      width: layer.size >= 256 ? 0 : layer.size,
      height: layer.size >= 256 ? 0 : layer.size,
      colorCount: 0,
      planes: 1,
      bitCount: 32,
      bytesInRes: data.byteLength,
      data
    };
  });

  // Build GRPICONDIR (6-byte header + N * 14-byte GRPICONDIRENTRY)
  const grpIconDir = Buffer.alloc(6 + iconLayers.length * 14);
  grpIconDir.writeUInt16LE(0, 0); // idReserved = 0
  grpIconDir.writeUInt16LE(1, 2); // idType = 1 (ICON)
  grpIconDir.writeUInt16LE(iconLayers.length, 4); // idCount
  iconLayers.forEach((layer, idx) => {
    const off = 6 + idx * 14;
    grpIconDir.writeUInt8(layer.width, off + 0);
    grpIconDir.writeUInt8(layer.height, off + 1);
    grpIconDir.writeUInt8(layer.colorCount, off + 2);
    grpIconDir.writeUInt8(0, off + 3); // bReserved
    grpIconDir.writeUInt16LE(layer.planes, off + 4);
    grpIconDir.writeUInt16LE(layer.bitCount, off + 6);
    grpIconDir.writeUInt32LE(layer.bytesInRes, off + 8);
    grpIconDir.writeUInt16LE(idx + 1, off + 12); // nID (1-based RT_ICON ID)
  });

  // Build VS_VERSION_INFO (RT_VERSION = 16)
  const versionInfoBuf = buildVersionInfoResource(versionMeta);

  // Canonical Windows 7 / 8 / 8.1 / 10 / 11 Application Manifest with all 5 supportedOS GUIDs & dual DPI awareness
  const manifestXml = Buffer.from(
    [
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">',
      '  <trustInfo xmlns="urn:schemas-microsoft-com:asm.v3">',
      '    <security>',
      '      <requestedPrivileges>',
      '        <requestedExecutionLevel level="asInvoker" uiAccess="false"/>',
      '      </requestedPrivileges>',
      '    </security>',
      '  </trustInfo>',
      '  <compatibility xmlns="urn:schemas-microsoft-com:compatibility.v1">',
      '    <application>',
      '      <!-- Windows 10 and Windows 11 (NT 10.0) -->',
      '      <supportedOS Id="{8e0f7a12-bfb3-4fe8-b9a5-48fd50a15a9a}"/>',
      '      <!-- Windows 8.1 / Server 2012 R2 (NT 6.3) -->',
      '      <supportedOS Id="{1f676c76-80e1-4239-95bb-83d0f6d0da78}"/>',
      '      <!-- Windows 8 / Server 2012 (NT 6.2) -->',
      '      <supportedOS Id="{4a2f28e3-53b9-4441-ba9c-d69d4a4a6e38}"/>',
      '      <!-- Windows 7 SP1 / Server 2008 R2 (NT 6.1) -->',
      '      <supportedOS Id="{35138b9a-5d96-4fbd-8e2d-a2440225f93a}"/>',
      '      <!-- Windows Vista / Server 2008 (NT 6.0) -->',
      '      <supportedOS Id="{e2011457-1546-43c5-a5fe-008deee3d3f0}"/>',
      '    </application>',
      '  </compatibility>',
      '  <application xmlns="urn:schemas-microsoft-com:asm.v3">',
      '    <windowsSettings>',
      '      <dpiAware xmlns="http://schemas.microsoft.com/SMI/2005/WindowsSettings">true/pm</dpiAware>',
      '      <dpiAwareness xmlns="http://schemas.microsoft.com/SMI/2016/WindowsSettings">PerMonitorV2, PerMonitor</dpiAwareness>',
      '    </windowsSettings>',
      '  </application>',
      '</assembly>'
    ].join('\r\n'),
    'utf-8'
  );

  const totalLeaves = iconLayers.length + 3;
  const l1Offset = 0;
  const l1Size = 16 + 4 * 8; // 4 resource types: 3 (ICON), 14 (GROUP_ICON), 16 (VERSION), 24 (MANIFEST)

  const l2Type3Offset = l1Offset + l1Size;
  const l2Type3Size = 16 + iconLayers.length * 8;
  const l2Type14Offset = l2Type3Offset + l2Type3Size;
  const l2Type14Size = 16 + 1 * 8;
  const l2Type16Offset = l2Type14Offset + l2Type14Size;
  const l2Type16Size = 16 + 1 * 8;
  const l2Type24Offset = l2Type16Offset + l2Type16Size;
  const l2Type24Size = 16 + 1 * 8;

  const l3StartOffset = l2Type24Offset + l2Type24Size;
  const l3DirSize = 24;

  const dataEntriesOffset = l3StartOffset + totalLeaves * l3DirSize;
  const dataEntriesSize = totalLeaves * 16;

  let payloadCursor = alignUp(dataEntriesOffset + dataEntriesSize, 16);

  const leafPayloads: Array<{ data: Buffer; offset: number }> = [];
  for (const layer of iconLayers) {
    leafPayloads.push({ data: layer.data, offset: payloadCursor });
    payloadCursor = alignUp(payloadCursor + layer.data.byteLength, 8);
  }
  leafPayloads.push({ data: grpIconDir, offset: payloadCursor });
  payloadCursor = alignUp(payloadCursor + grpIconDir.byteLength, 8);
  leafPayloads.push({ data: versionInfoBuf, offset: payloadCursor });
  payloadCursor = alignUp(payloadCursor + versionInfoBuf.byteLength, 8);
  leafPayloads.push({ data: manifestXml, offset: payloadCursor });
  payloadCursor = alignUp(payloadCursor + manifestXml.byteLength, 16);

  const rsrcBuf = Buffer.alloc(payloadCursor);

  // Level 1 Root Directory (sorted ascending: 3, 14, 16, 24)
  rsrcBuf.writeUInt16LE(4, l1Offset + 14);
  rsrcBuf.writeUInt32LE(3, l1Offset + 16 + 0);
  rsrcBuf.writeUInt32LE((0x80000000 | l2Type3Offset) >>> 0, l1Offset + 16 + 4);
  rsrcBuf.writeUInt32LE(14, l1Offset + 24 + 0);
  rsrcBuf.writeUInt32LE((0x80000000 | l2Type14Offset) >>> 0, l1Offset + 24 + 4);
  rsrcBuf.writeUInt32LE(16, l1Offset + 32 + 0);
  rsrcBuf.writeUInt32LE((0x80000000 | l2Type16Offset) >>> 0, l1Offset + 32 + 4);
  rsrcBuf.writeUInt32LE(24, l1Offset + 40 + 0);
  rsrcBuf.writeUInt32LE((0x80000000 | l2Type24Offset) >>> 0, l1Offset + 40 + 4);

  // Level 2: Type 3 (RT_ICON)
  rsrcBuf.writeUInt16LE(iconLayers.length, l2Type3Offset + 14);
  for (let i = 0; i < iconLayers.length; i++) {
    const entryOff = l2Type3Offset + 16 + i * 8;
    const l3Off = l3StartOffset + i * l3DirSize;
    rsrcBuf.writeUInt16LE(0, entryOff + 0);
    rsrcBuf.writeUInt32LE(i + 1, entryOff + 0);
    rsrcBuf.writeUInt32LE((0x80000000 | l3Off) >>> 0, entryOff + 4);
  }

  // Level 2: Type 14 (RT_GROUP_ICON)
  const grpLeafIdx = iconLayers.length;
  rsrcBuf.writeUInt16LE(1, l2Type14Offset + 14);
  rsrcBuf.writeUInt32LE(1, l2Type14Offset + 16 + 0);
  rsrcBuf.writeUInt32LE(
    (0x80000000 | (l3StartOffset + grpLeafIdx * l3DirSize)) >>> 0,
    l2Type14Offset + 16 + 4
  );

  // Level 2: Type 16 (RT_VERSION)
  const versionLeafIdx = iconLayers.length + 1;
  rsrcBuf.writeUInt16LE(1, l2Type16Offset + 14);
  rsrcBuf.writeUInt32LE(1, l2Type16Offset + 16 + 0);
  rsrcBuf.writeUInt32LE(
    (0x80000000 | (l3StartOffset + versionLeafIdx * l3DirSize)) >>> 0,
    l2Type16Offset + 16 + 4
  );

  // Level 2: Type 24 (RT_MANIFEST)
  const manifestLeafIdx = iconLayers.length + 2;
  rsrcBuf.writeUInt16LE(1, l2Type24Offset + 14);
  rsrcBuf.writeUInt32LE(1, l2Type24Offset + 16 + 0);
  rsrcBuf.writeUInt32LE(
    (0x80000000 | (l3StartOffset + manifestLeafIdx * l3DirSize)) >>> 0,
    l2Type24Offset + 16 + 4
  );

  // Level 3 + Leaf Data Entries
  for (let i = 0; i < totalLeaves; i++) {
    const l3Off = l3StartOffset + i * l3DirSize;
    const dataEntryOff = dataEntriesOffset + i * 16;
    rsrcBuf.writeUInt16LE(1, l3Off + 14);
    rsrcBuf.writeUInt32LE(1033, l3Off + 16 + 0);
    rsrcBuf.writeUInt32LE(dataEntryOff, l3Off + 16 + 4);

    const payload = leafPayloads[i];
    rsrcBuf.writeUInt32LE(rsrcRva + payload.offset, dataEntryOff + 0);
    rsrcBuf.writeUInt32LE(payload.data.byteLength, dataEntryOff + 4);
    rsrcBuf.writeUInt32LE(0, dataEntryOff + 8);
    rsrcBuf.writeUInt32LE(0, dataEntryOff + 12);

    payload.data.copy(rsrcBuf, payload.offset);
  }

  return rsrcBuf;
}

/**
 * Generates a complete, spec-compliant 64-bit Windows 11 PE32+ (AMD64 / x86_64) GUI executable (.exe)
 * with 5 isolated, page-aligned sections (.text, .rdata, .data, .rsrc, .reloc) and relocated SFX ZIP offsets.
 */
export function buildWindowsPe64Executable(options: Pe64BuildOptions): Buffer {
  const FILE_ALIGNMENT = 0x200; // 512 bytes
  const SECTION_ALIGNMENT = 0x1000; // 4096 bytes
  const HEADERS_RAW_SIZE = 0x400; // 1024 bytes

  const TEXT_RVA = 0x1000;
  const RDATA_RVA = 0x2000;
  const RDATA_VIRTUAL_SIZE = 0x1000; // 4 KB read-only import directory, ILT, IAT & constants
  const DATA_RVA = 0x3000;
  const DATA_VIRTUAL_SIZE = 0x4000; // 16 KB writable buffers (isolated from IAT page protection!)
  const RSRC_RVA = 0x7000;

  // ==========================================================================
  // 1. Build Read-Only .rdata Section (RVA 0x2000, Raw Size 0x400 = 1024 B)
  // ==========================================================================
  const rdataRawSize = 0x400;
  const rdataBuf = Buffer.alloc(rdataRawSize);

  const IMPORTS = [
    { name: 'GetModuleFileNameW', hintOff: 0x0110, iatRva: RDATA_RVA + 0x0070 },
    { name: 'SetEnvironmentVariableW', hintOff: 0x0130, iatRva: RDATA_RVA + 0x0078 },
    { name: 'CreateProcessW', hintOff: 0x0150, iatRva: RDATA_RVA + 0x0080 },
    { name: 'WaitForSingleObject', hintOff: 0x0170, iatRva: RDATA_RVA + 0x0088 },
    { name: 'CloseHandle', hintOff: 0x0190, iatRva: RDATA_RVA + 0x0090 },
    { name: 'ExitProcess', hintOff: 0x01b0, iatRva: RDATA_RVA + 0x0098 }
  ];

  // IMAGE_IMPORT_DESCRIPTOR[0] at 0x0000
  rdataBuf.writeUInt32LE(RDATA_RVA + 0x0030, 0x0000); // OriginalFirstThunk (ILT RVA)
  rdataBuf.writeUInt32LE(0, 0x0004);
  rdataBuf.writeUInt32LE(0, 0x0008);
  rdataBuf.writeUInt32LE(RDATA_RVA + 0x0100, 0x000c); // Name RVA ("KERNEL32.dll")
  rdataBuf.writeUInt32LE(RDATA_RVA + 0x0070, 0x0010); // FirstThunk (IAT RVA)

  rdataBuf.write('KERNEL32.dll\0', 0x0100, 'ascii');

  IMPORTS.forEach((imp, idx) => {
    const thunkRva = BigInt(RDATA_RVA + imp.hintOff);
    rdataBuf.writeBigUInt64LE(thunkRva, 0x0030 + idx * 8);
    rdataBuf.writeBigUInt64LE(thunkRva, 0x0070 + idx * 8);
    rdataBuf.writeUInt16LE(0, imp.hintOff);
    rdataBuf.write(`${imp.name}\0`, imp.hintOff + 2, 'ascii');
  });

  // Read-only L"LOCAL_DESK_EXE_PATH\0" at RVA 0x2200
  const ENV_NAME_RVA = RDATA_RVA + 0x0200;
  Buffer.from('LOCAL_DESK_EXE_PATH\0', 'utf16le').copy(rdataBuf, 0x0200);

  // ==========================================================================
  // 2. Build Writable .data Section (RVA 0x3000, Raw Size 0x4000 = 16 KB)
  // ==========================================================================
  const dataBuf = Buffer.alloc(DATA_VIRTUAL_SIZE);

  // 0x0000 (RVA 0x3000): STARTUPINFOW (104 bytes = 0x68)
  // 0x0070 (RVA 0x3070): PROCESS_INFORMATION (24 bytes = 0x18)
  // 0x0100 (RVA 0x3100): Writable UTF-16LE commandLine buffer (4096 bytes)
  // 0x1100 (RVA 0x4100): Writable UTF-16LE exePathBuf (8192 bytes)
  dataBuf.writeUInt32LE(104, 0x0000 + 0x00); // cb = sizeof(STARTUPINFOW) = 104
  dataBuf.writeUInt32LE(1, 0x0000 + 0x3c); // dwFlags = STARTF_USESHOWWINDOW (1)
  dataBuf.writeUInt16LE(1, 0x0000 + 0x40); // wShowWindow = SW_SHOWNORMAL (1) — standard visible GUI window

  const cmdUtf16 = Buffer.from(`${options.commandLine}\0`, 'utf16le');
  if (cmdUtf16.byteLength > 0x0f80) {
    throw new Error(`Command line exceeds 4000 bytes UTF-16LE (${cmdUtf16.byteLength}B)`);
  }
  cmdUtf16.copy(dataBuf, 0x0100);

  const STARTUP_INFO_RVA = DATA_RVA + 0x0000;
  const PROC_INFO_RVA = DATA_RVA + 0x0070;
  const PROC_THREAD_RVA = DATA_RVA + 0x0078;
  const CMD_LINE_RVA = DATA_RVA + 0x0100;
  const EXE_PATH_BUF_RVA = DATA_RVA + 0x1100;

  // ==========================================================================
  // 3. Build .text Section (x86-64 RIP-Relative Machine Code at RVA 0x1000)
  // ==========================================================================
  const textRawBuf = Buffer.alloc(FILE_ALIGNMENT); // 512 bytes
  let pc = 0;

  const emitBytes = (bytes: number[]) => {
    for (const b of bytes) {
      textRawBuf[pc++] = b & 0xff;
    }
  };

  const emitU32 = (val: number) => {
    textRawBuf.writeInt32LE(val | 0, pc);
    pc += 4;
  };

  const emitRip7 = (opcode: number, modrm: number, targetRva: number) => {
    const nextInstructionRva = TEXT_RVA + pc + 7;
    const disp32 = targetRva - nextInstructionRva;
    emitBytes([0x48, opcode, modrm]);
    emitU32(disp32);
  };

  const emitCallRip = (iatRva: number) => {
    const nextInstructionRva = TEXT_RVA + pc + 6;
    const disp32 = iatRva - nextInstructionRva;
    emitBytes([0xff, 0x15]);
    emitU32(disp32);
  };

  // Prologue: sub rsp, 0x58
  emitBytes([0x48, 0x83, 0xec, 0x58]);

  // GetModuleFileNameW(NULL, &exePathBuf, 4090)
  emitBytes([0x31, 0xc9]);
  emitRip7(0x8d, 0x15, EXE_PATH_BUF_RVA);
  emitBytes([0x41, 0xb8, 0xfa, 0x0f, 0x00, 0x00]);
  emitCallRip(IMPORTS[0].iatRva);

  // SetEnvironmentVariableW(L"LOCAL_DESK_EXE_PATH", &exePathBuf)
  emitRip7(0x8d, 0x0d, ENV_NAME_RVA);
  emitRip7(0x8d, 0x15, EXE_PATH_BUF_RVA);
  emitCallRip(IMPORTS[1].iatRva);

  // CreateProcessW(NULL, &cmdLineBuf, NULL, NULL, FALSE, 0, NULL, NULL, &startupInfo, &procInfo)
  emitBytes([0x31, 0xc9]);
  emitRip7(0x8d, 0x15, CMD_LINE_RVA);
  emitBytes([0x45, 0x31, 0xc0]);
  emitBytes([0x45, 0x31, 0xc9]);
  emitBytes([0xc7, 0x44, 0x24, 0x20, 0x00, 0x00, 0x00, 0x00]);
  emitBytes([0xc7, 0x44, 0x24, 0x28, 0x00, 0x00, 0x00, 0x00]); // dwCreationFlags = 0 (standard visible GUI, no CREATE_NO_WINDOW)
  emitBytes([0x48, 0xc7, 0x44, 0x24, 0x30, 0x00, 0x00, 0x00, 0x00]);
  emitBytes([0x48, 0xc7, 0x44, 0x24, 0x38, 0x00, 0x00, 0x00, 0x00]);
  emitRip7(0x8d, 0x05, STARTUP_INFO_RVA);
  emitBytes([0x48, 0x89, 0x44, 0x24, 0x40]);
  emitRip7(0x8d, 0x05, PROC_INFO_RVA);
  emitBytes([0x48, 0x89, 0x44, 0x24, 0x48]);
  emitCallRip(IMPORTS[2].iatRva);

  // If eax != 0, wait & close handles
  emitBytes([0x85, 0xc0]);
  emitBytes([0x74, 0x2c]);

  emitRip7(0x8b, 0x0d, PROC_INFO_RVA);
  emitBytes([0xba]);
  emitU32(options.waitForChildMs);
  emitCallRip(IMPORTS[3].iatRva);

  emitRip7(0x8b, 0x0d, PROC_INFO_RVA);
  emitCallRip(IMPORTS[4].iatRva);

  emitRip7(0x8b, 0x0d, PROC_THREAD_RVA);
  emitCallRip(IMPORTS[4].iatRva);

  // ExitProcess(0)
  emitBytes([0x31, 0xc9]);
  emitCallRip(IMPORTS[5].iatRva);
  emitBytes([0xcc]);

  const textVirtualSize = pc;

  // ==========================================================================
  // 4. Build .rsrc Section (DIB Icons + GroupIcon + VersionInfo + Win32 Manifest at RVA 0x7000)
  // ==========================================================================
  const rsrcVirtualBuf = buildResourceSection(options.pngLayers, RSRC_RVA, options.versionInfo);
  const rsrcRawSize = alignUp(rsrcVirtualBuf.byteLength, FILE_ALIGNMENT);
  const rsrcRawBuf = Buffer.alloc(rsrcRawSize);
  rsrcVirtualBuf.copy(rsrcRawBuf, 0);

  // ==========================================================================
  // 5. Build .reloc Section (Windows 11 High-Entropy ASLR Base Relocation Table)
  // ==========================================================================
  const RELOC_RVA = alignUp(RSRC_RVA + rsrcVirtualBuf.byteLength, SECTION_ALIGNMENT);
  const relocVirtualSize = 12; // 8-byte IMAGE_BASE_RELOCATION header + two 2-byte IMAGE_REL_BASED_ABSOLUTE entries
  const relocRawBuf = Buffer.alloc(FILE_ALIGNMENT);
  relocRawBuf.writeUInt32LE(TEXT_RVA, 0); // Page RVA = 0x1000
  relocRawBuf.writeUInt32LE(12, 4); // SizeOfBlock = 12 bytes
  relocRawBuf.writeUInt16LE(0x0000, 8); // IMAGE_REL_BASED_ABSOLUTE (no-op)
  relocRawBuf.writeUInt16LE(0x0000, 10); // IMAGE_REL_BASED_ABSOLUTE (no-op)

  // ==========================================================================
  // 6. Build DOS Header + PE32+ NT Headers + 5 Section Headers (0x00..0x3FF)
  // ==========================================================================
  const headersBuf = Buffer.alloc(HEADERS_RAW_SIZE);

  // IMAGE_DOS_HEADER
  headersBuf.writeUInt16LE(0x5a4d, 0x00); // "MZ"
  headersBuf.writeUInt16LE(0x0090, 0x02);
  headersBuf.writeUInt16LE(0x0003, 0x04);
  headersBuf.writeUInt16LE(0x0004, 0x08);
  headersBuf.writeUInt16LE(0xffff, 0x0c);
  headersBuf.writeUInt16LE(0x00b8, 0x10);
  headersBuf.writeUInt16LE(0x0040, 0x18);
  headersBuf.writeUInt32LE(0x00000080, 0x3c); // e_lfanew = 0x80

  const dosStubHex =
    '0e1fba0e00b409cd21b8014ccd21546869732070726f6772616d2063616e6e6f742062652072756e20696e20444f53206d6f64652e0d0d0a2400000000000000';
  Buffer.from(dosStubHex, 'hex').copy(headersBuf, 0x40);

  // IMAGE_NT_HEADERS64 at 0x80
  const ntOff = 0x80;
  headersBuf.writeUInt32LE(0x00004550, ntOff + 0x00); // "PE\0\0"

  const fhOff = ntOff + 0x04;
  headersBuf.writeUInt16LE(0x8664, fhOff + 0x00); // IMAGE_FILE_MACHINE_AMD64 (x64)
  headersBuf.writeUInt16LE(5, fhOff + 0x02); // NumberOfSections = 5 (.text, .rdata, .data, .rsrc, .reloc)
  headersBuf.writeUInt32LE(1730678400, fhOff + 0x04);
  headersBuf.writeUInt32LE(0, fhOff + 0x08);
  headersBuf.writeUInt32LE(0, fhOff + 0x0c);
  headersBuf.writeUInt16LE(0x00f0, fhOff + 0x10); // SizeOfOptionalHeader = 240
  headersBuf.writeUInt16LE(0x0022, fhOff + 0x12); // EXECUTABLE_IMAGE | LARGE_ADDRESS_AWARE

  const optOff = ntOff + 0x18;
  const totalSizeOfImage = alignUp(RELOC_RVA + relocVirtualSize, SECTION_ALIGNMENT);
  const totalInitializedData =
    rdataBuf.byteLength + dataBuf.byteLength + rsrcRawBuf.byteLength + relocRawBuf.byteLength;

  headersBuf.writeUInt16LE(0x020b, optOff + 0x00); // PE32+ (64-bit)
  headersBuf.writeUInt8(14, optOff + 0x02);
  headersBuf.writeUInt8(0, optOff + 0x03);
  headersBuf.writeUInt32LE(textRawBuf.byteLength, optOff + 0x04); // SizeOfCode
  headersBuf.writeUInt32LE(totalInitializedData, optOff + 0x08); // SizeOfInitializedData
  headersBuf.writeUInt32LE(0, optOff + 0x0c);
  headersBuf.writeUInt32LE(TEXT_RVA, optOff + 0x10); // AddressOfEntryPoint = 0x1000
  headersBuf.writeUInt32LE(TEXT_RVA, optOff + 0x14); // BaseOfCode = 0x1000
  headersBuf.writeBigUInt64LE(0x0000000140000000n, optOff + 0x18); // ImageBase
  headersBuf.writeUInt32LE(SECTION_ALIGNMENT, optOff + 0x20); // SectionAlignment = 0x1000
  headersBuf.writeUInt32LE(FILE_ALIGNMENT, optOff + 0x24); // FileAlignment = 0x200
  headersBuf.writeUInt16LE(6, optOff + 0x28); // MajorOperatingSystemVersion = 6
  headersBuf.writeUInt16LE(0, optOff + 0x2a);
  headersBuf.writeUInt16LE(1, optOff + 0x2c);
  headersBuf.writeUInt16LE(0, optOff + 0x2e);
  headersBuf.writeUInt16LE(6, optOff + 0x30); // MajorSubsystemVersion = 6
  headersBuf.writeUInt16LE(0, optOff + 0x32);
  headersBuf.writeUInt32LE(0, optOff + 0x34);
  headersBuf.writeUInt32LE(totalSizeOfImage, optOff + 0x38); // SizeOfImage
  headersBuf.writeUInt32LE(HEADERS_RAW_SIZE, optOff + 0x3c); // SizeOfHeaders = 0x400
  headersBuf.writeUInt32LE(0, optOff + 0x40); // CheckSum
  headersBuf.writeUInt16LE(2, optOff + 0x44); // Subsystem = IMAGE_SUBSYSTEM_WINDOWS_GUI (2)
  // DllCharacteristics = 0x8160 (HIGH_ENTROPY_VA | DYNAMIC_BASE | NX_COMPAT | TERMINAL_SERVER_AWARE)
  headersBuf.writeUInt16LE(0x8160, optOff + 0x46);
  headersBuf.writeBigUInt64LE(0x0000000000100000n, optOff + 0x48);
  headersBuf.writeBigUInt64LE(0x0000000000004000n, optOff + 0x50);
  headersBuf.writeBigUInt64LE(0x0000000000100000n, optOff + 0x58);
  headersBuf.writeBigUInt64LE(0x0000000000001000n, optOff + 0x60);
  headersBuf.writeUInt32LE(0, optOff + 0x68);
  headersBuf.writeUInt32LE(16, optOff + 0x6c);

  const ddOff = optOff + 0x70;
  // DataDirectory[1]: Import Table (RVA 0x2000, Size 40)
  headersBuf.writeUInt32LE(RDATA_RVA, ddOff + 1 * 8 + 0);
  headersBuf.writeUInt32LE(40, ddOff + 1 * 8 + 4);
  // DataDirectory[2]: Resource Table (RVA 0x7000, Size rsrcVirtualBuf.byteLength)
  headersBuf.writeUInt32LE(RSRC_RVA, ddOff + 2 * 8 + 0);
  headersBuf.writeUInt32LE(rsrcVirtualBuf.byteLength, ddOff + 2 * 8 + 4);
  // DataDirectory[5]: Base Relocation Table (RVA RELOC_RVA, Size 12)
  headersBuf.writeUInt32LE(RELOC_RVA, ddOff + 5 * 8 + 0);
  headersBuf.writeUInt32LE(relocVirtualSize, ddOff + 5 * 8 + 4);
  // DataDirectory[12]: IAT (RVA 0x2070, Size 56)
  headersBuf.writeUInt32LE(RDATA_RVA + 0x0070, ddOff + 12 * 8 + 0);
  headersBuf.writeUInt32LE(56, ddOff + 12 * 8 + 4);

  // Section Headers (5 * 40 bytes starting at 0x188)
  const secOff = optOff + 0xf0;
  const textRawPtr = HEADERS_RAW_SIZE; // 0x400
  const rdataRawPtr = textRawPtr + textRawBuf.byteLength; // 0x600
  const dataRawPtr = rdataRawPtr + rdataBuf.byteLength; // 0xA00
  const rsrcRawPtr = dataRawPtr + dataBuf.byteLength; // 0x4A00
  const relocRawPtr = rsrcRawPtr + rsrcRawBuf.byteLength;

  const writeSectionHeader = (
    idx: number,
    name: string,
    vSize: number,
    vAddr: number,
    rawSize: number,
    rawPtr: number,
    chars: number
  ) => {
    const off = secOff + idx * 40;
    headersBuf.write(name.padEnd(8, '\0'), off + 0, 'ascii');
    headersBuf.writeUInt32LE(vSize, off + 8);
    headersBuf.writeUInt32LE(vAddr, off + 12);
    headersBuf.writeUInt32LE(rawSize, off + 16);
    headersBuf.writeUInt32LE(rawPtr, off + 20);
    headersBuf.writeUInt32LE(chars >>> 0, off + 36);
  };

  writeSectionHeader(0, '.text', textVirtualSize, TEXT_RVA, textRawBuf.byteLength, textRawPtr, 0x60000020);
  writeSectionHeader(1, '.rdata', 0x0240, RDATA_RVA, rdataBuf.byteLength, rdataRawPtr, 0x40000040);
  writeSectionHeader(2, '.data', DATA_VIRTUAL_SIZE, DATA_RVA, dataBuf.byteLength, dataRawPtr, 0xc0000040);
  writeSectionHeader(3, '.rsrc', rsrcVirtualBuf.byteLength, RSRC_RVA, rsrcRawBuf.byteLength, rsrcRawPtr, 0x40000040);
  writeSectionHeader(4, '.reloc', relocVirtualSize, RELOC_RVA, relocRawBuf.byteLength, relocRawPtr, 0x42000040);

  const basePeBuf = Buffer.concat([
    headersBuf,
    textRawBuf,
    rdataBuf,
    dataBuf,
    rsrcRawBuf,
    relocRawBuf
  ]);

  let finalBuf = basePeBuf;
  if (options.sfxZipPayload) {
    const relocatedZip = relocateZipCentralDirectoryOffsets(
      options.sfxZipPayload,
      basePeBuf.byteLength
    );
    finalBuf = Buffer.concat([basePeBuf, relocatedZip]);
  }

  const checksum = computePeChecksum(finalBuf, optOff + 0x40);
  finalBuf.writeUInt32LE(checksum, optOff + 0x40);

  return finalBuf;
}
