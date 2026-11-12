import * as pdfjsLib from 'pdfjs-dist';
const doc = await pdfjsLib.getDocument({ data: new TextEncoder().encode('%PDF-1.4\n') }).promise.catch(() => null);
console.log('pdfjs node import OK, getDocument result:', doc ? 'ok' : 'failed gracefully');
