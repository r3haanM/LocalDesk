import { PdfToolDefinition, ToolCategory } from '../types/pdf';

export const CATEGORY_METADATA: Record<ToolCategory, { label: string; description: string }> = {
  'edit-pdf': {
    label: 'Edit & Object Studio',
    description: 'Modify native text streams, hide or permanently remove PDF objects, annotate, sign, and watermark.'
  },
  'organize-pdf': {
    label: 'Organize & Reorder',
    description: 'Merge multiple files, split ranges, and visually reorder, rotate, extract, or delete pages.'
  },
  'convert-to-pdf': {
    label: 'Convert to PDF',
    description: 'Transform Microsoft Word documents into archival PDFs with optional one-go password protection.'
  },
  'convert-from-pdf': {
    label: 'Convert from PDF',
    description: 'Export PDFs into editable Microsoft Word (.docx) documents while preserving paragraph flow.'
  },
  'optimize-pdf': {
    label: 'Compress & Batch Queue',
    description: 'Shrink PDF byte size or run multi-file batch operations across PDFs and Word documents at once.'
  },
  'pdf-security': {
    label: 'Security & Redaction',
    description: 'Permanently redact sensitive streams, apply password locks, or unlock multiple PDFs in one go.'
  },
  'advanced-utilities': {
    label: 'Inspection & OCR',
    description: 'Optical character recognition and structural stream inspection.'
  }
};

export const PDF_TOOLS_CATALOG: PdfToolDefinition[] = [
  // ========================
  // 1 & 2. EDIT & OBJECT STUDIO
  // ========================
  {
    id: 'edit-pdf',
    name: 'Professional PDF Editor',
    shortName: 'PDF Editor',
    category: 'edit-pdf',
    categoryLabel: 'Edit & Object Studio',
    description: 'Complete 2D PDF studio: edit native text, insert text & images, spring-drag reorder pages, fill forms, and sign.',
    acceptedTypes: ['application/pdf'],
    acceptedExtensions: ['.pdf'],
    multipleFiles: false,
    outputExtension: '.pdf',
    outputMimeType: 'application/pdf',
    workspaceType: 'editor',
    keywords: ['edit', 'modify', 'text', 'editor', 'studio', 'canvas', 'forms', 'layers', 'sign', 'annotate'],
    popular: true,
    featuredInBento: true,
    iconName: 'FileEdit'
  },
  {
    id: 'remove-objects',
    name: 'Hide & Remove PDF Objects',
    shortName: 'Object Manager',
    category: 'edit-pdf',
    categoryLabel: 'Edit & Object Studio',
    description: 'Sajda-style object inspector: select, isolate, toggle visibility, or permanently remove text runs, images, and vectors.',
    acceptedTypes: ['application/pdf'],
    acceptedExtensions: ['.pdf'],
    multipleFiles: false,
    outputExtension: '.pdf',
    outputMimeType: 'application/pdf',
    workspaceType: 'editor',
    keywords: ['object', 'hide', 'remove', 'delete', 'layer', 'sajda', 'vector', 'xobject', 'clean', 'visibility'],
    popular: true,
    featuredInBento: true,
    iconName: 'Layers'
  },

  // ========================
  // 3, 4 & 5. ORGANIZE & REORDER
  // ========================
  {
    id: 'merge-pdf',
    name: 'Merge PDF Files',
    shortName: 'Merge PDF',
    category: 'organize-pdf',
    categoryLabel: 'Organize & Reorder',
    description: 'Combine multiple PDF documents into a single unified file in your exact preferred sequence.',
    acceptedTypes: ['application/pdf'],
    acceptedExtensions: ['.pdf'],
    multipleFiles: true,
    outputExtension: '.pdf',
    outputMimeType: 'application/pdf',
    workspaceType: 'organizer',
    keywords: ['merge', 'combine', 'join', 'concat', 'bind', 'multiple pdfs'],
    popular: true,
    featuredInBento: true,
    iconName: 'Files'
  },
  {
    id: 'split-pdf',
    name: 'Split PDF Document',
    shortName: 'Split PDF',
    category: 'organize-pdf',
    categoryLabel: 'Organize & Reorder',
    description: 'Separate a PDF by custom page ranges, fixed intervals, or burst every page into standalone PDF files.',
    acceptedTypes: ['application/pdf'],
    acceptedExtensions: ['.pdf'],
    multipleFiles: false,
    outputExtension: '.zip',
    outputMimeType: 'application/zip',
    workspaceType: 'organizer',
    keywords: ['split', 'separate', 'burst', 'divide', 'ranges', 'chapters'],
    popular: true,
    iconName: 'Scissors'
  },
  {
    id: 'organize-pages',
    name: 'Organize & Reorder Pages',
    shortName: 'Organize Pages',
    category: 'organize-pdf',
    categoryLabel: 'Organize & Reorder',
    description: 'Visual thumbnail studio with spring drag-and-drop to reorder, rotate, duplicate, extract, or delete pages.',
    acceptedTypes: ['application/pdf'],
    acceptedExtensions: ['.pdf'],
    multipleFiles: true,
    outputExtension: '.pdf',
    outputMimeType: 'application/pdf',
    workspaceType: 'organizer',
    keywords: ['organize', 'rearrange', 'reorder', 'rotate', 'extract', 'delete', 'sort', 'thumbnails'],
    popular: true,
    featuredInBento: true,
    iconName: 'LayoutGrid'
  },

  // ========================
  // 6 & 7. COMPRESS & BATCH QUEUE
  // ========================
  {
    id: 'compress-pdf',
    name: 'Compress PDF Size',
    shortName: 'Compress PDF',
    category: 'optimize-pdf',
    categoryLabel: 'Compress & Batch Queue',
    description: 'Reduce PDF byte size by packing object streams, removing redundant metadata, and optimizing page resources.',
    acceptedTypes: ['application/pdf'],
    acceptedExtensions: ['.pdf'],
    multipleFiles: true,
    outputExtension: '.pdf',
    outputMimeType: 'application/pdf',
    workspaceType: 'converter',
    keywords: ['compress', 'shrink', 'reduce size', 'smaller', 'optimize', 'filesize'],
    popular: true,
    iconName: 'Minimize2'
  },
  {
    id: 'batch-process',
    name: 'Batch Processing Queue',
    shortName: 'Batch Queue',
    category: 'optimize-pdf',
    categoryLabel: 'Compress & Batch Queue',
    description: 'Process multiple PDFs or Word files at once—convert & password-protect multiple Word files or unlock multiple PDFs in one go.',
    acceptedTypes: [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'text/html',
      'image/jpeg',
      'image/png'
    ],
    acceptedExtensions: ['.pdf', '.docx', '.xlsx', '.pptx', '.txt', '.html', '.jpg', '.png'],
    multipleFiles: true,
    outputExtension: '.zip',
    outputMimeType: 'application/zip',
    workspaceType: 'batch',
    keywords: ['batch', 'queue', 'multiple', 'bulk', 'simultaneous', 'password', 'word', 'unlock'],
    popular: true,
    featuredInBento: true,
    iconName: 'Layers2'
  },

  // ========================
  // 8, 9 & 10. SECURITY & REDACTION
  // ========================
  {
    id: 'protect-pdf',
    name: 'Protect & Lock PDF',
    shortName: 'Protect PDF',
    category: 'pdf-security',
    categoryLabel: 'Security & Redaction',
    description: 'Apply password access controls, permission declarations, and SHA-256 security policies to one or multiple PDFs in one go.',
    acceptedTypes: ['application/pdf'],
    acceptedExtensions: ['.pdf'],
    multipleFiles: true,
    outputExtension: '.pdf',
    outputMimeType: 'application/pdf',
    workspaceType: 'security',
    keywords: ['protect', 'password', 'encrypt', 'lock', 'security', 'permissions', 'bulk protect'],
    popular: true,
    iconName: 'Lock'
  },
  {
    id: 'unlock-pdf',
    name: 'Unlock PDF Document',
    shortName: 'Unlock PDF',
    category: 'pdf-security',
    categoryLabel: 'Security & Redaction',
    description: 'Upload one or multiple password-protected PDFs, enter the password once, and strip restrictions from all of them in one go.',
    acceptedTypes: ['application/pdf'],
    acceptedExtensions: ['.pdf'],
    multipleFiles: true,
    outputExtension: '.pdf',
    outputMimeType: 'application/pdf',
    workspaceType: 'security',
    keywords: ['unlock', 'decrypt', 'remove password', 'open protected', 'bulk unlock', 'multiple pdf password'],
    popular: true,
    iconName: 'Unlock'
  },
  {
    id: 'redact-pdf',
    name: 'Permanently Redact PDF',
    shortName: 'Redact PDF',
    category: 'pdf-security',
    categoryLabel: 'Security & Redaction',
    description: 'Genuinely purge sensitive text runs and regions from underlying page streams and metadata—never just a visual overlay.',
    acceptedTypes: ['application/pdf'],
    acceptedExtensions: ['.pdf'],
    multipleFiles: false,
    outputExtension: '.pdf',
    outputMimeType: 'application/pdf',
    workspaceType: 'editor',
    keywords: ['redact', 'blackout', 'sanitize', 'classified', 'pii', 'permanent removal', 'censor'],
    popular: true,
    featuredInBento: true,
    iconName: 'ShieldAlert'
  },

  // ========================
  // 11 & 12. WORD & PDF CONVERSION
  // ========================
  {
    id: 'word-to-pdf',
    name: 'Word to PDF',
    shortName: 'Word to PDF',
    category: 'convert-to-pdf',
    categoryLabel: 'Convert to PDF',
    description: 'Convert one or multiple Microsoft Word (.docx) files into clean PDFs—with an option to password-protect all outputs in one go.',
    acceptedTypes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'],
    acceptedExtensions: ['.docx', '.txt'],
    multipleFiles: true,
    outputExtension: '.pdf',
    outputMimeType: 'application/pdf',
    workspaceType: 'converter',
    keywords: ['word to pdf', 'docx to pdf', 'doc', 'microsoft word', 'password protect word', 'multiple word'],
    popular: true,
    iconName: 'FileText'
  },
  {
    id: 'pdf-to-word',
    name: 'PDF to Word (.docx)',
    shortName: 'PDF to Word',
    category: 'convert-from-pdf',
    categoryLabel: 'Convert from PDF',
    description: 'Extract paragraphs, headings, and text flows from PDF into a genuine editable Microsoft Word (.docx) document.',
    acceptedTypes: ['application/pdf'],
    acceptedExtensions: ['.pdf'],
    multipleFiles: true,
    outputExtension: '.docx',
    outputMimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    workspaceType: 'converter',
    keywords: ['pdf to word', 'pdf to docx', 'export word', 'editable docx'],
    popular: true,
    iconName: 'FileType2'
  }
];

const LEGACY_TOOL_ALIASES: Record<string, string> = {
  'reorder-pages': 'organize-pages',
  'rotate-pages': 'organize-pages',
  'delete-pages': 'organize-pages',
  'extract-pages': 'organize-pages',
  'annotate-pdf': 'edit-pdf',
  'sign-pdf': 'edit-pdf',
  'watermark-pdf': 'edit-pdf',
  'remove-metadata': 'redact-pdf'
};

export function findToolById(id: string): PdfToolDefinition | undefined {
  const direct = PDF_TOOLS_CATALOG.find((t) => t.id === id);
  if (direct) return direct;
  const mappedId = LEGACY_TOOL_ALIASES[id];
  if (mappedId) return PDF_TOOLS_CATALOG.find((t) => t.id === mappedId);
  return PDF_TOOLS_CATALOG[0];
}
