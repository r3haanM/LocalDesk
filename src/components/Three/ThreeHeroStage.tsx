import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  EyeOff,
  ShieldAlert,
  Lock,
  Layers,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Files,
  Sparkles
} from 'lucide-react';

export type HeroChoreographyMode = 'explode' | 'merge' | 'vault' | 'redact';
export type HeroMaterialFinish = 'paper' | 'glass' | 'titanium';

interface ThreeHeroStageProps {
  onLaunchEditorSample: () => void;
  onSelectToolById: (toolId: string) => void;
  isDropzoneActive?: boolean;
}

// Pre-allocated math helpers outside render loop (zero GC)
const _targetScale = new THREE.Vector3();

function detectSoftwareWebGL(): boolean {
  try {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function createProceduralPageTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1320;
  const ctx = canvas.getContext('2d')!;

  // Warm archival paper substrate
  ctx.fillStyle = '#F7F5F0';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Subtle technical grid lines
  ctx.strokeStyle = 'rgba(24, 24, 32, 0.05)';
  ctx.lineWidth = 1;
  for (let x = 64; x < canvas.width; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 64; y < canvas.height; y += 64) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  // Header specification bar
  ctx.fillStyle = '#18181B';
  ctx.fillRect(72, 68, 880, 6);

  ctx.fillStyle = '#6D28D9';
  ctx.font = 'bold 26px monospace';
  ctx.fillText('ISO-32000 · VELLUM OBJECT STREAM [PAGE 01]', 72, 118);

  ctx.fillStyle = '#71717A';
  ctx.font = '22px monospace';
  ctx.fillText('612 × 792 PT · NATIVE STREAM', 600, 118);

  // Simulated body typography paragraphs
  ctx.fillStyle = '#27272A';
  ctx.font = 'bold 34px sans-serif';
  ctx.fillText('01. Executive Systems Architecture', 72, 200);

  ctx.fillStyle = '#52525B';
  const lines = [
    'Every PDF page in Vellum is parsed into discrete, inspectable',
    'object layers: native BT/ET text runs, XObject vector diagrams,',
    'cryptographic SHA-256 lock manifests, and stream redactions.',
    'Click any floating 3D layer above to launch its 2D workspace.'
  ];
  ctx.font = '24px sans-serif';
  lines.forEach((line, idx) => {
    ctx.fillText(line, 72, 252 + idx * 38);
  });

  // Footer rule
  ctx.fillStyle = '#D4D4D8';
  ctx.fillRect(72, 1210, 880, 3);
  ctx.fillStyle = '#52525B';
  ctx.font = '22px monospace';
  ctx.fillText('VELLUM STUDIO · ZERO-RETENTION LOCAL ENGINE', 72, 1252);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

function createTextLayerTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 220;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#1E1B4B';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = '#8B5CF6';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);

  ctx.fillStyle = '#C4B5FD';
  ctx.font = 'bold 24px monospace';
  ctx.fillText('BT /F1 14 Tf (Native Editable Text Stream) Tj ET', 28, 54);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 38px sans-serif';
  ctx.fillText('Quarterly Infrastructure & Security Audit', 28, 118);

  ctx.fillStyle = '#A78BFA';
  ctx.font = '22px monospace';
  ctx.fillText('Click to Open 2D PDF Editor · Direct Glyph Stream', 28, 174);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

function createRedactLayerTexture(maxAnisotropy: number, isRedacted: boolean): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 180;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = isRedacted ? '#09090B' : '#27121B';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = '#F43F5E';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);

  ctx.fillStyle = '#FB7185';
  ctx.font = 'bold 22px monospace';
  ctx.fillText(
    isRedacted
      ? 'STREAM SANITIZED · BYTES PURGED [FOIA (b)(6)]'
      : 'SENSITIVE PII RECORD · CLICK TO REDACT STREAM',
    28,
    52
  );

  ctx.fillStyle = isRedacted ? '#F43F5E' : '#FFE4E6';
  ctx.font = 'bold 32px monospace';
  ctx.fillText(
    isRedacted
      ? '████████████████████ [REDACTED]'
      : 'Custodian: Elena Rostova (VK-9920)',
    28,
    120
  );

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

function createSatelliteSheetTexture(maxAnisotropy: number, pageNumber: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 660;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#F4F4F6';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#7C3AED';
  ctx.fillRect(36, 36, 440, 8);

  ctx.fillStyle = '#18181B';
  ctx.font = 'bold 26px monospace';
  ctx.fillText(`PAGE 0${pageNumber} · MERGE STREAM`, 36, 86);

  ctx.fillStyle = '#A1A1AA';
  for (let i = 0; i < 8; i++) {
    ctx.fillRect(36, 130 + i * 44, i % 3 === 2 ? 290 : 420, 14);
  }

  ctx.strokeStyle = '#7C3AED';
  ctx.lineWidth = 3;
  ctx.strokeRect(36, 500, 440, 110);
  ctx.fillStyle = '#6D28D9';
  ctx.font = 'bold 20px monospace';
  ctx.fillText('SPRING REORDER & MERGE READY', 58, 562);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(128, 128, 12, 128, 128, 120);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
  grad.addColorStop(0.6, 'rgba(0, 0, 0, 0.22)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

export const ThreeHeroStage: React.FC<ThreeHeroStageProps> = ({
  onLaunchEditorSample,
  onSelectToolById,
  isDropzoneActive = false
}) => {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);

  const [choreography, setChoreography] = useState<HeroChoreographyMode>('explode');
  const [finish, setFinish] = useState<HeroMaterialFinish>('paper');
  const [explodeFactor, setExplodeFactor] = useState<number>(0.65);
  const [vectorHidden, setVectorHidden] = useState<boolean>(false);
  const [streamRedacted, setStreamRedacted] = useState<boolean>(true);
  const [dockCollapsed, setDockCollapsed] = useState<boolean>(false);
  const [hoveredLayerName, setHoveredLayerName] = useState<string>('3D Document Architecture Studio');
  const [webglAvailable, setWebglAvailable] = useState<boolean>(true);

  // Mutable state ref for the WebGL animation loop without tearing down canvas
  const stateRef = useRef({
    choreography: 'explode' as HeroChoreographyMode,
    finish: 'paper' as HeroMaterialFinish,
    explodeFactor: 0.65,
    vectorHidden: false,
    streamRedacted: true,
    isDropzoneActive: false
  });

  useEffect(() => {
    stateRef.current.choreography = choreography;
    stateRef.current.finish = finish;
    stateRef.current.explodeFactor = explodeFactor;
    stateRef.current.vectorHidden = vectorHidden;
    stateRef.current.streamRedacted = streamRedacted;
    stateRef.current.isDropzoneActive = isDropzoneActive;
  }, [choreography, finish, explodeFactor, vectorHidden, streamRedacted, isDropzoneActive]);

  const redactMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const pageFrontMatRef = useRef<THREE.MeshPhysicalMaterial | null>(null);
  const frameMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const maxAnisoRef = useRef<number>(1);
  const resetCameraRef = useRef<(() => void) | null>(null);

  // Update redaction texture dynamically when streamRedacted toggles
  useEffect(() => {
    if (!redactMaterialRef.current) return;
    const oldTex = redactMaterialRef.current.map;
    const nextTex = createRedactLayerTexture(maxAnisoRef.current, streamRedacted);
    redactMaterialRef.current.map = nextTex;
    redactMaterialRef.current.needsUpdate = true;
    oldTex?.dispose();
  }, [streamRedacted]);

  // Update substrate material finish dynamically when finish changes
  useEffect(() => {
    const pageMat = pageFrontMatRef.current;
    const frameMat = frameMatRef.current;
    if (!pageMat || !frameMat) return;

    if (finish === 'paper') {
      pageMat.color.setHex(0xffffff);
      pageMat.roughness = 0.45;
      pageMat.metalness = 0.04;
      pageMat.clearcoat = 0.05;
      frameMat.color.setHex(0x27272a);
      frameMat.metalness = 0.82;
      frameMat.roughness = 0.24;
    } else if (finish === 'glass') {
      pageMat.color.setHex(0xede9fe);
      pageMat.roughness = 0.12;
      pageMat.metalness = 0.15;
      pageMat.clearcoat = 1.0;
      frameMat.color.setHex(0x4c1d95);
      frameMat.metalness = 0.9;
      frameMat.roughness = 0.12;
    } else {
      // titanium
      pageMat.color.setHex(0xd4d4d8);
      pageMat.roughness = 0.22;
      pageMat.metalness = 0.68;
      pageMat.clearcoat = 0.6;
      frameMat.color.setHex(0x52525b);
      frameMat.metalness = 0.96;
      frameMat.roughness = 0.14;
    }
    pageMat.needsUpdate = true;
    frameMat.needsUpdate = true;
  }, [finish]);

  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isMobileViewport = typeof window !== 'undefined' && window.innerWidth < 768;

    const width = Math.max(container.clientWidth, 300);
    const height = Math.max(container.clientHeight, 380);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0c12);
    scene.fog = new THREE.FogExp2(0x0b0c12, 0.042);

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(2.55, 2.05, 5.45);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl && !isMobileViewport,
        powerPreference: 'high-performance'
      });
    } catch {
      setWebglAvailable(false);
      return;
    }

    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.14;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
    maxAnisoRef.current = maxAnisotropy;

    // Mandatory RoomEnvironment studio reflection
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    pmremGenerator.dispose();

    // 3-Point Warm/Cool Studio Lighting Rig
    const hemiLight = new THREE.HemisphereLight(0xc4b5fd, 0x18181b, 0.9);
    hemiLight.position.set(0, 10, 0);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff7ed, 2.25);
    keyLight.position.set(4, 6, 5);
    keyLight.castShadow = !isSoftwareGl;
    const d = 4.5;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x8b5cf6, 1.5);
    rimLight.position.set(-4, 3, -4);
    scene.add(rimLight);

    // OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.minDistance = 2.8;
    controls.maxDistance = 9.0;
    controls.maxPolarAngle = Math.PI / 2 + 0.15;
    controls.target.set(0, 0.15, 0);

    resetCameraRef.current = () => {
      camera.position.set(2.55, 2.05, 5.45);
      controls.target.set(0, 0.15, 0);
      controls.update();
    };

    // Ground Contact Shadow Plane (offset on Y to avoid Z-fighting)
    const shadowTex = createContactShadowTexture();
    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(5.8, 5.8),
      new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        depthWrite: false,
        opacity: 0.52
      })
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -1.72;
    scene.add(shadowPlane);

    // =========================================================================
    // COMPOSITE 10-PART 3D DOCUMENT ASSEMBLY (THREE.Group)
    // =========================================================================
    const assemblyGroup = new THREE.Group();
    scene.add(assemblyGroup);

    const interactiveMeshes: THREE.Object3D[] = [];

    // Part 1: Beveled Metallic Titanium Document Frame / Backplate
    const frameShape = new THREE.Shape();
    const fw = 2.45;
    const fh = 3.15;
    frameShape.moveTo(-fw / 2, -fh / 2);
    frameShape.lineTo(fw / 2, -fh / 2);
    frameShape.lineTo(fw / 2, fh / 2);
    frameShape.lineTo(-fw / 2, fh / 2);
    frameShape.closePath();

    const frameGeo = new THREE.ExtrudeGeometry(frameShape, {
      depth: 0.06,
      bevelEnabled: true,
      bevelSegments: 3,
      steps: 1,
      bevelSize: 0.03,
      bevelThickness: 0.03
    });
    frameGeo.center();
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x27272a,
      metalness: 0.85,
      roughness: 0.22
    });
    frameMatRef.current = frameMat;
    const backFrameMesh = new THREE.Mesh(frameGeo, frameMat);
    backFrameMesh.castShadow = true;
    backFrameMesh.receiveShadow = true;
    backFrameMesh.userData = { layerType: 'substrate', label: 'ISO-32000 Container Backplate' };
    assemblyGroup.add(backFrameMesh);

    // Part 2: Primary Vellum PDF Page Sheet with Procedural High-DPI Canvas Texture
    const pageTex = createProceduralPageTexture(maxAnisotropy);
    const pageGeo = new THREE.BoxGeometry(2.34, 3.02, 0.035);
    const pageEdgeMat = new THREE.MeshStandardMaterial({
      color: 0xe4e4e7,
      roughness: 0.6,
      metalness: 0.05
    });
    const pageFrontMat = new THREE.MeshPhysicalMaterial({
      map: pageTex,
      roughness: 0.45,
      metalness: 0.04,
      clearcoat: 0.05
    });
    pageFrontMatRef.current = pageFrontMat;
    const pageMesh = new THREE.Mesh(pageGeo, [
      pageEdgeMat,
      pageEdgeMat,
      pageEdgeMat,
      pageEdgeMat,
      pageFrontMat,
      pageEdgeMat
    ]);
    pageMesh.castShadow = true;
    pageMesh.receiveShadow = true;
    pageMesh.userData = {
      layerType: 'text',
      label: 'Primary PDF Page Canvas (Click to Launch 2D Editor)'
    };
    assemblyGroup.add(pageMesh);
    interactiveMeshes.push(pageMesh);

    // Part 3: Floating Native Text Stream Layer (BT ... ET)
    const textTex = createTextLayerTexture(maxAnisotropy);
    const textGeo = new THREE.BoxGeometry(2.05, 0.58, 0.045);
    const textSideMat = new THREE.MeshStandardMaterial({
      color: 0x6d28d9,
      roughness: 0.3,
      metalness: 0.4
    });
    const textFrontMat = new THREE.MeshStandardMaterial({
      map: textTex,
      roughness: 0.25,
      metalness: 0.15
    });
    const textLayerMesh = new THREE.Mesh(textGeo, [
      textSideMat,
      textSideMat,
      textSideMat,
      textSideMat,
      textFrontMat,
      textSideMat
    ]);
    textLayerMesh.position.set(0, 0.62, 0.25);
    textLayerMesh.castShadow = true;
    textLayerMesh.userData = {
      layerType: 'text',
      label: 'Native Text Stream (Click to Edit PDF Text)'
    };
    assemblyGroup.add(textLayerMesh);
    interactiveMeshes.push(textLayerMesh);

    // Part 4 & 5: Sajda-Style Hideable XObject Vector Diagram Group (Multi-Part Subgroup)
    const vectorGroup = new THREE.Group();
    vectorGroup.position.set(-0.38, -0.1, 0.48);

    const vectorPlateGeo = new THREE.BoxGeometry(1.18, 0.62, 0.04);
    const vectorPlateMat = new THREE.MeshPhysicalMaterial({
      color: 0xf59e0b,
      roughness: 0.2,
      metalness: 0.7,
      clearcoat: 0.8
    });
    const vectorPlate = new THREE.Mesh(vectorPlateGeo, vectorPlateMat);
    vectorPlate.castShadow = true;
    vectorPlate.userData = {
      layerType: 'vector',
      label: 'Sajda XObject Vector Layer (Click to Toggle Visibility)'
    };
    vectorGroup.add(vectorPlate);
    interactiveMeshes.push(vectorPlate);

    const barHeights = [0.22, 0.38, 0.3, 0.46];
    const barMat = new THREE.MeshStandardMaterial({
      color: 0xfef3c7,
      metalness: 0.5,
      roughness: 0.25
    });
    barHeights.forEach((bh, idx) => {
      const barMesh = new THREE.Mesh(new THREE.BoxGeometry(0.14, bh, 0.08), barMat);
      barMesh.position.set(-0.34 + idx * 0.22, -0.15 + bh / 2, 0.05);
      barMesh.userData = {
        layerType: 'vector',
        label: 'Sajda XObject Vector Layer (Click to Toggle Visibility)'
      };
      vectorGroup.add(barMesh);
      interactiveMeshes.push(barMesh);
    });
    assemblyGroup.add(vectorGroup);

    // Part 6: Cryptographic SHA-256 Password & Signature Emblem (Metallic Torus + Core)
    const lockGroup = new THREE.Group();
    lockGroup.position.set(0.65, -0.1, 0.52);

    const ringGeo = new THREE.TorusGeometry(0.24, 0.045, 16, 48);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      metalness: 0.92,
      roughness: 0.14
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.castShadow = true;
    ringMesh.userData = {
      layerType: 'lock',
      label: 'SHA-256 Batch Lock & Unlock Engine (Click to Launch)'
    };
    lockGroup.add(ringMesh);
    interactiveMeshes.push(ringMesh);

    const coreGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.06, 32);
    coreGeo.rotateX(Math.PI / 2);
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0x064e3b,
      metalness: 0.65,
      roughness: 0.3
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    coreMesh.userData = {
      layerType: 'lock',
      label: 'SHA-256 Batch Lock & Unlock Engine (Click to Launch)'
    };
    lockGroup.add(coreMesh);
    interactiveMeshes.push(coreMesh);
    assemblyGroup.add(lockGroup);

    // Part 7: Permanent Stream Redaction Bar + Laser Sweep Bar
    const redactTex = createRedactLayerTexture(maxAnisotropy, stateRef.current.streamRedacted);
    const redactGeo = new THREE.BoxGeometry(2.05, 0.48, 0.05);
    const redactSideMat = new THREE.MeshStandardMaterial({
      color: 0xe11d48,
      roughness: 0.35,
      metalness: 0.3
    });
    const redactFrontMat = new THREE.MeshStandardMaterial({
      map: redactTex,
      roughness: 0.3,
      metalness: 0.1
    });
    redactMaterialRef.current = redactFrontMat;

    const redactMesh = new THREE.Mesh(redactGeo, [
      redactSideMat,
      redactSideMat,
      redactSideMat,
      redactSideMat,
      redactFrontMat,
      redactSideMat
    ]);
    redactMesh.position.set(0, -0.82, 0.68);
    redactMesh.castShadow = true;
    redactMesh.userData = {
      layerType: 'redact',
      label: 'Permanent Stream Redaction Layer (Click to Toggle Purge)'
    };
    assemblyGroup.add(redactMesh);
    interactiveMeshes.push(redactMesh);

    // Part 8: Translucent Optical Vault Shield (Active in 'vault' mode)
    const vaultGlassMat = new THREE.MeshPhysicalMaterial({
      color: 0x10b981,
      roughness: 0.12,
      metalness: 0.1,
      clearcoat: 1.0,
      transparent: true,
      opacity: 0.0,
      depthWrite: false
    });
    const vaultShieldMesh = new THREE.Mesh(new THREE.BoxGeometry(2.48, 3.16, 0.04), vaultGlassMat);
    vaultShieldMesh.position.set(0, 0, 1.05);
    vaultShieldMesh.renderOrder = 10;
    assemblyGroup.add(vaultShieldMesh);

    // Part 9 & 10: Orbiting Satellite Pages for 'merge' & Dropzone Magnetization Choreography
    const satTex2 = createSatelliteSheetTexture(maxAnisotropy, 2);
    const satTex3 = createSatelliteSheetTexture(maxAnisotropy, 3);
    const satGeo = new THREE.BoxGeometry(1.45, 1.88, 0.028);

    const satMeshLeft = new THREE.Mesh(
      satGeo,
      new THREE.MeshStandardMaterial({
        map: satTex2,
        roughness: 0.38,
        metalness: 0.08
      })
    );
    satMeshLeft.position.set(-1.75, 0.35, -0.45);
    satMeshLeft.rotation.set(0.05, 0.38, 0.12);
    satMeshLeft.userData = {
      layerType: 'merge',
      label: 'Page 02 Satellite Sheet (Click to Open Merge & Organize)'
    };
    assemblyGroup.add(satMeshLeft);
    interactiveMeshes.push(satMeshLeft);

    const satMeshRight = new THREE.Mesh(
      satGeo,
      new THREE.MeshStandardMaterial({
        map: satTex3,
        roughness: 0.38,
        metalness: 0.08
      })
    );
    satMeshRight.position.set(1.75, -0.25, -0.55);
    satMeshRight.rotation.set(-0.05, -0.38, -0.12);
    satMeshRight.userData = {
      layerType: 'merge',
      label: 'Page 03 Satellite Sheet (Click to Open Merge & Organize)'
    };
    assemblyGroup.add(satMeshRight);
    interactiveMeshes.push(satMeshRight);

    // Raycasting for Interactive Hover & Click on 3D Document Layers
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let lastRaycastTime = 0;

    const onPointerMove = (e: PointerEvent) => {
      const now = performance.now();
      if (now - lastRaycastTime < 45) return;
      lastRaycastTime = now;

      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(interactiveMeshes, false);
      if (hits.length > 0) {
        const label = hits[0].object.userData?.label;
        if (label) setHoveredLayerName(label);
        renderer.domElement.style.cursor = 'pointer';
      } else {
        setHoveredLayerName('Drag to Orbit 3D · Click Any Layer to Launch Tool');
        renderer.domElement.style.cursor = 'grab';
      }
    };

    const onPointerClick = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(interactiveMeshes, false);
      if (hits.length > 0) {
        const lType = hits[0].object.userData?.layerType;
        if (lType === 'vector') {
          setVectorHidden((prev) => !prev);
        } else if (lType === 'redact') {
          setStreamRedacted((prev) => !prev);
          setChoreography('redact');
        } else if (lType === 'lock') {
          setChoreography('vault');
          onSelectToolById('batch-process');
        } else if (lType === 'merge') {
          setChoreography('merge');
          onSelectToolById('organize-pages');
        } else if (lType === 'text') {
          onLaunchEditorSample();
        }
      }
    };

    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('click', onPointerClick);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    const handleResize = () => {
      if (!container) return;
      const w = Math.max(container.clientWidth, 280);
      const h = Math.max(container.clientHeight, 340);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // Animation Loop with Software-WebGL Fence Pacing & Smooth Exponential Damping
    const clock = new THREE.Clock();
    let frameId = 0;
    let disposed = false;

    function afterDraw(cb: () => void) {
      if (disposed) return;
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (gl && typeof gl.fenceSync === 'function') {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (disposed) return;
          const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if (state === gl.UNSIGNALED) {
            frameId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            frameId = window.setTimeout(cb, 80);
          }
        };
        frameId = window.setTimeout(poll, 5);
      } else {
        frameId = window.setTimeout(cb, 80);
      }
    }

    function tick() {
      if (disposed) return;
      const dt = Math.min(clock.getDelta(), 0.1);
      const elapsed = clock.getElapsedTime();

      const {
        choreography: mode,
        explodeFactor: exp,
        vectorHidden: vHide,
        isDropzoneActive: dropActive
      } = stateRef.current;

      // Dropzone magnetization: when dragging files over Hero dropzone, expand and elevate!
      const effectiveSpread = dropActive
        ? 1.35
        : mode === 'vault'
        ? 0.28
        : mode === 'merge'
        ? 0.45
        : Math.max(0.15, exp);

      if (!prefersReducedMotion) {
        const floatAmp = dropActive ? 0.12 : 0.06;
        assemblyGroup.position.y = Math.sin(elapsed * (dropActive ? 2.6 : 1.4)) * floatAmp;
        const targetRotY = dropActive
          ? -0.22
          : Math.sin(elapsed * 0.45) * 0.14;
        assemblyGroup.rotation.y = THREE.MathUtils.damp(
          assemblyGroup.rotation.y,
          targetRotY,
          4,
          dt
        );
      } else {
        assemblyGroup.position.y = 0;
        assemblyGroup.rotation.y = 0;
      }

      // Smoothly damp Z-separation of each layer
      backFrameMesh.position.z = THREE.MathUtils.damp(
        backFrameMesh.position.z,
        -0.14 * effectiveSpread,
        6,
        dt
      );
      pageMesh.position.z = THREE.MathUtils.damp(pageMesh.position.z, 0, 6, dt);

      const textTargetZ = 0.34 * effectiveSpread;
      textLayerMesh.position.z = THREE.MathUtils.damp(textLayerMesh.position.z, textTargetZ, 6, dt);

      const vecTargetZ = 0.58 * effectiveSpread;
      vectorGroup.position.z = THREE.MathUtils.damp(vectorGroup.position.z, vecTargetZ, 6, dt);

      // Sajda-style object hide toggle scales & fades the 3D vector group
      const vecScale = vHide ? 0.01 : 1;
      _targetScale.set(vecScale, vecScale, vecScale);
      vectorGroup.scale.lerp(_targetScale, 1 - Math.exp(-8 * dt));
      vectorGroup.visible = vectorGroup.scale.x > 0.03;

      // Lock Group Choreography
      const lockTargetZ = (mode === 'vault' ? 0.92 : 0.66 * effectiveSpread);
      const lockTargetX = mode === 'vault' ? 0 : 0.65;
      const lockTargetY = mode === 'vault' ? 0 : -0.1;
      lockGroup.position.x = THREE.MathUtils.damp(lockGroup.position.x, lockTargetX, 6, dt);
      lockGroup.position.y = THREE.MathUtils.damp(lockGroup.position.y, lockTargetY, 6, dt);
      lockGroup.position.z = THREE.MathUtils.damp(lockGroup.position.z, lockTargetZ, 6, dt);
      const lockScale = mode === 'vault' ? 1.55 : 1.0;
      _targetScale.set(lockScale, lockScale, lockScale);
      lockGroup.scale.lerp(_targetScale, 1 - Math.exp(-6 * dt));
      if (!prefersReducedMotion) {
        ringMesh.rotation.z = elapsed * (mode === 'vault' ? 2.2 : 0.8);
      }

      // Vault Shield Choreography
      const targetVaultOpacity = mode === 'vault' ? 0.28 : 0.0;
      vaultGlassMat.opacity = THREE.MathUtils.damp(vaultGlassMat.opacity, targetVaultOpacity, 6, dt);
      vaultShieldMesh.visible = vaultGlassMat.opacity > 0.01;
      vaultShieldMesh.position.z = THREE.MathUtils.damp(
        vaultShieldMesh.position.z,
        mode === 'vault' ? 0.55 : 1.25,
        6,
        dt
      );

      // Redaction Layer Choreography
      const redactTargetZ = (mode === 'redact' ? 1.05 : 0.86 * effectiveSpread);
      redactMesh.position.z = THREE.MathUtils.damp(redactMesh.position.z, redactTargetZ, 6, dt);

      // Satellite Pages Choreography (Merge Mode vs Orbiting vs Dropzone Fan)
      if (mode === 'merge') {
        const mergeWave = prefersReducedMotion ? 0 : (Math.sin(elapsed * 2.1) + 1) * 0.5;
        satMeshLeft.position.x = THREE.MathUtils.damp(
          satMeshLeft.position.x,
          THREE.MathUtils.lerp(-1.65, -0.08, mergeWave),
          6,
          dt
        );
        satMeshLeft.position.y = THREE.MathUtils.damp(
          satMeshLeft.position.y,
          THREE.MathUtils.lerp(0.4, 0.06, mergeWave),
          6,
          dt
        );
        satMeshLeft.position.z = THREE.MathUtils.damp(
          satMeshLeft.position.z,
          THREE.MathUtils.lerp(0.35, -0.06, mergeWave),
          6,
          dt
        );
        satMeshLeft.rotation.z = THREE.MathUtils.damp(
          satMeshLeft.rotation.z,
          THREE.MathUtils.lerp(0.18, 0.02, mergeWave),
          6,
          dt
        );

        satMeshRight.position.x = THREE.MathUtils.damp(
          satMeshRight.position.x,
          THREE.MathUtils.lerp(1.65, 0.08, mergeWave),
          6,
          dt
        );
        satMeshRight.position.y = THREE.MathUtils.damp(
          satMeshRight.position.y,
          THREE.MathUtils.lerp(-0.35, -0.06, mergeWave),
          6,
          dt
        );
        satMeshRight.position.z = THREE.MathUtils.damp(
          satMeshRight.position.z,
          THREE.MathUtils.lerp(0.45, -0.1, mergeWave),
          6,
          dt
        );
        satMeshRight.rotation.z = THREE.MathUtils.damp(
          satMeshRight.rotation.z,
          THREE.MathUtils.lerp(-0.18, -0.02, mergeWave),
          6,
          dt
        );
      } else {
        const fanOut = dropActive ? 2.05 : 1.68;
        satMeshLeft.position.x = THREE.MathUtils.damp(satMeshLeft.position.x, -fanOut, 5, dt);
        satMeshLeft.position.y = THREE.MathUtils.damp(
          satMeshLeft.position.y,
          0.35 + (prefersReducedMotion ? 0 : Math.cos(elapsed * 1.2) * 0.08),
          5,
          dt
        );
        satMeshLeft.position.z = THREE.MathUtils.damp(satMeshLeft.position.z, -0.45, 5, dt);
        satMeshLeft.rotation.z = THREE.MathUtils.damp(satMeshLeft.rotation.z, 0.14, 5, dt);

        satMeshRight.position.x = THREE.MathUtils.damp(satMeshRight.position.x, fanOut, 5, dt);
        satMeshRight.position.y = THREE.MathUtils.damp(
          satMeshRight.position.y,
          -0.28 + (prefersReducedMotion ? 0 : Math.sin(elapsed * 1.2) * 0.08),
          5,
          dt
        );
        satMeshRight.position.z = THREE.MathUtils.damp(satMeshRight.position.z, -0.55, 5, dt);
        satMeshRight.rotation.z = THREE.MathUtils.damp(satMeshRight.rotation.z, -0.14, 5, dt);
      }

      controls.update();
      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('click', onPointerClick);
      controls.dispose();
      envTarget.dispose();
      pageTex.dispose();
      textTex.dispose();
      redactTex.dispose();
      satTex2.dispose();
      satTex3.dispose();
      shadowTex.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div className="lg:col-span-5 flex flex-col justify-between rounded-xl bg-theme-surface border border-theme-subtle relative overflow-hidden min-h-[500px]">
      {/* Top Spec Header Strip (Unobstructed Center Viewport Below) */}
      <div className="px-4 py-3 border-b border-theme-subtle flex flex-wrap items-center justify-between gap-2 text-xs z-10 bg-theme-surface">
        <div className="flex items-center gap-2 min-w-0">
          <Layers className="w-3.5 h-3.5 text-theme-accent shrink-0" />
          <span className="font-bold text-theme-primary truncate">{hoveredLayerName}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => resetCameraRef.current?.()}
            title="Reset 3D Camera"
            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-theme-elevated border border-theme-subtle text-[11px] font-semibold text-theme-secondary hover:text-theme-primary cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            Reset View
          </button>
        </div>
      </div>

      {/* Dedicated Isolated WebGL Canvas Container + Static Architectural Fallback */}
      {webglAvailable ? (
        <div
          ref={canvasMountRef}
          className="w-full flex-1 min-h-[360px] relative select-none"
        />
      ) : (
        <div className="w-full flex-1 min-h-[360px] p-6 bg-theme-canvas flex flex-col items-center justify-center space-y-4">
          <div className="w-full max-w-xs p-5 rounded-xl bg-theme-surface border border-theme-strong shadow-2xl space-y-3">
            <div className="text-[11px] font-mono text-theme-accent font-bold">
              ISO-32000 · STATIC ARCHITECTURAL FALLBACK
            </div>
            <div className="p-3 rounded-lg bg-theme-elevated border border-theme-subtle text-xs font-mono text-theme-primary">
              01. Native PDF Text Stream Layer
            </div>
            {!vectorHidden && (
              <div className="p-3 rounded-lg bg-theme-elevated border border-violet-500/40 text-xs font-mono text-violet-300">
                02. Sajda-Style XObject Vector Layer
              </div>
            )}
            <div className="p-3 rounded-lg bg-zinc-950 border border-rose-500/50 text-xs font-mono text-rose-400">
              03. {streamRedacted ? 'REDACTED STREAM [BYTES PURGED]' : 'Unredacted PII Token Layer'}
            </div>
            <button
              type="button"
              onClick={onLaunchEditorSample}
              className="w-full py-2 rounded-lg text-xs font-bold bg-theme-accent text-white cursor-pointer"
            >
              Open Sample in 2D PDF Editor
            </button>
          </div>
        </div>
      )}

      {/* Unified Collapsible Bottom Control Dock (Zero Viewport Occlusion, Zero Backdrop-Blur Over WebGL) */}
      <div className="z-10 border-t border-theme-subtle bg-theme-surface">
        <div className="px-4 py-1.5 flex items-center justify-between border-b border-theme-subtle text-[11px]">
          <span className="font-mono text-theme-secondary tabular-nums">
            HOMEPAGE 3D STUDIO · Z-SPREAD {Math.round(explodeFactor * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setDockCollapsed((prev) => !prev)}
            className="inline-flex items-center gap-1 font-semibold text-theme-secondary hover:text-theme-primary cursor-pointer"
          >
            {dockCollapsed ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                <span>Show 3D Controls</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                <span>Hide Controls</span>
              </>
            )}
          </button>
        </div>

        {!dockCollapsed && (
          <div className="p-3.5 space-y-3 text-xs">
            {/* Row 1: 3D Choreography Mode Selector + Substrate Finish */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1 bg-theme-elevated p-1 rounded-lg border border-theme-subtle">
                {(
                  [
                    { id: 'explode', label: 'Explode Layers', icon: Layers },
                    { id: 'merge', label: 'Merge 3D', icon: Files },
                    { id: 'vault', label: 'Vault Lock', icon: Lock },
                    { id: 'redact', label: 'Redact Sweep', icon: ShieldAlert }
                  ] as const
                ).map((item) => {
                  const Icon = item.icon;
                  const active = choreography === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setChoreography(item.id);
                        if (item.id === 'redact') {
                          setStreamRedacted(true);
                        }
                      }}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                        active
                          ? 'bg-theme-accent text-white'
                          : 'text-theme-secondary hover:text-theme-primary'
                      }`}
                    >
                      <Icon className="w-3 h-3" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Material Finish Switcher */}
              <div className="flex items-center gap-1 bg-theme-elevated p-1 rounded-lg border border-theme-subtle">
                {(
                  [
                    { id: 'paper', label: 'Paper' },
                    { id: 'glass', label: 'Glass' },
                    { id: 'titanium', label: 'Titanium' }
                  ] as const
                ).map((mat) => (
                  <button
                    key={mat.id}
                    type="button"
                    onClick={() => setFinish(mat.id)}
                    className={`px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      finish === mat.id
                        ? 'bg-theme-surface text-theme-primary font-bold shadow-2xs'
                        : 'text-theme-muted hover:text-theme-primary'
                    }`}
                  >
                    {mat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Row 2: Exploded View Slider & Direct Layer Toggles */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-theme-subtle">
              <div className="flex items-center gap-2 flex-1 min-w-[140px]">
                <label className="text-[11px] font-mono text-theme-secondary whitespace-nowrap">
                  Spread:
                </label>
                <input
                  type="range"
                  min={0.15}
                  max={1.35}
                  step={0.05}
                  value={explodeFactor}
                  onChange={(e) => {
                    setChoreography('explode');
                    setExplodeFactor(Number(e.target.value));
                  }}
                  className="w-full accent-violet-600 cursor-pointer"
                />
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setVectorHidden((prev) => !prev)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold border cursor-pointer whitespace-nowrap ${
                    vectorHidden
                      ? 'bg-amber-500/15 border-amber-500/50 text-amber-300'
                      : 'bg-theme-elevated border-theme-subtle text-theme-secondary hover:text-theme-primary'
                  }`}
                >
                  <EyeOff className="w-3 h-3" />
                  {vectorHidden ? 'Restore XObject' : 'Hide XObject'}
                </button>

                <button
                  type="button"
                  onClick={() => setStreamRedacted((prev) => !prev)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold border cursor-pointer whitespace-nowrap ${
                    streamRedacted
                      ? 'bg-rose-500/15 border-rose-500/50 text-rose-300'
                      : 'bg-theme-elevated border-theme-subtle text-theme-secondary hover:text-theme-primary'
                  }`}
                >
                  <Sparkles className="w-3 h-3" />
                  {streamRedacted ? 'PII Purged' : 'Expose PII'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
