import crypto from 'crypto';

export interface Pe64BuildOptions {
  /**
   * Command line (UTF-16LE) passed to CreateProcessW.
   * For example: `powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "..."`
   */
  commandLine: string;
  /**
   * Whether to wait for the spawned process to finish before exiting (0xFFFFFFFF for installer, 0 for launcher)
   */
  waitForChildMs: number;
  /**
   * Raw multi-resolution .ico file buffer (used to populate RT_ICON and RT_GROUP_ICON in .rsrc)
   */
  icoBuffer: Buffer;
  /**
   * Optional padded size of the PE binary before any overlay payload (e.g. 32768 = 0x8000)
   */
  padToSize?: number;
  /**
   * Optional overlay payload (e.g. ZIP archive for self-extracting Setup.exe)
   */
  overlayPayload?: Buffer;
}

function alignUp(value: number, alignment: number): number {
  return Math.ceil(value / alignment) * alignment;
}

/**
 * Computes the standard Windows PE header CheckSum (imagehlp!CheckSumMappedFile algorithm)
 */
export function computePeChecksum(buffer: Buffer, checksumOffset: number): number {
  bufWriteZeroChecksum(buffer, checksumOffset);
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

function bufWriteZeroChecksum(buffer: Buffer, checksumOffset: number) {
  buffer.writeUInt32LE(0, checksumOffset);
}

/**
 * Parses a Windows .ico buffer and builds a spec-compliant PE .rsrc section
 * containing:
 * - Type 3  (RT_ICON)       : Individual icon layers (IDs 1..N)
 * - Type 14 (RT_GROUP_ICON) : GRPICONDIR directory (ID 1)
 * - Type 24 (RT_MANIFEST)   : Windows 10/11 UAC asInvoker XML manifest (ID 1)
 */
function buildResourceSection(icoBuffer: Buffer, rsrcRva: number): Buffer {
  const iconCount = icoBuffer.readUInt16LE(4);
  const iconLayers: Array<{
    width: number;
    height: number;
    colorCount: number;
    planes: number;
    bitCount: number;
    bytesInRes: number;
    data: Buffer;
  }> = [];

  for (let i = 0; i < iconCount; i++) {
    const entryOffset = 6 + i * 16;
    const width = icoBuffer.readUInt8(entryOffset + 0);
    const height = icoBuffer.readUInt8(entryOffset + 1);
    const colorCount = icoBuffer.readUInt8(entryOffset + 2);
    const planes = icoBuffer.readUInt16LE(entryOffset + 4);
    const bitCount = icoBuffer.readUInt16LE(entryOffset + 6);
    const bytesInRes = icoBuffer.readUInt32LE(entryOffset + 8);
    const imageOffset = icoBuffer.readUInt32LE(entryOffset + 12);
    const data = icoBuffer.subarray(imageOffset, imageOffset + bytesInRes);
    iconLayers.push({
      width,
      height,
      colorCount,
      planes,
      bitCount,
      bytesInRes,
      data
    });
  }

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
    grpIconDir.writeUInt16LE(layer.planes || 1, off + 4);
    grpIconDir.writeUInt16LE(layer.bitCount || 32, off + 6);
    grpIconDir.writeUInt32LE(layer.bytesInRes, off + 8);
    grpIconDir.writeUInt16LE(idx + 1, off + 12); // nID (1-based RT_ICON ID)
  });

  // Build canonical Windows 10/11 asInvoker Application Manifest (prevents UAC elevation prompt on *-Setup-*.exe)
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
      '</assembly>'
    ].join('\r\n'),
    'utf-8'
  );

  // Resource tree layout calculation:
  // Total leaf items = iconLayers.length (RT_ICON 1..N) + 1 (RT_GROUP_ICON 1) + 1 (RT_MANIFEST 1)
  const totalLeaves = iconLayers.length + 2;

  // Level 1: Root directory (16B) + 3 entries (24B) = 40B (0x00..0x28)
  const l1Offset = 0;
  const l1Size = 16 + 3 * 8;

  // Level 2:
  // - Type 3 (RT_ICON) dir: 16B + N * 8B
  // - Type 14 (RT_GROUP_ICON) dir: 16B + 1 * 8B = 24B
  // - Type 24 (RT_MANIFEST) dir: 16B + 1 * 8B = 24B
  const l2Type3Offset = l1Offset + l1Size;
  const l2Type3Size = 16 + iconLayers.length * 8;
  const l2Type14Offset = l2Type3Offset + l2Type3Size;
  const l2Type14Size = 16 + 1 * 8;
  const l2Type24Offset = l2Type14Offset + l2Type14Size;
  const l2Type24Size = 16 + 1 * 8;

  // Level 3: Language directories (totalLeaves * (16B + 8B = 24B))
  const l3StartOffset = l2Type24Offset + l2Type24Size;
  const l3DirSize = 24;

  // Leaf IMAGE_RESOURCE_DATA_ENTRY array (totalLeaves * 16B)
  const dataEntriesOffset = l3StartOffset + totalLeaves * l3DirSize;
  const dataEntriesSize = totalLeaves * 16;

  // Raw payload blobs start at 16-byte aligned offset after dataEntries
  let payloadCursor = alignUp(dataEntriesOffset + dataEntriesSize, 16);

  const leafPayloads: Array<{ data: Buffer; offset: number }> = [];
  for (const layer of iconLayers) {
    leafPayloads.push({ data: layer.data, offset: payloadCursor });
    payloadCursor = alignUp(payloadCursor + layer.data.byteLength, 8);
  }
  // Leaf N: GRPICONDIR
  leafPayloads.push({ data: grpIconDir, offset: payloadCursor });
  payloadCursor = alignUp(payloadCursor + grpIconDir.byteLength, 8);
  // Leaf N+1: RT_MANIFEST
  leafPayloads.push({ data: manifestXml, offset: payloadCursor });
  payloadCursor = alignUp(payloadCursor + manifestXml.byteLength, 16);

  const rsrcBuf = Buffer.alloc(payloadCursor);

  // Write Level 1 Root Directory
  rsrcBuf.writeUInt16LE(3, l1Offset + 14); // NumberOfIdEntries = 3
  // Entry 0: Type 3 (RT_ICON)
  rsrcBuf.writeUInt32LE(3, l1Offset + 16 + 0);
  rsrcBuf.writeUInt32LE((0x80000000 | l2Type3Offset) >>> 0, l1Offset + 16 + 4);
  // Entry 1: Type 14 (RT_GROUP_ICON)
  rsrcBuf.writeUInt32LE(14, l1Offset + 24 + 0);
  rsrcBuf.writeUInt32LE((0x80000000 | l2Type14Offset) >>> 0, l1Offset + 24 + 4);
  // Entry 2: Type 24 (RT_MANIFEST)
  rsrcBuf.writeUInt32LE(24, l1Offset + 32 + 0);
  rsrcBuf.writeUInt32LE((0x80000000 | l2Type24Offset) >>> 0, l1Offset + 32 + 4);

  // Write Level 2: Type 3 (RT_ICON) IDs 1..N
  rsrcBuf.writeUInt16LE(iconLayers.length, l2Type3Offset + 14);
  for (let i = 0; i < iconLayers.length; i++) {
    const entryOff = l2Type3Offset + 16 + i * 8;
    const l3Off = l3StartOffset + i * l3DirSize;
    rsrcBuf.writeUInt32LE(i + 1, entryOff + 0); // Icon ID (1..N)
    rsrcBuf.writeUInt32LE((0x80000000 | l3Off) >>> 0, entryOff + 4);
  }

  // Write Level 2: Type 14 (RT_GROUP_ICON) ID 1
  const grpLeafIdx = iconLayers.length;
  rsrcBuf.writeUInt16LE(1, l2Type14Offset + 14);
  rsrcBuf.writeUInt32LE(1, l2Type14Offset + 16 + 0);
  rsrcBuf.writeUInt32LE(
    (0x80000000 | (l3StartOffset + grpLeafIdx * l3DirSize)) >>> 0,
    l2Type14Offset + 16 + 4
  );

  // Write Level 2: Type 24 (RT_MANIFEST) ID 1
  const manifestLeafIdx = iconLayers.length + 1;
  rsrcBuf.writeUInt16LE(1, l2Type24Offset + 14);
  rsrcBuf.writeUInt32LE(1, l2Type24Offset + 16 + 0);
  rsrcBuf.writeUInt32LE(
    (0x80000000 | (l3StartOffset + manifestLeafIdx * l3DirSize)) >>> 0,
    l2Type24Offset + 16 + 4
  );

  // Write Level 3 Language Directories & Leaf Data Entries + Payload Bytes
  for (let i = 0; i < totalLeaves; i++) {
    const l3Off = l3StartOffset + i * l3DirSize;
    const dataEntryOff = dataEntriesOffset + i * 16;
    rsrcBuf.writeUInt16LE(1, l3Off + 14); // NumberOfIdEntries = 1
    rsrcBuf.writeUInt32LE(1033, l3Off + 16 + 0); // Language 1033 (0x0409 en-US)
    rsrcBuf.writeUInt32LE(dataEntryOff, l3Off + 16 + 4); // Points to IMAGE_RESOURCE_DATA_ENTRY (high bit 0)

    const payload = leafPayloads[i];
    rsrcBuf.writeUInt32LE(rsrcRva + payload.offset, dataEntryOff + 0); // RVA of resource data
    rsrcBuf.writeUInt32LE(payload.data.byteLength, dataEntryOff + 4); // Exact byte size
    rsrcBuf.writeUInt32LE(0, dataEntryOff + 8); // CodePage = 0
    rsrcBuf.writeUInt32LE(0, dataEntryOff + 12); // Reserved = 0

    payload.data.copy(rsrcBuf, payload.offset);
  }

  return rsrcBuf;
}

/**
 * Generates a complete, spec-compliant 64-bit Windows PE32+ (AMD64 / x86_64) GUI executable (.exe)
 */
export function buildWindowsPe64Executable(options: Pe64BuildOptions): Buffer {
  const FILE_ALIGNMENT = 0x200; // 512 bytes
  const SECTION_ALIGNMENT = 0x1000; // 4096 bytes
  const HEADERS_RAW_SIZE = 0x400; // 1024 bytes

  const TEXT_RVA = 0x1000;
  const RDATA_RVA = 0x2000;
  const RDATA_VIRTUAL_SIZE = 0x4000; // 16,384 bytes (0x2000..0x5FFF)
  const RSRC_RVA = 0x6000;

  // ==========================================================================
  // 1. Build .rdata / .data Section (RVA 0x2000, Raw Size 0x4000 = 16 KB)
  // ==========================================================================
  const rdataBuf = Buffer.alloc(RDATA_VIRTUAL_SIZE);

  // Offsets within .rdata (relative to RDATA_RVA = 0x2000):
  // 0x0000 (RVA 0x2000): IMAGE_IMPORT_DESCRIPTOR[0] (KERNEL32.dll) + Null descriptor (40 bytes)
  // 0x0030 (RVA 0x2030): Import Lookup Table (ILT) — 7 QWORDs (56 bytes)
  // 0x0070 (RVA 0x2070): Import Address Table (IAT) — 7 QWORDs (56 bytes)
  // 0x0100 (RVA 0x2100): "KERNEL32.dll\0"
  // 0x0110..0x01D0     : IMAGE_IMPORT_BY_NAME entries
  // 0x0200 (RVA 0x2200): L"LOCAL_DESK_EXE_PATH\0"
  // 0x0240 (RVA 0x2240): STARTUPINFOW (104 bytes = 0x68)
  // 0x02B0 (RVA 0x22B0): PROCESS_INFORMATION (24 bytes = 0x18)
  // 0x0300 (RVA 0x2300): Writable UTF-16LE commandLine buffer (up to 4096 bytes)
  // 0x1300 (RVA 0x3300): Writable UTF-16LE exePathBuf (8192 bytes)

  const IMPORTS = [
    { name: 'GetModuleFileNameW', hintOff: 0x0110, iatRva: RDATA_RVA + 0x0070 },
    { name: 'SetEnvironmentVariableW', hintOff: 0x0130, iatRva: RDATA_RVA + 0x0078 },
    { name: 'CreateProcessW', hintOff: 0x0150, iatRva: RDATA_RVA + 0x0080 },
    { name: 'WaitForSingleObject', hintOff: 0x0170, iatRva: RDATA_RVA + 0x0088 },
    { name: 'CloseHandle', hintOff: 0x0190, iatRva: RDATA_RVA + 0x0090 },
    { name: 'ExitProcess', hintOff: 0x01b0, iatRva: RDATA_RVA + 0x0098 }
  ];

  // Write IMAGE_IMPORT_DESCRIPTOR[0] at 0x0000
  rdataBuf.writeUInt32LE(RDATA_RVA + 0x0030, 0x0000); // OriginalFirstThunk (ILT RVA)
  rdataBuf.writeUInt32LE(0, 0x0004); // TimeDateStamp
  rdataBuf.writeUInt32LE(0, 0x0008); // ForwarderChain
  rdataBuf.writeUInt32LE(RDATA_RVA + 0x0100, 0x000c); // Name RVA ("KERNEL32.dll")
  rdataBuf.writeUInt32LE(RDATA_RVA + 0x0070, 0x0010); // FirstThunk (IAT RVA)

  // Write "KERNEL32.dll\0" at 0x0100
  rdataBuf.write('KERNEL32.dll\0', 0x0100, 'ascii');

  // Write ILT, IAT, and IMAGE_IMPORT_BY_NAME entries
  IMPORTS.forEach((imp, idx) => {
    const thunkRva = BigInt(RDATA_RVA + imp.hintOff);
    rdataBuf.writeBigUInt64LE(thunkRva, 0x0030 + idx * 8); // ILT slot
    rdataBuf.writeBigUInt64LE(thunkRva, 0x0070 + idx * 8); // IAT slot
    rdataBuf.writeUInt16LE(0, imp.hintOff); // Hint = 0
    rdataBuf.write(`${imp.name}\0`, imp.hintOff + 2, 'ascii');
  });

  // Write L"LOCAL_DESK_EXE_PATH\0" at 0x0200 (RVA 0x2200)
  const envNameUtf16 = Buffer.from('LOCAL_DESK_EXE_PATH\0', 'utf16le');
  envNameUtf16.copy(rdataBuf, 0x0200);

  // Initialize STARTUPINFOW at 0x0240 (RVA 0x2240)
  // cb = 104 (0x68) at +0x00; dwFlags = STARTF_USESHOWWINDOW (1) at +0x3C; wShowWindow = SW_HIDE (0) at +0x40
  rdataBuf.writeUInt32LE(104, 0x0240 + 0x00);
  rdataBuf.writeUInt32LE(1, 0x0240 + 0x3c);
  rdataBuf.writeUInt16LE(0, 0x0240 + 0x40);

  // Write UTF-16LE commandLine at 0x0300 (RVA 0x2300)
  const cmdUtf16 = Buffer.from(`${options.commandLine}\0`, 'utf16le');
  if (cmdUtf16.byteLength > 0x0f80) {
    throw new Error(`Command line exceeds 4000 bytes UTF-16LE (${cmdUtf16.byteLength}B)`);
  }
  cmdUtf16.copy(rdataBuf, 0x0300);

  const ENV_NAME_RVA = RDATA_RVA + 0x0200;
  const STARTUP_INFO_RVA = RDATA_RVA + 0x0240;
  const PROC_INFO_RVA = RDATA_RVA + 0x02b0;
  const PROC_THREAD_RVA = RDATA_RVA + 0x02b8;
  const CMD_LINE_RVA = RDATA_RVA + 0x0300;
  const EXE_PATH_BUF_RVA = RDATA_RVA + 0x1300;

  // ==========================================================================
  // 2. Build .text Section (x86-64 Machine Code at RVA 0x1000)
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

  // Helper for RIP-relative 7-byte instruction: [REX=0x48, opcode, modrm, disp32]
  const emitRip7 = (opcode: number, modrm: number, targetRva: number) => {
    const nextInstructionRva = TEXT_RVA + pc + 7;
    const disp32 = targetRva - nextInstructionRva;
    emitBytes([0x48, opcode, modrm]);
    emitU32(disp32);
  };

  // Helper for RIP-relative 6-byte call: [0xFF, 0x15, disp32]
  const emitCallRip = (iatRva: number) => {
    const nextInstructionRva = TEXT_RVA + pc + 6;
    const disp32 = iatRva - nextInstructionRva;
    emitBytes([0xff, 0x15]);
    emitU32(disp32);
  };

  // 1) Prologue: sub rsp, 0x58 (aligns RSP to 16-byte boundary and allocates shadow + 10-arg stack frame)
  emitBytes([0x48, 0x83, 0xec, 0x58]);

  // 2) GetModuleFileNameW(NULL, &exePathBuf, 4090)
  emitBytes([0x31, 0xc9]); // xor ecx, ecx
  emitRip7(0x8d, 0x15, EXE_PATH_BUF_RVA); // lea rdx, [rip + disp32] (&exePathBuf)
  emitBytes([0x41, 0xb8, 0xfa, 0x0f, 0x00, 0x00]); // mov r8d, 4090
  emitCallRip(IMPORTS[0].iatRva); // call GetModuleFileNameW

  // 3) SetEnvironmentVariableW(L"LOCAL_DESK_EXE_PATH", &exePathBuf)
  emitRip7(0x8d, 0x0d, ENV_NAME_RVA); // lea rcx, [rip + disp32] (L"LOCAL_DESK_EXE_PATH")
  emitRip7(0x8d, 0x15, EXE_PATH_BUF_RVA); // lea rdx, [rip + disp32] (&exePathBuf)
  emitCallRip(IMPORTS[1].iatRva); // call SetEnvironmentVariableW

  // 4) CreateProcessW(NULL, &cmdLineBuf, NULL, NULL, FALSE, CREATE_NO_WINDOW, NULL, NULL, &startupInfo, &procInfo)
  emitBytes([0x31, 0xc9]); // xor ecx, ecx (lpApplicationName = NULL)
  emitRip7(0x8d, 0x15, CMD_LINE_RVA); // lea rdx, [rip + disp32] (lpCommandLine = &cmdLineBuf)
  emitBytes([0x45, 0x31, 0xc0]); // xor r8d, r8d (lpProcessAttributes = NULL)
  emitBytes([0x45, 0x31, 0xc9]); // xor r9d, r9d (lpThreadAttributes = NULL)
  emitBytes([0xc7, 0x44, 0x24, 0x20, 0x00, 0x00, 0x00, 0x00]); // mov dword ptr [rsp+0x20], 0 (bInheritHandles = FALSE)
  emitBytes([0xc7, 0x44, 0x24, 0x28, 0x00, 0x00, 0x00, 0x08]); // mov dword ptr [rsp+0x28], 0x08000000 (CREATE_NO_WINDOW)
  emitBytes([0x48, 0xc7, 0x44, 0x24, 0x30, 0x00, 0x00, 0x00, 0x00]); // mov qword ptr [rsp+0x30], 0 (lpEnvironment = NULL)
  emitBytes([0x48, 0xc7, 0x44, 0x24, 0x38, 0x00, 0x00, 0x00, 0x00]); // mov qword ptr [rsp+0x38], 0 (lpCurrentDirectory = NULL)
  emitRip7(0x8d, 0x05, STARTUP_INFO_RVA); // lea rax, [rip + disp32] (&startupInfo)
  emitBytes([0x48, 0x89, 0x44, 0x24, 0x40]); // mov qword ptr [rsp+0x40], rax
  emitRip7(0x8d, 0x05, PROC_INFO_RVA); // lea rax, [rip + disp32] (&procInfo)
  emitBytes([0x48, 0x89, 0x44, 0x24, 0x48]); // mov qword ptr [rsp+0x48], rax
  emitCallRip(IMPORTS[2].iatRva); // call CreateProcessW

  // 5) Check return value (eax != 0)
  emitBytes([0x85, 0xc0]); // test eax, eax
  emitBytes([0x74, 0x2c]); // jz +0x2C (skips 44 bytes to ExitProcess)

  // WaitForSingleObject(procInfo.hProcess, waitForChildMs) (7 + 5 + 6 = 18 bytes)
  emitRip7(0x8b, 0x0d, PROC_INFO_RVA); // mov rcx, qword ptr [rip + disp32] (hProcess)
  emitBytes([0xba]); // mov edx, imm32
  emitU32(options.waitForChildMs);
  emitCallRip(IMPORTS[3].iatRva); // call WaitForSingleObject

  // CloseHandle(procInfo.hProcess) (7 + 6 = 13 bytes)
  emitRip7(0x8b, 0x0d, PROC_INFO_RVA); // mov rcx, qword ptr [rip + disp32] (hProcess)
  emitCallRip(IMPORTS[4].iatRva); // call CloseHandle

  // CloseHandle(procInfo.hThread) (7 + 6 = 13 bytes)
  emitRip7(0x8b, 0x0d, PROC_THREAD_RVA); // mov rcx, qword ptr [rip + disp32] (hThread)
  emitCallRip(IMPORTS[4].iatRva); // call CloseHandle

  // 6) ExitProcess(0)
  emitBytes([0x31, 0xc9]); // xor ecx, ecx
  emitCallRip(IMPORTS[5].iatRva); // call ExitProcess
  emitBytes([0xcc]); // int3

  const textVirtualSize = pc;

  // ==========================================================================
  // 3. Build .rsrc Section (Icon + GroupIcon + Win32 Manifest at RVA 0x6000)
  // ==========================================================================
  const rsrcVirtualBuf = buildResourceSection(options.icoBuffer, RSRC_RVA);
  const rsrcRawSize = alignUp(rsrcVirtualBuf.byteLength, FILE_ALIGNMENT);
  const rsrcRawBuf = Buffer.alloc(rsrcRawSize);
  rsrcVirtualBuf.copy(rsrcRawBuf, 0);

  // ==========================================================================
  // 4. Build DOS Header + PE32+ NT Headers + Section Headers (0x00..0x3FF)
  // ==========================================================================
  const headersBuf = Buffer.alloc(HEADERS_RAW_SIZE);

  // 4.1 IMAGE_DOS_HEADER (0x00..0x3F)
  headersBuf.writeUInt16LE(0x5a4d, 0x00); // e_magic = "MZ"
  headersBuf.writeUInt16LE(0x0090, 0x02); // e_cblp
  headersBuf.writeUInt16LE(0x0003, 0x04); // e_cp
  headersBuf.writeUInt16LE(0x0004, 0x08); // e_cparhdr
  headersBuf.writeUInt16LE(0xffff, 0x0c); // e_maxalloc
  headersBuf.writeUInt16LE(0x00b8, 0x10); // e_sp
  headersBuf.writeUInt16LE(0x0040, 0x18); // e_lfarlc
  headersBuf.writeUInt32LE(0x00000080, 0x3c); // e_lfanew = 0x80

  // Standard 16-bit DOS Stub at 0x40..0x7F
  const dosStubHex =
    '0e1fba0e00b409cd21b8014ccd21546869732070726f6772616d2063616e6e6f742062652072756e20696e20444f53206d6f64652e0d0d0a2400000000000000';
  Buffer.from(dosStubHex, 'hex').copy(headersBuf, 0x40);

  // 4.2 IMAGE_NT_HEADERS64 at 0x80
  const ntOff = 0x80;
  headersBuf.writeUInt32LE(0x00004550, ntOff + 0x00); // Signature = "PE\0\0"

  // IMAGE_FILE_HEADER (20 bytes at 0x84..0x97)
  const fhOff = ntOff + 0x04;
  headersBuf.writeUInt16LE(0x8664, fhOff + 0x00); // Machine = IMAGE_FILE_MACHINE_AMD64 (x64)
  headersBuf.writeUInt16LE(3, fhOff + 0x02); // NumberOfSections = 3 (.text, .rdata, .rsrc)
  headersBuf.writeUInt32LE(1730678400, fhOff + 0x04); // Deterministic TimeDateStamp
  headersBuf.writeUInt32LE(0, fhOff + 0x08); // PointerToSymbolTable = 0
  headersBuf.writeUInt32LE(0, fhOff + 0x0c); // NumberOfSymbols = 0
  headersBuf.writeUInt16LE(0x00f0, fhOff + 0x10); // SizeOfOptionalHeader = 240 (PE32+)
  headersBuf.writeUInt16LE(0x0022, fhOff + 0x12); // Characteristics = EXECUTABLE_IMAGE | LARGE_ADDRESS_AWARE

  // IMAGE_OPTIONAL_HEADER64 (240 bytes at 0x98..0x187)
  const optOff = ntOff + 0x18;
  const totalSizeOfImage = alignUp(RSRC_RVA + rsrcVirtualBuf.byteLength, SECTION_ALIGNMENT);

  headersBuf.writeUInt16LE(0x020b, optOff + 0x00); // Magic = PE32+ (64-bit)
  headersBuf.writeUInt8(14, optOff + 0x02); // MajorLinkerVersion
  headersBuf.writeUInt8(0, optOff + 0x03); // MinorLinkerVersion
  headersBuf.writeUInt32LE(textRawBuf.byteLength, optOff + 0x04); // SizeOfCode
  headersBuf.writeUInt32LE(rdataBuf.byteLength + rsrcRawBuf.byteLength, optOff + 0x08); // SizeOfInitializedData
  headersBuf.writeUInt32LE(0, optOff + 0x0c); // SizeOfUninitializedData
  headersBuf.writeUInt32LE(TEXT_RVA, optOff + 0x10); // AddressOfEntryPoint = 0x1000
  headersBuf.writeUInt32LE(TEXT_RVA, optOff + 0x14); // BaseOfCode = 0x1000
  headersBuf.writeBigUInt64LE(0x0000000140000000n, optOff + 0x18); // ImageBase
  headersBuf.writeUInt32LE(SECTION_ALIGNMENT, optOff + 0x20); // SectionAlignment = 0x1000
  headersBuf.writeUInt32LE(FILE_ALIGNMENT, optOff + 0x24); // FileAlignment = 0x200
  headersBuf.writeUInt16LE(6, optOff + 0x28); // MajorOperatingSystemVersion = 6
  headersBuf.writeUInt16LE(0, optOff + 0x2a); // MinorOperatingSystemVersion = 0
  headersBuf.writeUInt16LE(1, optOff + 0x2c); // MajorImageVersion = 1
  headersBuf.writeUInt16LE(0, optOff + 0x2e); // MinorImageVersion = 0
  headersBuf.writeUInt16LE(6, optOff + 0x30); // MajorSubsystemVersion = 6 (Windows Vista/7/10/11 x64)
  headersBuf.writeUInt16LE(0, optOff + 0x32); // MinorSubsystemVersion = 0
  headersBuf.writeUInt32LE(0, optOff + 0x34); // Win32VersionValue = 0
  headersBuf.writeUInt32LE(totalSizeOfImage, optOff + 0x38); // SizeOfImage
  headersBuf.writeUInt32LE(HEADERS_RAW_SIZE, optOff + 0x3c); // SizeOfHeaders = 0x400
  headersBuf.writeUInt32LE(0, optOff + 0x40); // CheckSum (computed below)
  headersBuf.writeUInt16LE(2, optOff + 0x44); // Subsystem = IMAGE_SUBSYSTEM_WINDOWS_GUI (2)
  headersBuf.writeUInt16LE(0x0100, optOff + 0x46); // DllCharacteristics = IMAGE_DLLCHARACTERISTICS_NX_COMPAT
  headersBuf.writeBigUInt64LE(0x0000000000100000n, optOff + 0x48); // SizeOfStackReserve = 1 MB
  headersBuf.writeBigUInt64LE(0x0000000000004000n, optOff + 0x50); // SizeOfStackCommit = 16 KB
  headersBuf.writeBigUInt64LE(0x0000000000100000n, optOff + 0x58); // SizeOfHeapReserve = 1 MB
  headersBuf.writeBigUInt64LE(0x0000000000001000n, optOff + 0x60); // SizeOfHeapCommit = 4 KB
  headersBuf.writeUInt32LE(0, optOff + 0x68); // LoaderFlags = 0
  headersBuf.writeUInt32LE(16, optOff + 0x6c); // NumberOfRvaAndSizes = 16

  // Data Directories (start at optOff + 0x70 = 0x108)
  const ddOff = optOff + 0x70;
  // DataDirectory[1]: Import Table (RVA 0x2000, Size 40 bytes)
  headersBuf.writeUInt32LE(RDATA_RVA, ddOff + 1 * 8 + 0);
  headersBuf.writeUInt32LE(40, ddOff + 1 * 8 + 4);
  // DataDirectory[2]: Resource Table (RVA 0x6000, Size rsrcVirtualBuf.byteLength)
  headersBuf.writeUInt32LE(RSRC_RVA, ddOff + 2 * 8 + 0);
  headersBuf.writeUInt32LE(rsrcVirtualBuf.byteLength, ddOff + 2 * 8 + 4);
  // DataDirectory[12]: IAT (RVA 0x2070, Size 56 bytes)
  headersBuf.writeUInt32LE(RDATA_RVA + 0x0070, ddOff + 12 * 8 + 0);
  headersBuf.writeUInt32LE(56, ddOff + 12 * 8 + 4);

  // 4.3 Section Headers (3 * 40 bytes starting at 0x188)
  const secOff = optOff + 0xf0; // 0x188
  const textRawPtr = HEADERS_RAW_SIZE; // 0x400
  const rdataRawPtr = textRawPtr + textRawBuf.byteLength; // 0x600
  const rsrcRawPtr = rdataRawPtr + rdataBuf.byteLength; // 0x4600

  // Section 0: .text
  headersBuf.write('.text\0\0\0', secOff + 0, 'ascii');
  headersBuf.writeUInt32LE(textVirtualSize, secOff + 8); // VirtualSize
  headersBuf.writeUInt32LE(TEXT_RVA, secOff + 12); // VirtualAddress = 0x1000
  headersBuf.writeUInt32LE(textRawBuf.byteLength, secOff + 16); // SizeOfRawData = 0x200
  headersBuf.writeUInt32LE(textRawPtr, secOff + 20); // PointerToRawData = 0x400
  headersBuf.writeUInt32LE(0x60000020, secOff + 36); // Characteristics = CODE | EXECUTE | READ

  // Section 1: .rdata (Read + Write initialized data & IAT)
  const sec1Off = secOff + 40;
  headersBuf.write('.rdata\0\0', sec1Off + 0, 'ascii');
  headersBuf.writeUInt32LE(RDATA_VIRTUAL_SIZE, sec1Off + 8); // VirtualSize = 0x4000
  headersBuf.writeUInt32LE(RDATA_RVA, sec1Off + 12); // VirtualAddress = 0x2000
  headersBuf.writeUInt32LE(rdataBuf.byteLength, sec1Off + 16); // SizeOfRawData = 0x4000
  headersBuf.writeUInt32LE(rdataRawPtr, sec1Off + 20); // PointerToRawData = 0x600
  headersBuf.writeUInt32LE(0xc0000040, sec1Off + 36); // Characteristics = INITIALIZED_DATA | READ | WRITE

  // Section 2: .rsrc (Read-only resources: Icon + Manifest)
  const sec2Off = secOff + 80;
  headersBuf.write('.rsrc\0\0\0', sec2Off + 0, 'ascii');
  headersBuf.writeUInt32LE(rsrcVirtualBuf.byteLength, sec2Off + 8); // VirtualSize
  headersBuf.writeUInt32LE(RSRC_RVA, sec2Off + 12); // VirtualAddress = 0x6000
  headersBuf.writeUInt32LE(rsrcRawBuf.byteLength, sec2Off + 16); // SizeOfRawData
  headersBuf.writeUInt32LE(rsrcRawPtr, sec2Off + 20); // PointerToRawData = 0x4600
  headersBuf.writeUInt32LE(0x40000040, sec2Off + 36); // Characteristics = INITIALIZED_DATA | READ

  // Combine PE sections
  let basePeBuf = Buffer.concat([headersBuf, textRawBuf, rdataBuf, rsrcRawBuf]);

  if (options.padToSize && options.padToSize > basePeBuf.byteLength) {
    const pad = Buffer.alloc(options.padToSize - basePeBuf.byteLength);
    basePeBuf = Buffer.concat([basePeBuf, pad]);
  }

  const finalBuf = options.overlayPayload
    ? Buffer.concat([basePeBuf, options.overlayPayload])
    : basePeBuf;

  // Compute and write valid PE CheckSum at optOff + 0x40 (0xD8)
  const checksum = computePeChecksum(finalBuf, optOff + 0x40);
  finalBuf.writeUInt32LE(checksum, optOff + 0x40);

  return finalBuf;
}
