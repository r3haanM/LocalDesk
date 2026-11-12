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
                01. In-Memory Local Processing
              </h3>
              <p>
                Local Desk processes PDF editing, object removal, redaction, and Office conversions directly in local memory. Documents are never uploaded or shared across sessions.
              </p>
            </div>
            <div>
              <h3 className="font-bold text-theme-primary text-sm mb-1">
                02. No Network Document Transfers
              </h3>
              <p>
                Local Desk does not import documents from remote URLs — there is no cloud fetch path in the application. Files only enter the studio through local file selection, and in the desktop app all outbound requests are blocked at the session layer.
              </p>
            </div>
            <div>
              <h3 className="font-bold text-theme-primary text-sm mb-1">
                03. Zero AI Training or Telemetry
              </h3>
              <p>
                Local Desk uses deterministic Tesseract OCR with zero external API calls. Your documents are never analyzed, indexed, or used for training.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4 text-xs text-theme-secondary leading-relaxed">
            <div>
              <h3 className="font-bold text-theme-primary text-sm mb-1">
                01. Completely Free · Zero Tiers or Paywalls
              </h3>
              <p>
                Every tool in Local Desk, including the 2D PDF Editor, Object Manager, Redaction engine, and Batch Organizer, is free for all users.
              </p>
            </div>
            <div>
              <h3 className="font-bold text-theme-primary text-sm mb-1">
                02. Cryptographic vs. Visual Signatures
              </h3>
              <p>
                Local Desk provides visual signatures and SHA-256 cryptographic digest stamps. For regulated hardware PKI workflows, verify your jurisdiction requirements.
              </p>
            </div>
            <div>
              <h3 className="font-bold text-theme-primary text-sm mb-1">
                03. Operational Safety Limits
              </h3>
              <p>
                To keep processing responsive, individual files are capped at 50 MB.
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
