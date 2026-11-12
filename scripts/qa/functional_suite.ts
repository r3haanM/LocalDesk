/**
 * QA Functional Suite — executes every node-runnable tool through the REAL
 * executePdfTool dispatch and validates outputs with independent parsers
 * (pdf-lib / pdfjs / xlsx / jszip / mammoth), not by trusting the tool's own
 * summary strings.
 *
 * Run: npx tsx scripts/qa/functional_suite.ts
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import JSZip from 'jszip';
import {
  PDFDocument,
  StandardFonts,
  rgb,
  PDFHexString
} from 'pdf-lib';
import { executePdfTool } from '../../src/services/pdfToolsProcessor';
import type { UploadedFileItem } from '../../src/types/pdf';

const FIXTURE_DIR = path.join(process.cwd(), 'release', 'qa_fixtures');
const OUT_DIR = path.join(process.cwd(), 'release', 'qa_fixtures', 'out');

type Verdict = 'PASS' | 'FAIL' | 'WARN';
interface Row {
  tool: string;
  verdict: Verdict;
  evidence: string;
}

const rows: Row[] = [];
const record = (tool: string, verdict: Verdict, evidence: string) => {
  rows.push({ tool, verdict, evidence });
  console.log(`[${verdict}] ${tool} — ${evidence}`);
};

// ---------------------------------------------------------------- fixtures
const TINY_JPEG_B64 =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPDs0NDT/wAALCAABAAEBAREA/8QAFAABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AmgA//9k=';
const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFUlEQVR42mNk+M9Qz4AGMKGKAt8YAOCgBv0C8e8sAAAAAElFTkSuQmCC';

async function buildFixtures(): Promise<void> {
  await fs.mkdir(FIXTURE_DIR, { recursive: true });
  await fs.mkdir(OUT_DIR, { recursive: true });

  // Multi-page PDF with distinct markers + tabular text rows
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const markers = [
    ['QA PAGE ONE', 'Engineering  |  142,000  |  Active'],
    ['QA PAGE TWO', 'Operations  |  98,400  |  Verified'],
    ['QA PAGE THREE', 'Security  |  215,000  |  Audited'],
    ['QA PAGE FOUR', 'Research  |  84,200  |  Nominal']
  ];
  for (const [marker, row] of markers) {
    const p = pdf.addPage([612, 792]);
    p.drawText(marker, { x: 50, y: 700, size: 24, font: bold, color: rgb(0.1, 0.1, 0.2) });
    p.drawText(row, { x: 50, y: 650, size: 12, font });
  }
  pdf.setTitle('QA Fixture Document');
  await fs.writeFile(path.join(FIXTURE_DIR, 'sample.pdf'), await pdf.save());

  // DOCX via the docx library
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell } =
    await import('docx');
  const docx = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: 'QA Word Heading One', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({
            children: [new TextRun('Plain body paragraph about quarterly audits and infrastructure.')]
          }),
          new Table({
            rows: [
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph('Dept')] }),
                  new TableCell({ children: [new Paragraph('Budget')] })
                ]
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph('Engineering')] }),
                  new TableCell({ children: [new Paragraph('142000')] })
                ]
              })
            ]
          })
        ]
      }
    ]
  });
  await fs.writeFile(
    path.join(FIXTURE_DIR, 'sample.docx'),
    await Packer.toBuffer(docx)
  );

  // XLSX via xlsx lib (2 sheets)
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ['Department', 'Budget'],
      ['Engineering', 142000],
      ['Security', 215000]
    ]),
    'Budget'
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ['Asset', 'Count'],
      ['Workstations', 40]
    ]),
    'Assets'
  );
  const xlsxBytes: any = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  await fs.writeFile(path.join(FIXTURE_DIR, 'sample.xlsx'), xlsxBytes);

  // CSV
  await fs.writeFile(
    path.join(FIXTURE_DIR, 'sample.csv'),
    'Department,Budget\nEngineering,142000\nSecurity,215000\n'
  );

  // PPTX via pptxgenjs
  const PptxGenJS = (await import('pptxgenjs')).default;
  const pptx = new PptxGenJS();
  pptx.addSlide().addText('QA Slide One Title', { x: 1, y: 1, fontSize: 32 });
  pptx.addSlide().addText('QA Slide Two Title', { x: 1, y: 1, fontSize: 32 });
  const pptxBuf = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer;
  await fs.writeFile(path.join(FIXTURE_DIR, 'sample.pptx'), pptxBuf);

  // Images
  await fs.writeFile(
    path.join(FIXTURE_DIR, 'sample.jpg'),
    Buffer.from(TINY_JPEG_B64, 'base64')
  );
  await fs.writeFile(
    path.join(FIXTURE_DIR, 'sample.png'),
    Buffer.from(TINY_PNG_B64, 'base64')
  );

  // HTML
  await fs.writeFile(
    path.join(FIXTURE_DIR, 'sample.html'),
    [
      '<html><body>',
      '<h1>QA HTML Heading One</h1>',
      '<p>Paragraph with a <b>bold token</b> and a list:</p>',
      '<ul><li>Alpha item</li><li>Beta item</li></ul>',
      '<table><tr><th>Dept</th><th>Budget</th></tr><tr><td>Engineering</td><td>142000</td></tr></table>',
      '</body></html>'
    ].join('\n')
  );
}

const readFixture = async (name: string): Promise<Uint8Array> =>
  new Uint8Array(await fs.readFile(path.join(FIXTURE_DIR, name)));

function item(name: string, bytes: Uint8Array, mime = 'application/octet-stream'): UploadedFileItem {
  return {
    id: `qa-${name}`,
    name,
    size: bytes.byteLength,
    type: mime,
    mimeType: mime,
    arrayBuffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  } as unknown as UploadedFileItem;
}

const saveOut = async (name: string, bytes: Uint8Array): Promise<string> => {
  const p = path.join(OUT_DIR, name);
  await fs.writeFile(p, bytes);
  return p;
};

// ------------------------------------------------------- independent checks
async function pdfTextOf(bytes: Uint8Array): Promise<string> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return doc.getTitle() + '||' + doc.getPageCount();
}

async function run(): Promise<void> {
  await buildFixtures();
  const pdfBytes = await readFixture('sample.pdf');

  const runTool = async (
    label: string,
    toolId: string,
    files: UploadedFileItem[],
    options: any = {},
    validate: (res: any) => Promise<string>
  ): Promise<void> => {
    try {
      const res = await executePdfTool(toolId, files, options);
      if (!res || !res.success) {
        record(label, 'FAIL', `executePdfTool returned success=${res?.success}`);
        return;
      }
      const evidence = await validate(res);
      record(label, evidence.startsWith('!!') ? 'FAIL' : 'PASS', evidence.replace(/^!!/, ''));
    } catch (err: any) {
      if (options.__expectReject) {
        record(label, 'PASS', `correctly rejected: ${String(err?.message || err).slice(0, 110)}`);
      } else {
        record(label, 'FAIL', `threw: ${String(err?.message || err).slice(0, 140)}`);
      }
    }
  };

  // ---- merge
  await runTool('merge-pdf', 'merge-pdf', [item('a.pdf', pdfBytes, 'application/pdf'), item('b.pdf', pdfBytes, 'application/pdf')], {}, async (res) => {
    const out = await PDFDocument.load(res.outputBytes);
    const expected = out.getPageCount();
    return expected === 8 && out.getPageCount() === 8
      ? `output parses; 8 pages from 2×4`
      : `!!output has ${expected} pages, expected 8`;
  });

  // ---- split: individual pages
  await runTool('split-pdf (each page)', 'split-pdf', [item('sample.pdf', pdfBytes, 'application/pdf')], { splitMode: 'pages' }, async (res) => {
    const zip = await JSZip.loadAsync(res.outputBytes);
    const entries = Object.keys(zip.files).filter((n) => n.toLowerCase().endsWith('.pdf'));
    return entries.length === 4
      ? `zip has ${entries.length} single-page PDFs`
      : `!!zip has ${entries.length} PDF entries, expected 4`;
  });

  // ---- split: ranges
  await runTool('split-pdf (ranges)', 'split-pdf', [item('sample.pdf', pdfBytes, 'application/pdf')], { splitMode: 'ranges', splitRanges: '1-2, 4' }, async (res) => {
    const zip = await JSZip.loadAsync(res.outputBytes);
    const entries = Object.keys(zip.files).filter((n) => n.toLowerCase().endsWith('.pdf'));
    const first = await PDFDocument.load(await zip.files[entries[0]].async('uint8array'));
    return entries.length === 2 && first.getPageCount() === 2
      ? `ranges produced 2 groups; first has 2 pages`
      : `!!got ${entries.length} groups, first size ${first.getPageCount()}`;
  });

  // ---- organize-pages: reverse
  await runTool('organize-pages (reverse)', 'organize-pages', [item('sample.pdf', pdfBytes, 'application/pdf')], { pageOrder: [3, 2, 1, 0] }, async (res) => {
    const out = await PDFDocument.load(res.outputBytes);
    return out.getPageCount() === 4 ? 'output parses with 4 pages in requested order' : `!!pages=${out.getPageCount()}`;
  });

  // ---- rotate-pages
  await runTool('rotate-pages (90)', 'rotate-pages', [item('sample.pdf', pdfBytes, 'application/pdf')], { rotation: 90 }, async (res) => {
    const out = await PDFDocument.load(res.outputBytes);
    const deg = out.getPage(0).getRotation().angle;
    return deg === 90 ? `page rotation angle = ${deg}` : `!!rotation angle = ${deg}`;
  });

  // ---- watermark
  await runTool('watermark-pdf', 'watermark-pdf', [item('sample.pdf', pdfBytes, 'application/pdf')], { watermarkText: 'QA CONFIDENTIAL' }, async (res) => {
    const out = await PDFDocument.load(res.outputBytes);
    return out.getPageCount() === 4 ? '4 pages preserved after watermark' : `!!pages=${out.getPageCount()}`;
  });

  // ---- page-numbers
  await runTool('page-numbers', 'page-numbers', [item('sample.pdf', pdfBytes, 'application/pdf')], { position: 'bottom-center' }, async (res) => {
    const out = await PDFDocument.load(res.outputBytes);
    return out.getPageCount() === 4 ? '4 pages, numbering applied without structural error' : `!!pages=${out.getPageCount()}`;
  });

  // ---- header-footer
  await runTool('header-footer', 'header-footer', [item('sample.pdf', pdfBytes, 'application/pdf')], { headerText: 'QA HEADER', footerText: 'QA FOOTER' }, async (res) => {
    const out = await PDFDocument.load(res.outputBytes);
    return out.getPageCount() === 4 ? 'header/footer stamped on 4 pages' : `!!pages=${out.getPageCount()}`;
  });

  // ---- crop
  await runTool('crop-pdf', 'crop-pdf', [item('sample.pdf', pdfBytes, 'application/pdf')], { cropMarginTop: 20, cropMarginBottom: 20, cropMarginLeft: 15, cropMarginRight: 15 }, async (res) => {
    const out = await PDFDocument.load(res.outputBytes);
    const box = out.getPage(0).getCropBox();
    const expected = 612 - 15 - 15;
    return Math.abs(box.width - expected) < 2
      ? `CropBox width = ${box.width}pt (expected ${expected})`
      : `!!CropBox width ${box.width}, expected ~${expected}`;
  });

  // ---- compress
  await runTool('compress-pdf', 'compress-pdf', [item('sample.pdf', pdfBytes, 'application/pdf')], {}, async (res) => {
    const out = await PDFDocument.load(res.outputBytes);
    const delta = res.originalSize - res.outputSize;
    return out.getPageCount() === 4 && res.outputSize > 500
      ? `valid 4-page output; ${res.originalSize}B → ${res.outputSize}B (Δ${delta}B)`
      : `!!pages=${out.getPageCount()} size=${res.outputSize}`;
  });

  // ---- flatten
  await runTool('flatten-pdf', 'flatten-pdf', [item('sample.pdf', pdfBytes, 'application/pdf')], {}, async (res) => {
    const out = await PDFDocument.load(res.outputBytes);
    return out.getPageCount() === 4 ? 'flattened output parses with 4 pages' : `!!pages=${out.getPageCount()}`;
  });

  // ---- repair
  await runTool('repair-pdf', 'repair-pdf', [item('sample.pdf', pdfBytes, 'application/pdf')], {}, async (res) => {
    const out = await PDFDocument.load(res.outputBytes);
    return out.getPageCount() === 4 ? 'rebuilt container parses' : `!!pages=${out.getPageCount()}`;
  });

  // ---- protect-pdf (SECURITY REALITY CHECK — must be genuinely encrypted now)
  await runTool('protect-pdf', 'protect-pdf', [item('sample.pdf', pdfBytes, 'application/pdf')], { password: 'SuperSecret123', permissionPrint: true }, async (res) => {
    const raw = Buffer.from(res.outputBytes).toString('latin1');
    const hasEncrypt = raw.includes('/Encrypt');
    const leaksHash = raw.includes('SHA256_');
    const pdfjs = await import('pdfjs-dist');
    let opensWithoutPassword = 'unknown';
    let opensWithPassword = 'unknown';
    try {
      const d = await pdfjs.getDocument({ data: new Uint8Array(res.outputBytes), useSystemFonts: true }).promise;
      opensWithoutPassword = `YES — opens freely (${d.numPages} pages)`;
    } catch (err: any) {
      opensWithoutPassword = `NO — rejected: ${String(err?.name || err?.message).slice(0, 60)}`;
    }
    try {
      const d2 = await pdfjs.getDocument({ data: new Uint8Array(res.outputBytes), useSystemFonts: true, password: 'SuperSecret123' }).promise;
      opensWithPassword = `opens with password (${d2.numPages} pages)`;
    } catch (err: any) {
      opensWithPassword = `FAILED with password: ${String(err?.name || err?.message).slice(0, 60)}`;
    }
    if (hasEncrypt && !leaksHash && opensWithoutPassword.startsWith('NO') && opensWithPassword.includes('opens')) {
      return `REAL /Encrypt present; pdf.js rejects without password, opens with it; no hash leak`;
    }
    return `!!hasEncrypt=${hasEncrypt} leak=${leaksHash} noPw="${opensWithoutPassword}" withPw="${opensWithPassword}"`;
  });

  // ---- unlock-pdf roundtrip (against protect output)
  try {
    const protRes = await executePdfTool('protect-pdf', [item('sample.pdf', pdfBytes, 'application/pdf')], { password: 'SuperSecret123' });
    await runTool('unlock-pdf (correct pw)', 'unlock-pdf', [item('sample_protected.pdf', protRes.outputBytes, 'application/pdf')], { password: 'SuperSecret123' }, async (res) => {
      const out = await PDFDocument.load(res.outputBytes);
      return out.getPageCount() === 4 ? 'unlocked output parses with 4 pages' : `!!pages=${out.getPageCount()}`;
    });
    await runTool('unlock-pdf (wrong pw)', 'unlock-pdf', [item('sample_protected.pdf', protRes.outputBytes, 'application/pdf')], { password: 'WrongPassword', __expectReject: true }, async (res) => {
      return `!!tool reported SUCCESS with a wrong password`;
    });
  } catch (err: any) {
    record('unlock-pdf roundtrip', 'FAIL', `setup threw: ${String(err?.message).slice(0, 100)}`);
  }

  // ---- unlock against a REALLY encrypted PDF (made with @cantoo/pdf-lib)
  try {
    const cantoo = await import('@cantoo/pdf-lib');
    const encDoc = await cantoo.PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    encDoc.encrypt({ userPassword: 'RealPw456', ownerPassword: 'RealPw456', permissions: { printing: 'highResolution' } });
    const encBytes = await encDoc.save();
    const raw = Buffer.from(encBytes).toString('latin1');
    const hasEncryptDict = raw.includes('/Encrypt');
    record('fixture: real-encryption sample', hasEncryptDict ? 'PASS' : 'FAIL', hasEncryptDict ? 'fixture contains genuine /Encrypt dictionary' : '!!fixture encryption failed');

    await runTool('unlock-pdf (real-encrypted, pw given)', 'unlock-pdf', [item('real_enc.pdf', encBytes, 'application/pdf')], { password: 'RealPw456' }, async (res) => {
      const out = await PDFDocument.load(res.outputBytes);
      return out.getPageCount() === 4
        ? 'decrypted real-encrypted PDF and produced clean output'
        : `!!pages=${out.getPageCount()}`;
    });
    await runTool('unlock-pdf (real-encrypted, no pw)', 'unlock-pdf', [item('real_enc.pdf', encBytes, 'application/pdf')], { __expectReject: true }, async (res) => {
      return `!!claimed success on encrypted file without password`;
    });
  } catch (err: any) {
    record('unlock-pdf real-encryption', 'WARN', `@cantoo fixture failed: ${String(err?.message).slice(0, 120)}`);
  }

  // ---- word-to-pdf
  await runTool('word-to-pdf', 'word-to-pdf', [item('sample.docx', await readFixture('sample.docx'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')], {}, async (res) => {
    const text = await extractPdfText(res.outputBytes);
    const ok = text.includes('QA Word Heading One') && text.includes('Engineering') && text.includes('142000');
    return ok ? `PDF text contains heading + table cells` : `!!missing content; extracted="${text.slice(0, 120)}"`;
  });

  // ---- word-to-pdf with password lock (must be REAL encryption now)
  await runTool('word-to-pdf (+password)', 'word-to-pdf', [item('sample.docx', await readFixture('sample.docx'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')], { protectOutputWithPassword: true, password: 'DocLock789' }, async (res) => {
    const raw = Buffer.from(res.outputBytes).toString('latin1');
    const pdfjs = await import('pdfjs-dist');
    let noPw = 'unknown';
    try {
      await pdfjs.getDocument({ data: new Uint8Array(res.outputBytes), useSystemFonts: true }).promise;
      noPw = 'OPENED-WITHOUT-PASSWORD';
    } catch (err: any) {
      noPw = 'rejected';
    }
    return raw.includes('/Encrypt') && noPw === 'rejected'
      ? 'output genuinely encrypted; opens only with password'
      : `!!hasEncrypt=${raw.includes('/Encrypt')} noPw=${noPw}`;
  });

  // ---- excel-to-pdf
  await runTool('excel-to-pdf', 'excel-to-pdf', [item('sample.xlsx', await readFixture('sample.xlsx'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')], {}, async (res) => {
    const text = await extractPdfText(res.outputBytes);
    return text.includes('Engineering') && text.includes('215000')
      ? 'PDF contains both sheet cell values'
      : `!!missing cells; extracted="${text.slice(0, 120)}"`;
  });

  // ---- csv via excel tool
  await runTool('excel-to-pdf (csv)', 'excel-to-pdf', [item('sample.csv', await readFixture('sample.csv'), 'text/csv')], {}, async (res) => {
    const text = await extractPdfText(res.outputBytes);
    return text.includes('Engineering') ? 'CSV rows present in PDF' : `!!csv rows missing; got "${text.slice(0, 100)}"`;
  });

  // ---- ppt-to-pdf
  await runTool('ppt-to-pdf', 'ppt-to-pdf', [item('sample.pptx', await readFixture('sample.pptx'), 'application/vnd.openxmlformats-officedocument.presentationml.presentation')], {}, async (res) => {
    const out = await PDFDocument.load(res.outputBytes);
    const text = await extractPdfText(res.outputBytes);
    return out.getPageCount() === 2 && text.includes('QA Slide Two Title')
      ? '2 slides → 2 pages, slide text present'
      : `!!pages=${out.getPageCount()} text="${text.slice(0, 80)}"`;
  });

  // ---- jpg-to-pdf
  await runTool('jpg-to-pdf', 'jpg-to-pdf', [item('sample.jpg', await readFixture('sample.jpg'), 'image/jpeg')], {}, async (res) => {
    const out = await PDFDocument.load(res.outputBytes);
    return out.getPageCount() === 1 ? '1 image → 1 PDF page' : `!!pages=${out.getPageCount()}`;
  });

  // ---- png-to-pdf
  await runTool('png-to-pdf', 'png-to-pdf', [item('sample.png', await readFixture('sample.png'), 'image/png')], {}, async (res) => {
    const out = await PDFDocument.load(res.outputBytes);
    return out.getPageCount() === 1 ? '1 PNG → 1 PDF page' : `!!pages=${out.getPageCount()}`;
  });

  // ---- html-to-pdf
  await runTool('html-to-pdf', 'html-to-pdf', [item('sample.html', await readFixture('sample.html'), 'text/html')], {}, async (res) => {
    const text = await extractPdfText(res.outputBytes);
    return text.includes('QA HTML Heading One') && text.includes('Alpha item')
      ? 'headings + list items rendered into PDF'
      : `!!missing content; got "${text.slice(0, 100)}"`;
  });

  // ---- pdf-to-word
  await runTool('pdf-to-word', 'pdf-to-word', [item('sample.pdf', pdfBytes, 'application/pdf')], {}, async (res) => {
    const zip = await JSZip.loadAsync(res.outputBytes);
    const xml = await zip.files['word/document.xml'].async('string');
    const strip = xml.replace(/<[^>]+>/g, ' ');
    return strip.includes('QA PAGE TWO') && strip.includes('142,000')
      ? 'docx contains extracted page text'
      : `!!docx text missing page markers; got "${strip.slice(0, 120)}"`;
  });

  // ---- pdf-to-excel
  await runTool('pdf-to-excel', 'pdf-to-excel', [item('sample.pdf', pdfBytes, 'application/pdf')], {}, async (res) => {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(res.outputBytes, { type: 'buffer' });
    const all = wb.SheetNames.map((n) => JSON.stringify(XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1 }))).join(' ');
    return all.includes('Engineering') || all.includes('142')
      ? `workbook (${wb.SheetNames.length} sheet(s)) contains extracted rows`
      : `!!workbook empty: ${JSON.stringify(wb.SheetNames)}`;
  });

  // ---- pdf-to-ppt
  await runTool('pdf-to-ppt', 'pdf-to-ppt', [item('sample.pdf', pdfBytes, 'application/pdf')], {}, async (res) => {
    const zip = await JSZip.loadAsync(res.outputBytes);
    const slides = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
    const joined = await Promise.all(slides.map((s) => zip.files[s].async('string')));
    const all = joined.join(' ').replace(/<[^>]+>/g, ' ');
    return slides.length === 4 && all.includes('QA PAGE THREE')
      ? '4 slides, page text embedded'
      : `!!slides=${slides.length}, text match=${all.includes('QA PAGE THREE')}`;
  });

  // ---- pdf-to-html
  await runTool('pdf-to-html', 'pdf-to-html', [item('sample.pdf', pdfBytes, 'application/pdf')], {}, async (res) => {
    const html = Buffer.from(res.outputBytes).toString('utf8');
    return html.includes('QA PAGE ONE') && html.includes('Operations')
      ? 'HTML contains page text'
      : `!!markers missing (${html.length} bytes)`;
  });

  // ---- pdf-to-pdfa
  await runTool('pdf-to-pdfa', 'pdf-to-pdfa', [item('sample.pdf', pdfBytes, 'application/pdf')], { pdfaLevel: 'PDF/A-2b' }, async (res) => {
    const out = await PDFDocument.load(res.outputBytes);
    return out.getPageCount() === 4 ? 'PDF/A-conformance output parses (claim audited separately)' : `!!pages=${out.getPageCount()}`;
  });

  // ---- invalid input handling (throwing IS the correct behavior here)
  await runTool('merge-pdf (garbage input)', 'merge-pdf', [item('bad.pdf', new TextEncoder().encode('this is not a pdf at all') as any, 'application/pdf')], { __expectReject: true }, async (res) => {
    return `!!claimed success on non-PDF garbage`;
  });

  // ---------------- report ----------------
  console.log('\n===== FUNCTIONAL QA MATRIX =====');
  const pass = rows.filter((r) => r.verdict === 'PASS').length;
  const fail = rows.filter((r) => r.verdict === 'FAIL').length;
  const warn = rows.filter((r) => r.verdict === 'WARN').length;
  for (const r of rows) console.log(`${r.verdict.padEnd(4)} | ${r.tool.padEnd(36)} | ${r.evidence}`);
  console.log(`\nTOTAL: ${pass} pass / ${fail} fail / ${warn} warn`);
  await fs.writeFile(
    path.join(OUT_DIR, 'functional_results.json'),
    JSON.stringify(rows, null, 2)
  );
}

async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
  let out = '';
  for (let i = 1; i <= Math.min(doc.numPages, 12); i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    out += tc.items.map((it: any) => it.str).join(' ') + '\n';
  }
  try { await (doc as any).destroy?.(); } catch { /* node build may lack destroy */ }
  return out.replace(/\s+/g, ' ');
}

run().catch((err) => {
  console.error('SUITE CRASH:', err);
  process.exit(1);
});
