export type AppearanceMode = 'dark' | 'light' | 'system';

export interface ThemeSettings {
  appearance: AppearanceMode;
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

export type ConversionSubcategory =
  | 'pdf-to-office'
  | 'pdf-to-images-web'
  | 'formats-to-pdf';

export interface PdfToolDefinition {
  id: string;
  name: string;
  shortName: string;
  category: ToolCategory;
  categoryLabel: string;
  conversionSubcategory?: ConversionSubcategory;
  conversionSubcategoryLabel?: string;
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
  | 'ocr-text'
  | 'added-text'
  | 'added-image'
  | 'shape'
  | 'annotation'
  | 'form-field'
  | 'signature'
  | 'watermark'
  | 'redaction';

export type PageContentClassification = 'native' | 'scanned' | 'mixed';
export type OcrLanguageCode = 'eng';
export type OcrPreprocessMode =
  | 'auto-enhance'
  | 'grayscale-contrast'
  | 'adaptive-threshold'
  | 'denoise'
  | 'none';
export type BgReconstructionMethod = 'auto-color' | 'inpaint-texture' | 'manual-solid';
export type ScannedExportMode = 'visually-edited' | 'searchable-ocr' | 'redacted-sanitized';
export type ScannedSamplePreset = 'receipt-monospaced' | 'serif-notice' | 'sans-invoice';

export type PdfFontFamily =
  | 'Helvetica'
  | 'Arial-Clean'
  | 'Roboto-Condensed'
  | 'Times-Roman'
  | 'Libre-Baskerville'
  | 'Merriweather-Slab'
  | 'Courier'
  | 'Courier-Prime'
  | 'Consolas-Mono'
  | 'Space-Mono';

export type OcrFontClassification =
  | 'monospaced'
  | 'serif'
  | 'slab-serif'
  | 'sans-serif'
  | 'condensed-sans';

export type OcrFontWeightLevel = 'light' | 'regular' | 'medium' | 'semibold' | 'bold';

export interface OcrFontCandidateMatch {
  fontFamily: PdfFontFamily;
  displayName: string;
  cssFontStack: string;
  classification: OcrFontClassification;
  similarityScore: number; // 0 to 1
}

export interface OcrTypographyProfile {
  fontClassification: OcrFontClassification;
  fontStyleDescriptor: string; // e.g. 'receipt-mono', 'typewriter', 'traditional-serif', 'condensed-sans', 'neo-grotesque-sans'
  matchedFontFamily: PdfFontFamily;
  candidateMatches: OcrFontCandidateMatch[];
  fontWeightLevel: OcrFontWeightLevel;
  numericFontWeight: 300 | 400 | 500 | 600 | 700;
  estimatedFontSizePt: number;
  capHeightPt: number;
  xHeightPt: number;
  strokeThicknessPx: number;
  characterSpacingPt: number;
  lineHeightRatio: number;
  horizontalScale: number; // e.g. 0.92 to 1.08
  estimatedCharacterWidthPt: number;
  textDensity: number;
  isMonospaced: boolean;
  isSerif: boolean;
  isCondensed: boolean;
  textColorHex: string;
  baselineOffsetPt: number;
  confidence: number; // 0 to 1
  nearbyReferenceTexts: string[];
  scanEdgeSoftnessPx: number; // e.g. 0.25 to 0.75
  scanInkFade: number; // 0 to 0.25
  scanGrainAmount: number; // 0 to 0.2
  originalCropDataUrl?: string;
  replacementPreviewCropDataUrl?: string;
  reusedGlyphCount?: number;
}

export interface OcrSelectionGeometry {
  imageBboxPx: { x0: number; y0: number; x1: number; y1: number };
  baselinePx?: { x0: number; y0: number; x1: number; y1: number };
  sourceImageWidthPx: number;
  sourceImageHeightPx: number;
  preprocessedWidthPx: number;
  preprocessedHeightPx: number;
  pdfPageWidthPt: number;
  pdfPageHeightPt: number;
  pageRotationDeg: number;
  pdfTopLeftPt: { x: number; y: number; width: number; height: number };
  pdfBottomLeftPt: { x: number; y: number; width: number; height: number };
  baselineOffsetPt: number; // distance from top of bbox to typographic baseline in pt
  anchorXPt: number; // left x, center x, or right x depending on detectedAlign
  detectedAlign: 'left' | 'center' | 'right';
  originalEstimatedFontSizePt: number;
  recognitionSource: 'tesseract-words' | 'tesseract-lines' | 'tesseract-tsv' | 'connected-components-2d';
}

export type PdfShapeKind =
  | 'rectangle'
  | 'rounded-rectangle'
  | 'circle'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'polygon'
  | 'freehand'
  | 'cover-overlay'
  | 'highlight'
  | 'underline-mark'
  | 'strikethrough'
  | 'sticky-note';

export type StrokeStyleKind = 'solid' | 'dashed' | 'dotted';

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
  groupId?: string;
  lockAspectRatio?: boolean;

  // Geometry in PDF page points (top-left origin normalized for UI, converted to bottom-left for pdf-lib)
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;

  // Original native/OCR geometry (immutable anchor for background reconstruction and replacement alignment)
  originalX?: number;
  originalY?: number;
  originalWidth?: number;
  originalHeight?: number;

  // Text properties (for native-text, ocr-text, added-text, watermark, annotation comment)
  text?: string;
  originalText?: string;
  fontFamily?: PdfFontFamily;
  originalFontFamily?: PdfFontFamily;
  fontSize?: number;
  originalFontSize?: number;
  fontWeight?: 'normal' | 'bold';
  originalFontWeight?: 'normal' | 'bold';
  numericFontWeight?: 300 | 400 | 500 | 600 | 700;
  fontStyle?: 'normal' | 'italic';
  originalFontStyle?: 'normal' | 'italic';
  underline?: boolean;
  color?: string;
  textAlign?: 'left' | 'center' | 'right';
  lineHeight?: number;
  letterSpacing?: number;
  horizontalScale?: number; // 0.8 to 1.25
  baselineAdjustmentPt?: number; // fine vertical baseline adjustment in pt (-4 to +4)
  scanPrintRealism?: boolean; // when true on ocr-text, reproduces subtle scan edge softness/ink fade
  reuseOriginalGlyphs?: boolean; // when true on ocr-text, reuses matching character/digit crops where reliable
  widthOverflowWarning?: string;

  // OCR & Scanned Document Editing properties (English-only OCR + Exact Geometry + Font Matching Pipeline)
  ocrConfidence?: number; // 0 to 100
  ocrConfidenceVerified?: boolean;
  ocrLanguage?: OcrLanguageCode;
  readingOrder?: number;
  ocrGeometry?: OcrSelectionGeometry;
  ocrTypography?: OcrTypographyProfile;
  bgReconstructionMethod?: BgReconstructionMethod;
  sampledBgColor?: string;
  sampledTextColor?: string;
  bgPatchDataUrl?: string;
  bgMaskPadding?: number; // -4 to +12 pt
  ocrEdited?: boolean;
  isScannedFormField?: boolean;
  scannedFieldLabel?: string;

  // Shape / Annotation / Cover Overlay / Redaction properties
  shapeKind?: PdfShapeKind;
  fillColor?: string;
  fillOpacity?: number; // 0 to 1, independent from strokeOpacity
  transparentFill?: boolean;
  gradientFill?: {
    enabled: boolean;
    toColor: string;
    angle: number;
  };
  strokeColor?: string;
  strokeWidth?: number;
  strokeOpacity?: number; // 0 to 1, independent from fillOpacity
  strokeStyle?: StrokeStyleKind;
  cornerRadius?: number; // For rounded-rectangle and cover-overlay
  polygonSides?: number; // For regular polygon (3 = triangle, 5 = pentagon, 6 = hexagon, etc.)
  closePath?: boolean; // For freehand / custom polygon paths
  isCoverOverlay?: boolean; // Method A: non-destructive visual cover overlay
  points?: Array<{ x: number; y: number }>; // For freehand / custom path drawing
  redactionCode?: string; // e.g., "CONFIDENTIAL", "PII - REDACTED"

  // Visual Effects: Background Blur vs Object Blur & Drop Shadow
  backdropBlur?: number; // Blurs underlying PDF page content inside the shape boundary (0 - 24px)
  objectBlur?: number; // Blurs the object itself (0 - 20px)
  shadow?: {
    enabled: boolean;
    color: string;
    blur: number;
    offsetX: number;
    offsetY: number;
  };

  // Image / Signature properties
  imageDataUrl?: string;
  imageMimeType?: 'image/png' | 'image/jpeg';
  crop?: {
    top: number; // 0 to 45%
    right: number;
    bottom: number;
    left: number;
  };
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
  isScannedCandidate?: boolean; // True when page is 'scanned' or 'mixed'
  pageClassification?: PageContentClassification; // 'native' | 'scanned' | 'mixed'
  nativeTextRunCount?: number;
  imageXObjectCount?: number;
  ocrProcessed?: boolean;
  ocrRegionCount?: number;
  ocrAvgConfidence?: number;
  ocrLanguageUsed?: OcrLanguageCode;
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
