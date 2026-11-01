import React from 'react';
import { X, ShieldCheck } from 'lucide-react';

interface LegalModalProps {
  docType: 'privacy' | 'terms' | null;
  onClose: () => void;
}

export const LegalModal: React.FC<LegalModalProps> = ({ docType, onClose }) => {
  if (!docType) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={docType === 'privacy' ? 'Privacy Policy' : 'Terms of Service'}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] overflow-y-auto bg-theme-elevated border border-theme-strong rounded-xl shadow-2xl p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-theme-subtle pb-4">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-theme-accent" />
            <h2 className="text-lg font-bold text-theme-primary">
              {docType === 'privacy'
                ? 'Privacy Policy & Document Retention Architecture'
                : 'Terms of Service & Open Access Guarantee'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-theme-secondary hover:text-theme-primary cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {docType === 'privacy' ? (
          <div className="space-y-4 text-xs text-theme-secondary leading-relaxed">
            <div>
              <h3 className="font-bold text-theme-primary text-sm mb-1">
                01. Ephemeral In-Memory &amp; Browser-First Processing
              </h3>
              <p>
                Vellum processes PDF rendering, native content stream editing, object hiding and removal, redaction, and Office conversions directly within your browser memory. Guest documents are never written to persistent server disks or shared across sessions.
              </p>
            </div>
            <div>
              <h3 className="font-bold text-theme-primary text-sm mb-1">
                02. SSRF-Protected Remote URL Imports
              </h3>
              <p>
                When you import a document via URL, our server validates the hostname against private, loopback, and cloud-metadata CIDR blocks (RFC 1918, RFC 4193, link-local), enforces a strict 25 MB payload limit, verifies magic-byte file headers, and discards the transit buffer immediately after returning the response.
              </p>
            </div>
            <div>
              <h3 className="font-bold text-theme-primary text-sm mb-1">
                03. Zero AI Training or Telemetry
              </h3>
              <p>
                Vellum contains zero generative AI models, chatbots, or external LLM API calls. Optical character recognition (OCR) uses traditional deterministic Tesseract pattern recognition. Your documents are never analyzed, indexed, or used for model training.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4 text-xs text-theme-secondary leading-relaxed">
            <div>
              <h3 className="font-bold text-theme-primary text-sm mb-1">
                01. Completely Free — Zero Tiers, Paywalls, or Credits
              </h3>
              <p>
                Every tool in the Vellum catalogue—including the Professional PDF Editor, Sajda-style Object Manager, Permanent Redaction engine, and Batch Organizer—is provided completely free of charge to both anonymous guests and registered profile users alike.
              </p>
            </div>
            <div>
              <h3 className="font-bold text-theme-primary text-sm mb-1">
                02. Cryptographic vs. Visual Signatures
              </h3>
              <p>
                Vellum provides both visual signatures (drawn, typed, or uploaded) and SHA-256 cryptographic digest stamps. For regulated statutory PKI workflows requiring hardware token X.509 certificates, verify compliance requirements with your jurisdiction.
              </p>
            </div>
            <div>
              <h3 className="font-bold text-theme-primary text-sm mb-1">
                03. Operational Safety Limits
              </h3>
              <p>
                To maintain browser responsiveness and prevent resource exhaustion, individual file uploads are capped at 50 MB (25 MB for remote URL imports). These safety limits apply equally to all users.
              </p>
            </div>
          </div>
        )}

        <div className="pt-3 border-t border-theme-subtle flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-theme-accent text-white cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
