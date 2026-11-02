import { PdfToolDefinition, ToolCategory, ConversionSubcategory } from '../types/pdf';

export const CATEGORY_LABELS: Record<ToolCategory, string> = {
  'edit-pdf': 'Edit & Objects',
  'organize-pdf': 'Organize Pages',
  'optimize-pdf': 'Compress & Batch',
  'pdf-security': 'Security & Vault',
  'convert-from-pdf': 'Convert from PDF',
  'convert-to-pdf': 'Convert to PDF',
  'advanced-utilities': 'Utilities'
};

export const CONVERSION_SUBCATEGORY_LABELS: Record<ConversionSubcategory, string> = {
  'pdf-to-office': 'PDF to Office',
  'pdf-to-images-web': 'PDF to Images & Web',
  'formats-to-pdf': 'Other Formats to PDF',
  'archival': 'Archival Conversion'
};

/**
 * Complete Vellum PDF Studio Catalog:
 * - Core Studio Tools (Edit, Organize, Compress/Batch, Security)
 * - Complete 13-Tool Approved Conversion Suite:
 *   A. PDF to Office: PDF to Word (.docx), PDF to Excel (.xlsx), PDF to PowerPoint (.pptx)
 *   B. PDF to Images & Web: PDF to JPG (.jpg/.zip), PDF to PNG (.png/.zip), PDF to HTML (.html)
 *   C. Other Formats to PDF: Word to PDF, Excel to PDF, PowerPoint to PDF, JPG to PDF, PNG to PDF, HTML to PDF
 *   D. Archival Conversion: PDF to PDF/A (PDF/A-1b, PDF/A-2b, PDF/A-3b)
 *
 * Strictly Excluded (per specification): PDF to Text, Text to PDF, RTF to PDF, PDF to RTF.
 */
export const PDF_TOOLS_CATALOG: PdfToolDefinition[] = [
  // ============================================================================
  // 1. EDIT & OBJECT MANIPULATION (2 Tools)
  // ============================================================================
  {
    id: 'edit-pdf',
    name: '2D PDF Editor & Object Studio',
    shortName: 'Edit PDF',
    category: 'edit-pdf',
    categoryLabel: 'Edit & Objects',
    description:
      'Direct Figma-grade PDF canvas editor: select, move, resize from 8 handles, rotate, inline-edit text, draw custom shapes with background blur, or manage layers.',
    acceptedTypes: ['application/pdf'],
    acceptedExtensions: ['.pdf'],
    multipleFiles: false,
    outputExtension: '.pdf',
    outputMimeType: 'application/pdf',
    workspaceType: 'editor',
    keywords: [
      'edit',
      'editor',
      'modify text',
      'shapes',
      'blur',
      'annotate',
      'watermark',
      'layers',
      'canvas'
    ],
    popular: true,
    featuredInBento: true,
    iconName: 'FileEdit'
  },
  {
    id: 'remove-objects',
    name: 'Cover, Blur & Delete PDF Objects',
    shortName: 'Cover / Delete Objects',
    category: 'edit-pdf',
    categoryLabel: 'Edit & Objects',
    description:
      'Choose Method A (movable solid or background-blur cover overlay) or Method B (genuine object deletion from the PDF stream) with instant undo/redo.',
    acceptedTypes: ['application/pdf'],
    acceptedExtensions: ['.pdf'],
    multipleFiles: false,
    outputExtension: '.pdf',
    outputMimeType: 'application/pdf',
    workspaceType: 'editor',
    keywords: [
      'delete object',
      'hide object',
      'cover overlay',
      'background blur',
      'remove element',
      'clean pdf'
    ],
    popular: true,
    featuredInBento: true,
    iconName: 'Layers'
  },

  // ============================================================================
  // 2. ORGANIZE & SPRING PAGE PHYSICS (3 Tools)
  // ============================================================================
  {
    id: 'organize-pages',
    name: 'Organize & Reorder Pages',
    shortName: 'Organize Pages',
    category: 'organize-pdf',
    categoryLabel: 'Organize Pages',
    description:
      'Interactive spring-physics drag-and-drop page sorter to reorder, rotate, duplicate, insert blank pages, or delete pages with instant preview.',
    acceptedTypes: ['application/pdf'],
    acceptedExtensions: ['.pdf'],
    multipleFiles: false,
    outputExtension: '.pdf',
    outputMimeType: 'application/pdf',
    workspaceType: 'organizer',
    keywords: ['reorder', 'rearrange', 'sort pages', 'rotate', 'delete pages', 'organize'],
    popular: true,
    featuredInBento: true,
    iconName: 'LayoutGrid'
  },
  {
    id: 'merge-pdf',
    name: 'Merge PDF Files',
    shortName: 'Merge PDF',
    category: 'organize-pdf',
    categoryLabel: 'Organize Pages',
    description:
      'Combine multiple PDF documents into a single unified file with spring-animated drag-and-drop file ordering.',
    acceptedTypes: ['application/pdf'],
    acceptedExtensions: ['.pdf'],
    multipleFiles: true,
    outputExtension: '.pdf',
    outputMimeType: 'application/pdf',
    workspaceType: 'organizer',
    keywords: ['merge', 'combine', 'join', 'concatenate', 'bind', 'multiple pdfs'],
    popular: true,
    featuredInBento: true,
    iconName: 'Combine'
  },
  {
    id: 'split-pdf',
    name: 'Split & Extract PDF Pages',
    shortName: 'Split PDF',
    category: 'organize-pdf',
    categoryLabel: 'Organize Pages',
    description:
      'Divide a PDF into individual pages, custom page ranges, or fixed intervals and export as a clean PDF or ZIP archive.',
    acceptedTypes: ['application/pdf'],
    acceptedExtensions: ['.pdf'],
    multipleFiles: false,
    outputExtension: '.zip',
    outputMimeType: 'application/zip',
    workspaceType: 'organizer',
    keywords: ['split', 'burst', 'divide', 'separate', 'extract pages', 'ranges'],
    popular: true,
    featuredInBento: true,
    iconName: 'Scissors'
  },

  // ============================================================================
  // 3. CONVERSION SUITE — A. PDF TO OFFICE (3 Tools)
  // ============================================================================
  {
    id: 'pdf-to-word',
    name: 'PDF to Word (.docx)',
    shortName: 'PDF to Word',
    category: 'convert-from-pdf',
    categoryLabel: 'PDF to Office',
    conversionSubcategory: 'pdf-to-office',
    conversionSubcategoryLabel: 'PDF to Office',
    description:
      'Convert PDF documents into editable Microsoft Word (.docx) files preserving headings, paragraphs, detected tables, page images, and multi-page structure.',
    acceptedTypes: ['application/pdf'],
    acceptedExtensions: ['.pdf'],
    multipleFiles: true,
    outputExtension: '.docx',
    outputMimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    workspaceType: 'converter',
    keywords: ['pdf to word', 'docx', 'editable word', 'export word', 'convert from pdf', 'office'],
    popular: true,
    featuredInBento: true,
    iconName: 'FileOutput'
  },
  {
    id: 'pdf-to-excel',
    name: 'PDF to Excel (.xlsx)',
    shortName: 'PDF to Excel',
    category: 'convert-from-pdf',
    categoryLabel: 'PDF to Office',
    conversionSubcategory: 'pdf-to-office',
    conversionSubcategoryLabel: 'PDF to Office',
    description:
      'Extract PDF tables and structured rows into multi-sheet or consolidated Microsoft Excel (.xlsx) workbooks with numeric cell detection and OCR fallback.',
    acceptedTypes: ['application/pdf'],
    acceptedExtensions: ['.pdf'],
    multipleFiles: true,
    outputExtension: '.xlsx',
    outputMimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    workspaceType: 'converter',
    keywords: ['pdf to excel', 'xlsx', 'spreadsheet', 'extract tables', 'financial tables', 'office'],
    popular: true,
    featuredInBento: true,
    iconName: 'Sheet'
  },
  {
    id: 'pdf-to-ppt',
    name: 'PDF to PowerPoint (.pptx)',
    shortName: 'PDF to PowerPoint',
    category: 'convert-from-pdf',
    categoryLabel: 'PDF to Office',
    conversionSubcategory: 'pdf-to-office',
    conversionSubcategoryLabel: 'PDF to Office',
    description:
      'Convert PDF pages into editable or visual high-fidelity PowerPoint (.pptx) presentation slides preserving page sequence, aspect ratio, and graphics.',
    acceptedTypes: ['application/pdf'],
    acceptedExtensions: ['.pdf'],
    multipleFiles: true,
    outputExtension: '.pptx',
    outputMimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    workspaceType: 'converter',
    keywords: ['pdf to ppt', 'pptx', 'powerpoint', 'slides', 'presentation', 'office'],
    popular: true,
    featuredInBento: false,
    iconName: 'Presentation'
  },

  // ============================================================================
  // 4. CONVERSION SUITE — B. PDF TO IMAGES & WEB (3 Tools)
  // ============================================================================
  {
    id: 'pdf-to-jpg',
    name: 'PDF to JPG Images',
    shortName: 'PDF to JPG',
    category: 'convert-from-pdf',
    categoryLabel: 'PDF to Images & Web',
    conversionSubcategory: 'pdf-to-images-web',
    conversionSubcategoryLabel: 'PDF to Images & Web',
    description:
      'Render selected or all PDF pages into crisp JPEG images with configurable DPI resolution (72–300 DPI), quality control, individual page downloads, and ZIP export.',
    acceptedTypes: ['application/pdf'],
    acceptedExtensions: ['.pdf'],
    multipleFiles: false,
    outputExtension: '.zip',
    outputMimeType: 'application/zip',
    workspaceType: 'converter',
    keywords: ['pdf to jpg', 'jpeg', 'page images', 'rasterize', 'dpi', 'export images'],
    popular: true,
    featuredInBento: false,
    iconName: 'Image'
  },
  {
    id: 'pdf-to-png',
    name: 'PDF to PNG Images',
    shortName: 'PDF to PNG',
    category: 'convert-from-pdf',
    categoryLabel: 'PDF to Images & Web',
    conversionSubcategory: 'pdf-to-images-web',
    conversionSubcategoryLabel: 'PDF to Images & Web',
    description:
      'Convert selected or all PDF pages into lossless PNG images with sharp vector/text rendering, transparency support, DPI controls, and individual or ZIP download.',
    acceptedTypes: ['application/pdf'],
    acceptedExtensions: ['.pdf'],
    multipleFiles: false,
    outputExtension: '.zip',
    outputMimeType: 'application/zip',
    workspaceType: 'converter',
    keywords: ['pdf to png', 'lossless image', 'transparent png', 'high resolution', 'export png'],
    popular: true,
    featuredInBento: false,
    iconName: 'Images'
  },
  {
    id: 'pdf-to-html',
    name: 'PDF to HTML5 Document',
    shortName: 'PDF to HTML',
    category: 'convert-from-pdf',
    categoryLabel: 'PDF to Images & Web',
    conversionSubcategory: 'pdf-to-images-web',
    conversionSubcategoryLabel: 'PDF to Images & Web',
    description:
      'Transform PDF documents into self-contained, responsive HTML5 web documents preserving semantic headings, detected tables, reading order, and visual page figures.',
    acceptedTypes: ['application/pdf'],
    acceptedExtensions: ['.pdf'],
    multipleFiles: true,
    outputExtension: '.html',
    outputMimeType: 'text/html',
    workspaceType: 'converter',
    keywords: ['pdf to html', 'html5', 'web page', 'semantic html', 'convert to web'],
    popular: false,
    featuredInBento: false,
    iconName: 'Globe'
  },

  // ============================================================================
  // 5. CONVERSION SUITE — C. OTHER FORMATS TO PDF (6 Tools)
  // ============================================================================
  {
    id: 'word-to-pdf',
    name: 'Word (.docx) to PDF',
    shortName: 'Word to PDF',
    category: 'convert-to-pdf',
    categoryLabel: 'Other Formats to PDF',
    conversionSubcategory: 'formats-to-pdf',
    conversionSubcategoryLabel: 'Other Formats to PDF',
    description:
      'Convert Microsoft Word (.docx) files into formatted PDFs preserving headings, paragraphs, bordered tables, embedded images, margins, and optional password lock.',
    acceptedTypes: [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ],
    acceptedExtensions: ['.docx'],
    multipleFiles: true,
    outputExtension: '.pdf',
    outputMimeType: 'application/pdf',
    workspaceType: 'converter',
    keywords: ['word', 'docx', 'word to pdf', 'convert word', 'office to pdf'],
    popular: true,
    featuredInBento: true,
    iconName: 'FileText'
  },
  {
    id: 'excel-to-pdf',
    name: 'Excel (.xlsx) to PDF',
    shortName: 'Excel to PDF',
    category: 'convert-to-pdf',
    categoryLabel: 'Other Formats to PDF',
    conversionSubcategory: 'formats-to-pdf',
    conversionSubcategoryLabel: 'Other Formats to PDF',
    description:
      'Convert Excel workbooks (.xlsx) into cleanly paginated PDF tables with worksheet selection, portrait/landscape orientation, and column-fit scaling.',
    acceptedTypes: [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv'
    ],
    acceptedExtensions: ['.xlsx', '.csv'],
    multipleFiles: true,
    outputExtension: '.pdf',
    outputMimeType: 'application/pdf',
    workspaceType: 'converter',
    keywords: ['excel to pdf', 'xlsx', 'spreadsheet to pdf', 'table to pdf', 'worksheet'],
    popular: true,
    featuredInBento: false,
    iconName: 'Table'
  },
  {
    id: 'ppt-to-pdf',
    name: 'PowerPoint (.pptx) to PDF',
    shortName: 'PowerPoint to PDF',
    category: 'convert-to-pdf',
    categoryLabel: 'Other Formats to PDF',
    conversionSubcategory: 'formats-to-pdf',
    conversionSubcategoryLabel: 'Other Formats to PDF',
    description:
      'Convert PowerPoint (.pptx) decks into widescreen or standard landscape PDF slide decks preserving slide sequence, typography, and embedded slide media.',
    acceptedTypes: [
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ],
    acceptedExtensions: ['.pptx'],
    multipleFiles: true,
    outputExtension: '.pdf',
    outputMimeType: 'application/pdf',
    workspaceType: 'converter',
    keywords: ['ppt to pdf', 'pptx', 'powerpoint to pdf', 'slides to pdf', 'presentation'],
    popular: true,
    featuredInBento: false,
    iconName: 'Presentation'
  },
  {
    id: 'jpg-to-pdf',
    name: 'JPG to PDF',
    shortName: 'JPG to PDF',
    category: 'convert-to-pdf',
    categoryLabel: 'Other Formats to PDF',
    conversionSubcategory: 'formats-to-pdf',
    conversionSubcategoryLabel: 'Other Formats to PDF',
    description:
      'Compile one or multiple JPG/JPEG photos into a PDF with interactive image reordering, page size (Letter, A4, Fit), orientation, margins, and fit/fill scaling.',
    acceptedTypes: ['image/jpeg'],
    acceptedExtensions: ['.jpg', '.jpeg'],
    multipleFiles: true,
    outputExtension: '.pdf',
    outputMimeType: 'application/pdf',
    workspaceType: 'converter',
    keywords: ['jpg to pdf', 'jpeg to pdf', 'photo to pdf', 'image to pdf'],
    popular: true,
    featuredInBento: false,
    iconName: 'Image'
  },
  {
    id: 'png-to-pdf',
    name: 'PNG to PDF',
    shortName: 'PNG to PDF',
    category: 'convert-to-pdf',
    categoryLabel: 'Other Formats to PDF',
    conversionSubcategory: 'formats-to-pdf',
    conversionSubcategoryLabel: 'Other Formats to PDF',
    description:
      'Combine lossless PNG graphics into a PDF document preserving crisp alpha transparency matting, custom page sizes, orientation, margins, and image ordering.',
    acceptedTypes: ['image/png'],
    acceptedExtensions: ['.png'],
    multipleFiles: true,
    outputExtension: '.pdf',
    outputMimeType: 'application/pdf',
    workspaceType: 'converter',
    keywords: ['png to pdf', 'lossless image to pdf', 'graphics to pdf', 'transparent png'],
    popular: true,
    featuredInBento: false,
    iconName: 'Images'
  },
  {
    id: 'html-to-pdf',
    name: 'HTML to PDF',
    shortName: 'HTML to PDF',
    category: 'convert-to-pdf',
    categoryLabel: 'Other Formats to PDF',
    conversionSubcategory: 'formats-to-pdf',
    conversionSubcategoryLabel: 'Other Formats to PDF',
    description:
      'Render HTML files or pasted markup into formatted multi-page PDF documents preserving headings, lists, tables, inline images, margins, and page numbers.',
    acceptedTypes: ['text/html'],
    acceptedExtensions: ['.html', '.htm'],
    multipleFiles: true,
    outputExtension: '.pdf',
    outputMimeType: 'application/pdf',
    workspaceType: 'converter',
    keywords: ['html to pdf', 'web to pdf', 'markup to pdf', 'htm'],
    popular: false,
    featuredInBento: false,
    iconName: 'Code'
  },

  // ============================================================================
  // 6. CONVERSION SUITE — D. ARCHIVAL CONVERSION (1 Tool)
  // ============================================================================
  {
    id: 'pdf-to-pdfa',
    name: 'PDF to PDF/A Archival',
    shortName: 'PDF to PDF/A',
    category: 'convert-from-pdf',
    categoryLabel: 'Archival Conversion',
    conversionSubcategory: 'archival',
    conversionSubcategoryLabel: 'Archival Conversion',
    description:
      'Convert standard PDFs into ISO 19005 archival PDF/A documents (PDF/A-1b, PDF/A-2b, PDF/A-3b) with embedded XMP pdfaid metadata, sRGB OutputIntent, and compliance verification.',
    acceptedTypes: ['application/pdf'],
    acceptedExtensions: ['.pdf'],
    multipleFiles: true,
    outputExtension: '.pdf',
    outputMimeType: 'application/pdf',
    workspaceType: 'converter',
    keywords: ['pdf to pdfa', 'pdf/a', 'archival pdf', 'iso 19005', 'pdfa-1b', 'pdfa-2b', 'long term preservation'],
    popular: true,
    featuredInBento: false,
    iconName: 'ShieldCheck'
  },

  // ============================================================================
  // 7. COMPRESS, SECURITY & BATCH QUEUE (5 Tools)
  // ============================================================================
  {
    id: 'compress-pdf',
    name: 'Compress & Optimize PDF',
    shortName: 'Compress PDF',
    category: 'optimize-pdf',
    categoryLabel: 'Compress & Batch',
    description:
      'Shrink PDF file size by compacting cross-reference object streams and stripping redundant metadata while preserving crisp text.',
    acceptedTypes: ['application/pdf'],
    acceptedExtensions: ['.pdf'],
    multipleFiles: true,
    outputExtension: '.pdf',
    outputMimeType: 'application/pdf',
    workspaceType: 'converter',
    keywords: ['compress', 'reduce size', 'shrink', 'optimize', 'lightweight'],
    popular: true,
    featuredInBento: true,
    iconName: 'Minimize2'
  },
  {
    id: 'batch-process',
    name: 'Batch Processing Queue',
    shortName: 'Batch Queue',
    category: 'optimize-pdf',
    categoryLabel: 'Compress & Batch',
    description:
      'Process multiple PDFs or Office files in parallel—including converting multiple Word files to password-protected PDFs or unlocking multiple PDFs in one go.',
    acceptedTypes: [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/html',
      'image/jpeg',
      'image/png'
    ],
    acceptedExtensions: ['.pdf', '.docx', '.xlsx', '.pptx', '.html', '.jpg', '.jpeg', '.png'],
    multipleFiles: true,
    outputExtension: '.zip',
    outputMimeType: 'application/zip',
    workspaceType: 'batch',
    keywords: ['batch', 'bulk', 'multiple files', 'queue', 'parallel', 'zip', 'one go'],
    popular: true,
    featuredInBento: true,
    iconName: 'Layers2'
  },
  {
    id: 'protect-pdf',
    name: 'Protect & Lock PDF with Password',
    shortName: 'Protect PDF',
    category: 'pdf-security',
    categoryLabel: 'Security & Vault',
    description:
      'Lock one or multiple PDF documents in one go with a password, SHA-256 cryptographic security envelope, and print/copy access controls.',
    acceptedTypes: ['application/pdf'],
    acceptedExtensions: ['.pdf'],
    multipleFiles: true,
    outputExtension: '.pdf',
    outputMimeType: 'application/pdf',
    workspaceType: 'security',
    keywords: ['protect', 'password', 'lock', 'encrypt', 'security', 'permissions'],
    popular: true,
    featuredInBento: true,
    iconName: 'Lock'
  },
  {
    id: 'unlock-pdf',
    name: 'Unlock Password-Protected PDFs',
    shortName: 'Unlock PDF',
    category: 'pdf-security',
    categoryLabel: 'Security & Vault',
    description:
      'Remove password restrictions and security envelopes from one or multiple protected PDFs in one go using the authorized password.',
    acceptedTypes: ['application/pdf'],
    acceptedExtensions: ['.pdf'],
    multipleFiles: true,
    outputExtension: '.pdf',
    outputMimeType: 'application/pdf',
    workspaceType: 'security',
    keywords: ['unlock', 'decrypt', 'remove password', 'unprotect', 'bulk unlock'],
    popular: true,
    featuredInBento: true,
    iconName: 'Unlock'
  },
  {
    id: 'redact-pdf',
    name: 'Permanent Redaction & Sanitize',
    shortName: 'Redact PDF',
    category: 'pdf-security',
    categoryLabel: 'Security & Vault',
    description:
      'Permanently black out confidential text or graphics and purge underlying PDF content stream operators so redacted data cannot be recovered.',
    acceptedTypes: ['application/pdf'],
    acceptedExtensions: ['.pdf'],
    multipleFiles: false,
    outputExtension: '.pdf',
    outputMimeType: 'application/pdf',
    workspaceType: 'editor',
    keywords: ['redact', 'blackout', 'sanitize', 'confidential', 'pii', 'permanent delete'],
    popular: true,
    featuredInBento: true,
    iconName: 'EyeOff'
  }
];

export function getToolsByCategory(category: ToolCategory | 'all'): PdfToolDefinition[] {
  if (category === 'all') return PDF_TOOLS_CATALOG;
  return PDF_TOOLS_CATALOG.filter((t) => t.category === category);
}

export function getToolsByConversionSubcategory(
  sub: ConversionSubcategory | 'all'
): PdfToolDefinition[] {
  const conversionTools = PDF_TOOLS_CATALOG.filter((t) => Boolean(t.conversionSubcategory));
  if (sub === 'all') return conversionTools;
  return conversionTools.filter((t) => t.conversionSubcategory === sub);
}

export function findToolById(id: string): PdfToolDefinition | undefined {
  return PDF_TOOLS_CATALOG.find((t) => t.id === id);
}
