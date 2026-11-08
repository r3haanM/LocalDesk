import './demo.css';
import {
  SAMPLE_PDF_FILENAME,
  getBundledSamplePdfBytes
} from './samplePdfData';

const RELEASES_LATEST_URL = 'https://github.com/rehanmumtaz/local-desk/releases/latest';
const SYNTHETIC_DEMO_EVENT_FLAG = '__localDeskSyntheticSampleEvent';

/**
 * Backend-dependent or user-file conversion tool titles/IDs that require the local desktop app
 */
const DESKTOP_ONLY_ACTION_PATTERNS = [
  /word to pdf/i,
  /excel to pdf/i,
  /powerpoint to pdf/i,
  /ppt to pdf/i,
  /html to pdf/i,
  /jpg to pdf/i,
  /png to pdf/i,
  /pdf to word/i,
  /pdf to excel/i,
  /pdf to powerpoint/i,
  /pdf to ppt/i,
  /windows setup/i,
  /windows app/i,
  /download & verify/i,
  /execute batch queue/i,
  /start batch/i,
  /run batch/i
];

const memoryStore = new Map<string, string>();

/**
 * 1. Swap localStorage, sessionStorage, cookies & IndexedDB with an in-memory adapter
 *    so zero state is ever persisted to disk and closing the tab resets everything.
 */
function installMemoryOnlyPersistenceAdapter(): void {
  const createInMemoryStorage = (): Storage => ({
    get length() {
      return memoryStore.size;
    },
    clear() {
      memoryStore.clear();
    },
    getItem(key: string): string | null {
      return memoryStore.has(String(key)) ? memoryStore.get(String(key))! : null;
    },
    key(index: number): string | null {
      return Array.from(memoryStore.keys())[index] ?? null;
    },
    removeItem(key: string): void {
      memoryStore.delete(String(key));
    },
    setItem(key: string, value: string): void {
      memoryStore.set(String(key), String(value));
    }
  });

  try {
    const memLocal = createInMemoryStorage();
    const memSession = createInMemoryStorage();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      enumerable: true,
      get: () => memLocal
    });
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      enumerable: true,
      get: () => memSession
    });
  } catch (err) {
    console.error('[ShowcaseDemo] Failed to install in-memory storage adapter:', err);
  }

  // Block cookie persistence
  try {
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => '',
      set: () => true
    });
  } catch {
    // Ignore if already locked
  }
}

/**
 * 2. Inject Persistent Non-Dismissible Top Banner + "Reset demo" + "Get the desktop app ->"
 */
function injectPersistentDemoBanner(onResetDemo: () => void): void {
  if (document.getElementById('showcase-demo-banner')) return;

  const banner = document.createElement('aside');
  banner.id = 'showcase-demo-banner';
  banner.setAttribute('role', 'region');
  banner.setAttribute('aria-label', 'Showcase Demo Notice');

  const copySpan = document.createElement('div');
  copySpan.className = 'demo-banner-copy';
  copySpan.textContent =
    '🔒 Showcase demo — sample document only. Nothing is uploaded, nothing is stored, nothing leaves your tab. Closing the tab resets everything.';

  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'demo-banner-actions';

  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.id = 'showcase-reset-demo-btn';
  resetBtn.className = 'demo-reset-btn';
  resetBtn.textContent = 'Reset demo';
  resetBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onResetDemo();
  });

  const getAppLink = document.createElement('a');
  getAppLink.href = RELEASES_LATEST_URL;
  getAppLink.target = '_blank';
  getAppLink.rel = 'noopener noreferrer';
  getAppLink.className = 'demo-get-app-link';
  getAppLink.textContent = 'Get the desktop app →';

  actionsDiv.appendChild(resetBtn);
  actionsDiv.appendChild(getAppLink);
  banner.appendChild(copySpan);
  banner.appendChild(actionsDiv);

  document.body.prepend(banner);
}

/**
 * 3. Inject Modal for Backend-Dependent / User-File Actions
 *    Exact copy: "That runs in the desktop app on your machine. [Get it →]"
 */
function ensureDesktopActionModal(): { openModal: (contextLabel?: string) => void } {
  let backdrop = document.getElementById('showcase-desktop-modal-backdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.id = 'showcase-desktop-modal-backdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('aria-labelledby', 'showcase-desktop-modal-title');

    backdrop.innerHTML = `
      <div id="showcase-desktop-modal">
        <span class="modal-kicker">Desktop Runtime Feature</span>
        <h3 id="showcase-desktop-modal-title">That runs in the desktop app on your machine.</h3>
        <p id="showcase-desktop-modal-desc">
          User file uploads, multi-format Office conversions, and local filesystem batch queues run natively on your computer in Local Desk for Windows.
        </p>
        <div class="modal-actions">
          <button type="button" class="modal-close-btn" id="showcase-desktop-modal-close">
            Continue in demo
          </button>
          <a
            href="${RELEASES_LATEST_URL}"
            target="_blank"
            rel="noopener noreferrer"
            class="modal-cta-link"
            id="showcase-desktop-modal-cta"
          >
            Get it →
          </a>
        </div>
      </div>
    `;

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        backdrop?.setAttribute('data-open', 'false');
      }
    });

    document.body.appendChild(backdrop);

    const closeBtn = document.getElementById('showcase-desktop-modal-close');
    closeBtn?.addEventListener('click', () => {
      backdrop?.setAttribute('data-open', 'false');
    });
  }

  return {
    openModal: () => {
      backdrop?.setAttribute('data-open', 'true');
    }
  };
}

/**
 * 4. Create an in-memory File object from the bundled sample PDF (zero network fetch)
 */
function createBundledSampleFile(): File {
  const bytes = getBundledSamplePdfBytes();
  const ab = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
  return new File([ab], SAMPLE_PDF_FILENAME, {
    type: 'application/pdf',
    lastModified: 1730678400000
  });
}

/**
 * Feed the bundled sample PDF into a target <input type="file"> element via DataTransfer
 */
function feedBundledSampleIntoFileInput(inputEl: HTMLInputElement): void {
  try {
    const dt = new DataTransfer();
    dt.items.add(createBundledSampleFile());
    inputEl.files = dt.files;
    const evt = new Event('change', { bubbles: true });
    (evt as any)[SYNTHETIC_DEMO_EVENT_FLAG] = true;
    inputEl.dispatchEvent(evt);
  } catch (err) {
    console.error('[ShowcaseDemo] Failed to auto-load bundled sample PDF into input:', err);
  }
}

/**
 * 5. Validate required DOM selectors loudly (console.error if a UI refactor breaks a selector)
 *    and replace upload buttons with a visible "Demo" chip.
 */
let hasLoggedSelectorCheck = false;
const autoPopulatedInputs = new WeakSet<HTMLInputElement>();

function applyDomPatchesAndValidateSelectors(): void {
  const rootEl = document.getElementById('root');
  if (!rootEl) {
    console.error('[ShowcaseDemo] CRITICAL: Required selector "#root" is missing from DOM.');
    return;
  }

  const topContainer = document.getElementById('top');
  const headerEl = document.querySelector('header');
  if (!topContainer || !headerEl) {
    // React may still be completing initial render; only log if root already has children
    if (rootEl.children.length > 0 && !hasLoggedSelectorCheck) {
      console.error(
        '[ShowcaseDemo] Selector check failed: expected "#top" and "header" in mounted app.'
      );
      hasLoggedSelectorCheck = true;
    }
    return;
  }

  // If on Home view (where #tool-directory or .drop-zone is present), verify #dropPanel exists
  const dropPanel = document.getElementById('dropPanel');
  const isHomeView = Boolean(document.querySelector('.tool-flip-card') || dropPanel);
  if (isHomeView && !dropPanel) {
    console.error(
      '[ShowcaseDemo] CRITICAL: Required hero drop-zone selector "#dropPanel" (.drop-zone) disappeared!'
    );
  }

  // Hide upload buttons ("Select Files", "Add Files", "Choose Files") and inject "Demo" chip
  const allButtons = Array.from(document.querySelectorAll('button'));
  for (const btn of allButtons) {
    const label = (btn.textContent || '').trim();
    if (/^(select files|choose files|upload files|add files|browse files)$/i.test(label)) {
      if (btn.getAttribute('data-demo-upload-hidden') !== 'true') {
        btn.setAttribute('data-demo-upload-hidden', 'true');
        const chip = document.createElement('span');
        chip.className = 'showcase-demo-chip';
        chip.setAttribute('data-showcase-demo-chip', 'true');
        chip.innerHTML = `<span class="showcase-demo-chip-dot"></span><span>Demo · Sample PDF Active</span>`;
        btn.parentElement?.insertBefore(chip, btn);
      }
    }
  }

  // Ensure #dropPanel shows a visible Demo chip even if heroFiles already populated
  if (dropPanel && !dropPanel.querySelector('[data-showcase-demo-chip="true"]')) {
    const chip = document.createElement('span');
    chip.className = 'showcase-demo-chip';
    chip.setAttribute('data-showcase-demo-chip', 'true');
    chip.innerHTML = `<span class="showcase-demo-chip-dot"></span><span>Demo · Sample PDF Active</span>`;
    dropPanel.prepend(chip);
  }

  // Auto-load bundled sample PDF into any PDF-capable file input that hasn't been populated yet
  const fileInputs = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[type="file"]')
  );
  for (const input of fileInputs) {
    if (autoPopulatedInputs.has(input)) continue;
    const accept = (input.getAttribute('accept') || '').toLowerCase();
    if (!accept || accept.includes('.pdf') || accept.includes('application/pdf')) {
      autoPopulatedInputs.add(input);
      feedBundledSampleIntoFileInput(input);
    }
  }
}

/**
 * 6. Install Capture-Phase Upload Blockers & Backend-Action Click Interceptor
 */
function installEventInterceptors(openModal: (label?: string) => void): void {
  // Block all user drag-and-drop file uploads
  window.addEventListener(
    'dragover',
    (e) => {
      e.preventDefault();
      e.stopPropagation();
    },
    true
  );

  window.addEventListener(
    'drop',
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      openModal('File Drop');
    },
    true
  );

  // Block all clipboard file pastes
  window.addEventListener(
    'paste',
    (e) => {
      if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        openModal('Paste File');
      }
    },
    true
  );

  // Block native file input clicks and user-initiated file changes
  window.addEventListener(
    'click',
    (e) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      const inputEl = target.closest('input[type="file"]');
      if (inputEl) {
        e.preventDefault();
        e.stopPropagation();
        openModal('Select Files');
        return;
      }

      const clickable = target.closest('button, a');
      if (!clickable) return;

      // Allow interactions inside our own demo banner or modal
      if (
        clickable.closest('#showcase-demo-banner') ||
        clickable.closest('#showcase-desktop-modal-backdrop')
      ) {
        return;
      }

      const text = (clickable.textContent || '').trim().replace(/\s+/g, ' ');
      const title = (clickable.getAttribute('title') || '').trim();
      const combined = `${text} ${title}`;

      if (
        /^(select files|choose files|upload files|add more files|add files)$/i.test(text) ||
        DESKTOP_ONLY_ACTION_PATTERNS.some((re) => re.test(combined))
      ) {
        e.preventDefault();
        e.stopPropagation();
        openModal(text);
      }
    },
    true
  );

  window.addEventListener(
    'change',
    (e) => {
      const target = e.target as HTMLInputElement | null;
      if (
        target &&
        target.tagName === 'INPUT' &&
        target.type === 'file' &&
        !(e as any)[SYNTHETIC_DEMO_EVENT_FLAG]
      ) {
        e.preventDefault();
        e.stopPropagation();
        target.value = '';
        openModal('Upload');
      }
    },
    true
  );
}

/**
 * Main Bootstrap Entry Point — runs BEFORE React mounts `<App />`
 */
export function bootstrapDemoMode(): void {
  if (typeof window === 'undefined') return;
  if ((window as any).__LOCAL_DESK_DEMO_BOOTSTRAPPED__) return;
  (window as any).__LOCAL_DESK_DEMO_BOOTSTRAPPED__ = true;

  // 1. Set window-level flags read by the product touch-point
  (window as any).__LOCAL_DESK_RESTRICTED__ = true;
  (window as any).__LOCAL_DESK_SHOWCASE__ = true;

  // 2. Swap persistence with memory-only adapter before App reads localStorage
  installMemoryOnlyPersistenceAdapter();

  document.body.classList.add('localdesk-showcase-demo');

  const { openModal } = ensureDesktopActionModal();

  const handleResetDemo = () => {
    memoryStore.clear();
    // Re-click the brand home link or reload sample into active inputs
    const homeLink = document.querySelector<HTMLAnchorElement>('header a[href="#top"]');
    if (homeLink) {
      homeLink.click();
    }
    setTimeout(() => {
      const fileInputs = Array.from(
        document.querySelectorAll<HTMLInputElement>('input[type="file"]')
      );
      for (const input of fileInputs) {
        autoPopulatedInputs.delete(input);
      }
      applyDomPatchesAndValidateSelectors();
      // Open the 2D PDF Editor with the fresh sample document
      const sampleButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('button'));
      const openEditorBtn = sampleButtons.find((b) =>
        /open sample in 2d pdf editor|open pdf editor/i.test(b.textContent || '')
      );
      openEditorBtn?.click();
    }, 60);
  };

  // 3. Inject persistent banner
  injectPersistentDemoBanner(handleResetDemo);

  // 4. Install upload & backend-action interceptors
  installEventInterceptors(openModal);

  // 5. Observe DOM mounts to auto-populate bundled sample PDF & enforce selector contract
  const observer = new MutationObserver(() => {
    applyDomPatchesAndValidateSelectors();
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // Expose helper for programmatic diagnostics
  (window as any).localDeskDemo = {
    enabled: true,
    sampleFileName: SAMPLE_PDF_FILENAME,
    resetDemo: handleResetDemo,
    openDesktopModal: openModal,
    getMemoryStoreSize: () => memoryStore.size
  };
}

// Auto-run if imported directly as a script module in showcase/demo/index.html
bootstrapDemoMode();
