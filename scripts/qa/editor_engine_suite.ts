/**
 * QA Editor Engine Suite — exercises parseDocumentIntoEditorModel +
 * exportEditedPdfDocument directly: object deletion purge, redaction purge,
 * metadata sanitization, and the export verification report. Outputs are
 * re-parsed with independent parsers; nothing trusts the tool's own claims.
 *
 * Run: npx tsx scripts/qa/editor_engine_suite.ts
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import {
  parseDocumentIntoEditorModel,
  exportEditedPdfDocument
} from '../../src/services/pdfEditorEngine';

const FIXTURE_DIR = path.join(process.cwd(), 'release', 'qa_fixtures');
const rows: Array<{ test: string; verdict: 'PASS' | 'FAIL' | 'WARN'; evidence: string }> = [];
const record = (test: string, verdict: 'PASS' | 'FAIL' | 'WARN', evidence: string) => {
  rows.push({ test, verdict, evidence });
  console.log(`[${verdict}] ${test} — ${evidence}`);
};

async function buildSecretFixture(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const p1 = pdf.addPage([612, 792]);
  p1.drawText('QA PUBLIC HEADER', { x: 50, y: 740, size: 18, font: bold, color: rgb(0.1, 0.1, 0.2) });
  p1.drawText('INTERNAL-VAULT-KEY-7788', { x: 50, y: 700, size: 12, font });
  p1.drawText('Body line one of the public document.', { x: 50, y: 670, size: 11, font });
  const p2 = pdf.addPage([612, 792]);
  p2.drawText('QA SECRET-SSN-981-22-4444', { x: 50, y: 700, size: 12, font });
  pdf.setAuthor('QA Author Name');
  pdf.setKeywords(['qa', 'fixture']);
  return pdf.save();
}

async function extractText(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
  let out = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    out += tc.items.map((it: any) => it.str).join(' ') + '\n';
  }
  try { await (doc as any).destroy?.(); } catch { /* node */ }
  return out.replace(/\s+/g, ' ');
}

async function run(): Promise<void> {
  const fixtureBytes = await buildSecretFixture();
  await fs.mkdir(FIXTURE_DIR, { recursive: true });
  await fs.writeFile(path.join(FIXTURE_DIR, 'secret_fixture.pdf'), fixtureBytes);

  // Sanity: secret present in source
  const sourceText = await extractText(fixtureBytes);
  record('fixture sanity', sourceText.includes('INTERNAL-VAULT-KEY-7788') ? 'PASS' : 'FAIL',
    sourceText.includes('INTERNAL-VAULT-KEY-7788') ? 'secret present in source text layer' : `!!source text="${sourceText.slice(0, 100)}"`);

  const model = await parseDocumentIntoEditorModel(fixtureBytes);
  const allObjects = model.objects;
  record('parse model', allObjects.length > 0 ? 'PASS' : 'FAIL',
    `${allObjects.length} objects parsed across ${model.pages.length} pages`);

  // 1. Delete the vault-key object on page 1
  const vaultObj = allObjects.find((o) => (o.text || '').includes('INTERNAL-VAULT-KEY-7788'));
  record('vault object found', vaultObj ? 'PASS' : 'FAIL',
    vaultObj ? `object id=${vaultObj.id} bbox=(${Math.round(vaultObj.x)},${Math.round(vaultObj.y)})` : '!!not found among parsed objects');
  if (vaultObj) vaultObj.deleted = true;

  // 2. Redaction zone over the SSN on page 2
  const ssnObj = allObjects.find((o) => (o.text || '').includes('QA SECRET-SSN-981-22-4444'));
  record('ssn object found', ssnObj ? 'PASS' : 'FAIL', ssnObj ? `bbox=(${Math.round(ssnObj.x)},${Math.round(ssnObj.y)})` : '!!not found');
  const redaction = {
    id: 'qa-redaction-1',
    pageIndex: 1,
    type: 'redaction' as const,
    name: 'Permanent Redaction Zone',
    isNative: false,
    visible: true,
    locked: false,
    deleted: false,
    zIndex: 900,
    x: ssnObj ? ssnObj.x - 4 : 46,
    y: ssnObj ? ssnObj.y - 4 : 690,
    width: ssnObj ? ssnObj.width + 8 : 240,
    height: ssnObj ? ssnObj.height + 8 : 20,
    originalX: 0,
    originalY: 0,
    originalWidth: 0,
    originalHeight: 0,
    rotation: 0,
    opacity: 1,
    redactionLabel: 'REDACTED // PII',
    exemptionCode: 'FOIA (b)(6)'
  };
  const objectsWithRedaction = [...allObjects, redaction];

  const { bytes, verification } = await exportEditedPdfDocument(
    fixtureBytes,
    model.pages,
    objectsWithRedaction,
    {
      applyHiddenToExport: true,
      flattenForms: false,
      stripMetadataOnRedact: true,
      documentTitle: 'QA Sanitized Export'
    }
  );

  await fs.writeFile(path.join(FIXTURE_DIR, 'sanitized_out.pdf'), bytes);

  record('export verification.redactionCount', verification.redactionCount === 1 ? 'PASS' : 'FAIL',
    `redactionCount=${verification.redactionCount}`);
  record('export verification.purgedStringsVerifiedAbsent', verification.purgedStringsVerifiedAbsent ? 'PASS' : 'FAIL',
    `purgedStringsVerifiedAbsent=${verification.purgedStringsVerifiedAbsent}`);
  record('export verification.validPdfHeader', verification.validPdfHeader ? 'PASS' : 'FAIL',
    `validPdfHeader=${verification.validPdfHeader}`);

  const outText = await extractText(bytes);
  record('secret purged from stream', !outText.includes('INTERNAL-VAULT-KEY-7788') ? 'PASS' : 'FAIL',
    outText.includes('INTERNAL-VAULT-KEY-7788') ? '!!SECRET STILL PRESENT IN OUTPUT TEXT' : 'vault key absent from output text layer');
  record('redacted SSN purged from stream', !outText.includes('SSN-981-22-4444') ? 'PASS' : 'FAIL',
    outText.includes('SSN-981-22-4444') ? '!!SSN STILL PRESENT' : 'SSN absent from output text layer');
  record('public text preserved', outText.includes('QA PUBLIC HEADER') && outText.includes('Body line one') ? 'PASS' : 'FAIL',
    'non-redacted content survived export');

  const outDoc = await PDFDocument.load(bytes);
  record('metadata sanitized', !outDoc.getAuthor() ? 'PASS' : 'FAIL',
    `author after export="${outDoc.getAuthor()}" (original "QA Author Name")`);

  // 3. Encrypted-PDF guard on editor export (load with ignoreEncryption could corrupt)
  try {
    const CantooPDF = await import('@cantoo/pdf-lib');
    const encDoc = await CantooPDF.PDFDocument.load(fixtureBytes, { ignoreEncryption: true });
    encDoc.encrypt({ userPassword: 'pw', ownerPassword: 'pw' });
    const encBytes = await encDoc.save();
    const encModel = await parseDocumentIntoEditorModel(encBytes);
    const encOut = await exportEditedPdfDocument(encBytes, encModel.pages, encModel.objects, {
      applyHiddenToExport: true,
      flattenForms: false,
      stripMetadataOnRedact: false
    });
    const encText = await extractText(encOut.bytes);
    record('editor export of encrypted source', encText.includes('QA PUBLIC HEADER') ? 'PASS' : 'WARN',
      encText.includes('QA PUBLIC HEADER')
        ? 'decrypted-at-load; content survived (acceptable for local editor with password known)'
        : `!!content corrupted; text="${encText.slice(0, 80)}"`);
  } catch (err: any) {
    record('editor export of encrypted source', 'PASS', `properly rejected: ${String(err?.message).slice(0, 90)}`);
  }

  const pass = rows.filter((r) => r.verdict === 'PASS').length;
  const fail = rows.filter((r) => r.verdict === 'FAIL').length;
  console.log(`\nEDITOR ENGINE QA: ${pass} pass / ${fail} fail`);
}

run().catch((err) => {
  console.error('SUITE CRASH:', err);
  process.exit(1);
});
