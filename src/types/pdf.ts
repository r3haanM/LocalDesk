export type ThemePreset = 'obsidian' | 'midnight' | 'evergreen' | 'ivory';
export type AppearanceMode = 'dark' | 'light' | 'system';

export interface ThemeSettings {
  preset: ThemePreset;
  appearance: AppearanceMode;
  customAccent?: string;
}

export type ToolCategory =
  | 'convert-to-pdf'
  | 'convert-from-pdf'
  | 'organize-pdf'
  | 'optimize-pdf'
  | 'edit-pdf'
  | 'pdf-security'
  | 'advanced-utilities';

export type WorkspaceType =
  | 'editor'
  | 'organizer'
  | 'converter'
  | 'security'
  | 'compare'
  | 'inspector'
  | 'ocr'
  | 'batch';

export type BatchItemStatus = 'queued' | 'processing' | 'completed' | 'error';

export interface BatchQueueItem {
  id: string;
  fileItem: UploadedFileItem;
  status: BatchItemStatus;
  progress: number;
  stageLabel: string;
  result?: ProcessingResult;
  errorMessage?: string;
}

export interface PdfToolDefinition {
  id: string;
  name: string;
  shortName: string;
  category: ToolCategory;
  categoryLabel: string;
  description: string;
  acceptedTypes: string[];
  acceptedExtensions: string[];
  multipleFiles: boolean;
  outputExtension: string;
  outputMimeType: string;
  workspaceType: WorkspaceType;
  keywords: string[];
  popular?: boolean;
  featuredInBento?: boolean;
  iconName: string;
}

export interface UploadedFileItem {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  pageCount?: number;
  isValidSignature: boolean;
  signatureLabel: string;
  encrypted?: boolean;
  addedAt: number;
  arrayBuffer?: ArrayBuffer;
}

export type PdfObjectType =
  | 'native-text'
  | 'native-image'
  | 'native-shape'
  | 'added-text'
  | 'added-image'
  | 'shape'
  | 'annotation'
  | 'form-field'
  | 'signature'
  | 'watermark'
  | 'redaction';

export interface PdfEditableObject {
  id: string;
  pageIndex: number; // 0-based page index
  type: PdfObjectType;
  name: string;
  isNative: boolean;
  visible: boolean;
  locked: boolean;
  deleted: boolean;
  zIndex: number;

  // Geometry in PDF page points (top-left origin normalized for UI, converted to bottom-left for pdf-lib)
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;

  // Text properties (for native-text, added-text, watermark, annotation comment)
  text?: string;
  originalText?: string;
  fontFamily?: 'Helvetica' | 'Times-Roman' | 'Courier';
  fontSize?: number;
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  underline?: boolean;
  color?: string;
  textAlign?: 'left' | 'center' | 'right';
  lineHeight?: number;

  // Shape / Annotation / Redaction properties
  shapeKind?: 'rectangle' | 'circle' | 'line' | 'arrow' | 'highlight' | 'underline-mark' | 'strikethrough' | 'freehand' | 'sticky-note';
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  points?: Array<{ x: number; y: number }>; // For freehand drawing
  redactionCode?: string; // e.g., "CONFIDENTIAL", "PII - REDACTED"

  // Image / Signature properties
  imageDataUrl?: string;
  imageMimeType?: 'image/png' | 'image/jpeg';
  signatureKind?: 'visual-drawn' | 'visual-typed' | 'visual-uploaded' | 'cryptographic-sha256';
  signerName?: string;
  signatureHash?: string;

  // Form field properties
  fieldType?: 'text' | 'checkbox' | 'dropdown' | 'date' | 'radio' | 'signature-field';
  fieldName?: string;
  fieldValue?: string | boolean;
  fieldOptions?: string[];
  required?: boolean;

  // Native content stream tracking
  nativeStreamOperatorHint?: string;
}

export interface PdfPageDescriptor {
  pageIndex: number; // Current 0-based index in document
  originalPageIndex: number; // Original 0-based index in uploaded PDF (-1 if added blank page)
  width: number;
  height: number;
  rotation: number; // 0, 90, 180, 270
  deleted: boolean;
  cropBox?: { x: number; y: number; width: number; height: number };
  thumbnailUrl?: string;
}

export interface EditorHistorySnapshot {
  id: string;
  label: string;
  timestamp: number;
  pages: PdfPageDescriptor[];
  objects: PdfEditableObject[];
}

export interface ProcessingResult {
  success: boolean;
  toolId: string;
  outputFileName: string;
  outputMimeType: string;
  outputBytes: Uint8Array;
  originalSize: number;
  outputSize: number;
  pageCount?: number;
  summary: string;
  details?: Record<string, string | number | boolean>;
  extractedText?: string;
  extractedImages?: Array<{ name: string; dataUrl: string; width: number; height: number; page: number }>;
  validationPassed: boolean;
  validationNotes: string[];
}

export interface ActivityHistoryItem {
  id: string;
  toolId: string;
  toolName: string;
  fileName: string;
  outputFileName: string;
  timestamp: number;
  outputSize: number;
  summary: string;
}

export interface UserAccountProfile {
  email: string;
  name: string;
  saveHistory: boolean;
  persistSettings: boolean;
  createdAt: number;
}
