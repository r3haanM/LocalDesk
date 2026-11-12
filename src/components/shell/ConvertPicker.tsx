import { useMemo } from 'react';
import type { PdfToolDefinition } from '../../types/pdf';
import { PDF_TOOLS_CATALOG, getOutputExtensionLabel } from '../../data/toolsCatalog';
import { ToolIcon } from '../IconMapper';

/**
 * Convert view entry: a compact grid of every conversion tool.
 * Picking one hands off to the adaptive tool workspace.
 */
export function ConvertPicker({ onPick }: { onPick: (tool: PdfToolDefinition) => void }) {
  const groups = useMemo(() => {
    const conversionTools = PDF_TOOLS_CATALOG.filter(
      (t) => t.category === 'convert-to-pdf' || t.category === 'convert-from-pdf'
    );
    const toPdf = conversionTools.filter((t) => t.category === 'convert-to-pdf');
    const fromPdf = conversionTools.filter((t) => t.category === 'convert-from-pdf');
    return [
      { title: 'Other formats → PDF', tools: toPdf },
      { title: 'PDF → other formats', tools: fromPdf }
    ];
  }, []);

  return (
    <div className="convert-picker">
      <h1 className="view-title">Convert</h1>
      <p className="view-sub">Pick a conversion — everything runs locally on your machine.</p>
      {groups.map((g) => (
        <div key={g.title} className="convert-group">
          <h3 className="convert-group-title">{g.title}</h3>
          <div className="convert-grid">
            {g.tools.map((tool) => (
              <button
                key={tool.id}
                type="button"
                className="convert-tool-card"
                onClick={() => onPick(tool)}
                title={tool.description}
              >
                <span className="convert-tool-icon">
                  <ToolIcon name={tool.iconName} className="convert-tool-glyph" />
                </span>
                <span className="convert-tool-name">{tool.shortName}</span>
                <span className="convert-tool-ext mono">
                  {tool.acceptedExtensions[0]?.toUpperCase()} → {getOutputExtensionLabel(tool).toUpperCase()}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
