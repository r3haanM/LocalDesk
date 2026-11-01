# Vellum Studio — Curated 12-Tool UI, Homepage-Exclusive 3D Stage & Motion Physics Upgrade

Streamline Vellum into a minimalist 12-tool PDF & Document Studio powered by **Motion (Framer Motion)** and **GSAP Flip** layout physics, while concentrating rich, improvised **Three.js 3D animations and spatial interactions exclusively on the Homepage** and keeping the PDF Editor and tool workspaces fast, surgical 2D environments.

### User Review & Critical Decisions

> [!IMPORTANT]
> This revised plan incorporates your feedback to keep all core improvements while populating and improvising 3D animations strictly on the **Homepage only**:

- **Confirmed Decision 1 — 3D Animations Strictly on the Homepage Only**: All Three.js WebGL scenes, 3D workflow simulations, and 3D spatial card tilt effects are populated **exclusively on the Homepage**. The PDF Editor, Page Organizer, and Batch Queue remain 100% pure, high-precision 2D workspaces so document editing is never obstructed by 3D cameras.
- **Confirmed Decision 2 — Improvised Homepage 3D Document Architecture Studio**: Upgrade the Homepage Hero 3D stage into an interactive multi-mode 3D showcase with a **Collapsible Bottom Control Dock** (`Explode Layers`, `Merge Simulation`, `Security Vault Lock`, `Redaction Sweep`, and `Material Finish` presets), reactive magnetic animation when dragging files over the Hero dropzone, and 3D perspective-tilt cards across the Homepage 12-tool grid.
- **Confirmed Decision 3 — Curated 12-Tool Core Catalog**: Prune the 36-tool catalog down to the **12 essential everyday tools** (`PDF Editor`, `Hide & Remove Objects`, `Merge PDF`, `Split PDF`, `Organize & Reorder Pages`, `Compress PDF`, `Batch Processing Queue`, `Protect & Lock PDF`, `Unlock PDF`, `Permanently Redact PDF`, `Word to PDF`, and `PDF to Word`).
- **Confirmed Decision 4 — Motion + GSAP Flip Spring Page Reordering in the 2D Editor**: Power the 2D PDF Editor's page rail and full-grid Page Sorter with **Motion** spring drag physics and **GSAP Flip** neighbor displacement for effortless visual page reordering.

---

### 1. Overview & Core Concept

- **What It Does**: Delivers an unforgettable, tactile **3D interactive Homepage** where users can visually explore how Vellum's PDF engine works in 3D space, paired with a focused 12-tool catalog and a pure 2D PDF Editor enhanced with spring-physics drag-and-drop page reordering.
- **Target Audience / Persona**: Users who want a visually striking, modern 3D homepage experience that immediately communicates document engineering quality, while relying on distraction-free 2D precision once inside the Editor or Batch Queue.
- **Key Value**: Best of both worlds—expressive 3D storytelling and spatial depth on the Homepage, combined with zero-clutter 12-tool navigation and silky 2D spring physics inside the document workspaces.

---

### 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Homepage Hero — Interactive 3D Document Architecture Stage + Magnetic Dropzone**:
     - The Homepage opens with a split Hero pairing the file upload dropzone on the left with a richly populated **Three.js 3D Document Studio Stage** on the right.
     - **Dropzone-to-3D Coupling**: Dragging files over the Hero dropzone triggers a live 3D reaction—the 3D document sheets magnetically levitate, fan out toward the cursor, and pulse their edge rim lighting until the files are dropped.
     - **Improvised 3D Workflow Modes (Collapsible Bottom Dock)**: A sleek, collapsible bottom dock inside the 3D viewport lets users trigger live 3D kinematic animations on the Homepage:
       - *Layer Explode*: Smoothly separates the 5 composite PDF layers (`Native Text Stream`, `Vector XObjects`, `AcroForm & Signature`, `SHA-256 Encryption Vault`, and `Stream Redaction Mask`) along the Z-axis using exponential damping.
       - *Merge & Sort Choreography*: Animates multiple floating 3D pages swirling in from surrounding space and interleaving into a bound document stack.
       - *Security Vault & Redaction Sweep*: Animates a translucent optical glass security shield (`MeshPhysicalMaterial`) locking over the document stack and purging marked redaction blocks.
       - *Material Finish Switcher*: Switches the 3D sheets between **Archival Matte Paper**, **Frosted Acrylic Glass**, and **Brushed Anodized Titanium** under studio `RoomEnvironment` PBR lighting.
     - **Click-to-Launch Raycasting**: Clicking any 3D sheet or floating tool node in the Homepage 3D stage launches that corresponding workspace directly (`PDF Editor`, `Object Manager`, `Merge PDF`, `Redact PDF`, or `Protect PDF`).
  2. **Homepage Curated 12-Tool Grid with 3D Spatial Tilt & GSAP Flip**:
     - Below the Hero, the streamlined **12-Tool Studio Grid** features interactive **3D perspective tilt cards** (spring-damped `rotateX` / `rotateY` and dynamic specular highlight tracking the cursor on the Homepage).
     - Clicking category filter tabs (`All 12 Tools`, `Edit & Objects`, `Organize`, `Security & Batch`, `Word & Convert`) uses **GSAP Flip** + **Motion `layoutId`** to smoothly morph the 12 cards into their filtered layout in under 200ms.
  3. **Pure 2D PDF Editor with Spring-Physics Page Reordering**:
     - Entering the PDF Editor unmounts the Homepage 3D WebGL context completely to dedicate 100% of GPU/CPU resources to crisp 2D PDF rendering and Sajda-style object editing.
     - Dragging any page thumbnail in the Left Page Rail—or opening the expandable **Full-Canvas Page Sorter Grid**—lifts the page with **Motion** spring physics (`scale: 1.04`, subtle velocity tilt) while neighboring pages smoothly slide into their new positions via **GSAP Flip** layout transitions.

- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Precision Architectural Studio (Obsidian dark default with Paper, Daylight, and Nord themes).
  - *Color Palette & Mood*:
    - **60% Dominant Neutral Canvas**: Deep Obsidian (`#090A0F` dark / `#F8FAFC` light).
    - **30% Structural Surfaces**: Single-elevation slate surfaces (`#11131C` dark / `#FFFFFF` light) with 1px hairline borders.
    - **10% Accent Budget**: Royal Violet (`#7C3AED`) for primary actions, active 3D raycast highlights, and spring drop slots; Emerald (`#10B981`) and Amber (`#F59E0B`) for semantic states.
  - *Typography & Hierarchy*:
    - **Display & UI Headings**: `Manrope` (600/700/800) with `text-wrap: balance`.
    - **Body Copy**: `Manrope` (400/500).
    - **Metrics & Tabular Data**: `JetBrains Mono` with `tabular-nums` for page numbers, coordinates, and batch counters.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1 — Strict Homepage-Only Boundary for 3D WebGL**
  - *Chosen Approach*: Mount the Three.js WebGL scene (`ThreeHeroStage`) and 3D perspective card effects exclusively inside the Homepage view, and cleanly dispose of WebGL resources (`renderer.dispose()`) when navigating into any 2D workspace.
  - *Why*: Gives the Homepage maximum visual wow-factor and interactive 3D depth while guaranteeing that actual PDF editing, redaction, and batch conversion stay rock-solid, fast, and distraction-free.

- **Decision 2 — Composite Procedural 3D Models & Software-WebGL Safety**
  - *Chosen Approach*: Construct each 3D document layer on the Homepage as a multi-part `THREE.Group` (beveled paper slab, metallic corner bindings, raised 3D content blocks, optical glass security frame, and crisp `SRGBColorSpace` procedural `CanvasTexture` diagrams with max anisotropy) lit by `RoomEnvironment` and a warm/cool 3-point rig, with automatic `isSoftwareGl` frame pacing (`afterDraw`) and static fallback support.
  - *Why*: Ensures 60fps performance on desktop GPUs and zero browser stalls on headless or integrated graphics environments.

- **Decision 3 — Hybrid Motion + GSAP Flip for 2D Page Reordering & Grid Reflows**
  - *Chosen Approach*: Combine **Motion (`motion/react`)** spring drag gestures with **GSAP (`gsap/Flip`)** layout state transitions for both the Homepage 12-tool category filter and the 2D PDF Editor's page reordering rail and grid sorter.
  - *Why*: Delivers physical, tactile feedback when dragging pages or filtering tools without layout jumps.

---

### 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:

```
┌────────────────────────────────────────────────────────────────────────────┐
│                        Vellum Studio Shell & Top Bar                       │
│   [Brand Wordmark]  ──  [4 Single-Line Nav Links]  ──  [Open PDF Editor]   │
└──────────────────┬──────────────────────────────────────┬──────────────────┘
                   │                                      │
                   ▼ (Homepage Only: 3D Active)           ▼ (Workspaces: Pure 2D)
┌─────────────────────────────────────┐  ┌───────────────────────────────────┐
│     Minimalist Studio Homepage      │  │   Active 2D Workspace Router      │
│  ┌───────────────────────────────┐  │  │  (Motion AnimatePresence Shell)   │
│  │ Magnetic Hero Dropzone        │  │  └────────┬─────────────────┬────────┘
│  │  └── Reactive State Bridge ───┼──┐           │                 │
│  ├───────────────────────────────┤  │           ▼                 ▼
│  │ Improvised Three.js 3D Stage  │◄─┘  ┌─────────────────┐ ┌───────────────┐
│  │  • 5 Composite 3D PDF Layers  │     │ 2D PDF Editor   │ │ Adaptive Tool │
│  │  • Modes: Explode / Merge /   │     │ Studio          │ │ & Batch Queue │
│  │    Vault Lock / Redact Sweep  │     │ ┌─────────────┐ │ │ Workspaces    │
│  │  • Material Finishes (PBR)    │     │ │ Spring Drag │ │ │ ┌───────────┐ │
│  │  • Collapsible Bottom Dock    │     │ │ Page Rail & │ │ │ │ GSAP Flip │ │
│  ├───────────────────────────────┤     │ │ Grid Sorter │ │ │ │ Page &    │ │
│  │ Curated 12-Tool Spatial Grid  │     │ └──────┬──────┘ │ │ │ Batch     │ │
│  │  • 3D Cursor Perspective Tilt │     │        ▼        │ │ │ Cards     │ │
│  │  • GSAP Flip Category Filter  │     │ ┌─────────────┐ │ │ └───────────┘ │
│  └───────────────────────────────┘     │ │ Pure 2D PDF │ │ └───────┬───────┘
└─────────────────────────────────────┘  │ │ Canvas +    │ │         │
                                         │ │ Sajda Layer │ │         │
                                         │ │ Inspector   │ │         │
                                         │ └──────┬──────┘ │         │
                                         └────────┼────────┘         │
                                                  ▼                  ▼
                                         ┌───────────────────────────────────┐
                                         │ Deterministic Document Engine     │
                                         │ (pdf-lib · pdfjs-dist · mammoth)  │
                                         └───────────────────────────────────┘
```

- **Data Model & State**:
  - **Homepage 3D Stage State**: Tracks active 3D choreography mode (`'explode' | 'merge' | 'vault' | 'redact'`), material preset (`'paper' | 'glass' | 'titanium'`), explode separation factor (`0.0` to `1.8`), dropzone hover magnetization (`isDropzoneActive: boolean`), hovered/selected 3D layer (`0–4`), and bottom dock collapse state (`isDockCollapsed: boolean`).
  - **Curated 12-Tool Catalog**: Stores the 12 core tool definitions with category metadata and direct 3D-layer-to-tool ID mapping.
  - **2D Editor Page Order & Undo Stack**: Tracks page sequence, rotation, and live drag insertion index (`draggedPageIdx`, `dropTargetIdx`) backed by `EditorHistoryEntry` snapshots.

- **Interactive Component & State Mapping**:
  - **Homepage Dropzone <-> 3D Stage Bridge**: Dragging a file over the Hero dropzone sets `isDropzoneActive = true`, causing the Three.js render loop to smoothly damp the 3D sheets into an open, welcoming fan formation with heightened rim lighting.
  - **Homepage 3D Bottom Control Dock**: Consolidates all 3D controls (Workflow Mode selector, Explode slider, Material finish toggles, and a `▾ Hide Controls` Zen toggle) at the bottom-center of the 3D stage with zero side-panel occlusion.
  - **Homepage 12-Tool Spatial Grid**: Uses pointer coordinates to compute subtle 3D card tilt on hover and `Flip.getState()` / `Flip.from()` when switching category tabs.
  - **2D Editor Spring Page Reordering**: Uses Motion spring drag physics and GSAP Flip layout transitions across both the Left Page Rail and the expandable multi-column Page Sorter overlay.
