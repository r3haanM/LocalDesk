import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Box, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';

export interface ThreeWorkspaceBannerProps {
  title: string;
  subtitle: string;
  mode: 'batch' | 'editor' | 'security' | 'converter' | 'organizer';
  fileCount: number;
  completedCount?: number;
  isProcessing?: boolean;
  progressPercent?: number;
  isPasswordLocked?: boolean;
  compactDefault?: boolean;
}

function detectSoftwareWebGL(): boolean {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') || probe.getContext('webgl');
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

function createFolioCoverTexture(
  maxAnisotropy: number,
  label: string,
  accentHex: string
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 660;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#F6F4EE';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Top accent bar
  ctx.fillStyle = accentHex;
  ctx.fillRect(36, 36, 440, 14);

  ctx.fillStyle = '#18181B';
  ctx.font = 'bold 26px monospace';
  ctx.fillText(label.slice(0, 24), 36, 94);

  // Simulated content lines
  ctx.fillStyle = '#71717A';
  for (let i = 0; i < 8; i++) {
    const w = i % 3 === 0 ? 340 : 410;
    ctx.fillRect(36, 140 + i * 44, w, 12);
  }

  // Bottom verification stamp
  ctx.strokeStyle = accentHex;
  ctx.lineWidth = 4;
  ctx.strokeRect(36, 540, 220, 64);
  ctx.fillStyle = accentHex;
  ctx.font = 'bold 20px monospace';
  ctx.fillText('ISO-32000 STREAM', 52, 580);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

export const ThreeWorkspaceBanner: React.FC<ThreeWorkspaceBannerProps> = ({
  title,
  subtitle,
  mode,
  fileCount,
  completedCount = 0,
  isProcessing = false,
  progressPercent = 0,
  isPasswordLocked = false,
  compactDefault = false
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [collapsed, setCollapsed] = useState<boolean>(compactDefault);
  const [spread, setSpread] = useState<number>(0.65);
  const [camPreset, setCamPreset] = useState<'iso' | 'front' | 'top'>('iso');

  const livePropsRef = useRef({
    fileCount,
    completedCount,
    isProcessing,
    progressPercent,
    isPasswordLocked,
    spread,
    camPreset
  });

  useEffect(() => {
    livePropsRef.current = {
      fileCount,
      completedCount,
      isProcessing,
      progressPercent,
      isPasswordLocked,
      spread,
      camPreset
    };
  }, [
    fileCount,
    completedCount,
    isProcessing,
    progressPercent,
    isPasswordLocked,
    spread,
    camPreset
  ]);

  useEffect(() => {
    if (collapsed) return;
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    const width = Math.max(container.clientWidth, 300);
    const height = 210;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0b0f);
    scene.fog = new THREE.FogExp2(0x0b0b0f, 0.055);

    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 80);
    camera.position.set(0, 1.8, 5.4);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance'
      });
    } catch {
      return;
    }

    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const maxAniso = renderer.capabilities.getMaxAnisotropy();

    // Studio Environment Reflection
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    pmrem.dispose();

    // Warm/Cool Studio Lights
    const hemi = new THREE.HemisphereLight(0xddd6fe, 0x18181b, 0.9);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff7ed, 2.1);
    keyLight.position.set(4, 6, 5);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x7c3aed, 1.5);
    rimLight.position.set(-4, 2, -3);
    scene.add(rimLight);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.enableZoom = false;
    controls.target.set(0, 0, 0);

    // Pedestal Ground Line Grid
    const gridHelper = new THREE.GridHelper(12, 24, 0x3f3f46, 0x1f1f26);
    gridHelper.position.y = -1.05;
    scene.add(gridHelper);

    // Build 5-Folio 3D Document Pipeline Group + Central Cryptographic Seal Ring
    const rootGroup = new THREE.Group();
    scene.add(rootGroup);

    const accentHex =
      mode === 'security'
        ? '#10B981'
        : mode === 'batch'
        ? '#8B5CF6'
        : mode === 'editor'
        ? '#F59E0B'
        : '#6366F1';

    const folioTex = createFolioCoverTexture(maxAniso, title.toUpperCase(), accentHex);
    const folioGeo = new THREE.BoxGeometry(1.15, 1.5, 0.045);
    const edgeMat = new THREE.MeshStandardMaterial({
      color: 0xd4d4d8,
      roughness: 0.5,
      metalness: 0.1
    });
    const coverMat = new THREE.MeshStandardMaterial({
      map: folioTex,
      roughness: 0.35,
      metalness: 0.05
    });

    const folios: THREE.Mesh[] = [];
    for (let i = 0; i < 5; i++) {
      const mesh = new THREE.Mesh(folioGeo, [
        edgeMat,
        edgeMat,
        edgeMat,
        edgeMat,
        coverMat,
        edgeMat
      ]);
      rootGroup.add(mesh);
      folios.push(mesh);
    }

    // Composite Security / Processing Torus Ring Assembly
    const ringGroup = new THREE.Group();
    const outerRingMat = new THREE.MeshStandardMaterial({
      color: 0x8b5cf6,
      metalness: 0.9,
      roughness: 0.16
    });
    const outerRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.95, 0.035, 16, 64),
      outerRingMat
    );
    ringGroup.add(outerRing);

    const innerRingMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      metalness: 0.88,
      roughness: 0.2
    });
    const innerRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.76, 0.025, 16, 48),
      innerRingMat
    );
    ringGroup.add(innerRing);
    scene.add(ringGroup);

    const handleResize = () => {
      if (!container) return;
      const w = Math.max(container.clientWidth, 280);
      camera.aspect = w / height;
      camera.updateProjectionMatrix();
      renderer.setSize(w, height);
    };
    window.addEventListener('resize', handleResize);

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
        fileCount: fCount,
        isProcessing: proc,
        isPasswordLocked: locked,
        spread: sp,
        camPreset: preset
      } = livePropsRef.current;

      // Camera preset damping
      const targetCamX = preset === 'iso' ? 1.8 : preset === 'front' ? 0 : 0;
      const targetCamY = preset === 'iso' ? 1.3 : preset === 'front' ? 0.3 : 4.6;
      const targetCamZ = preset === 'iso' ? 4.8 : preset === 'front' ? 5.2 : 0.8;

      camera.position.x = THREE.MathUtils.damp(camera.position.x, targetCamX, 4, dt);
      camera.position.y = THREE.MathUtils.damp(camera.position.y, targetCamY, 4, dt);
      camera.position.z = THREE.MathUtils.damp(camera.position.z, targetCamZ, 4, dt);

      const activeFolios = Math.max(1, Math.min(5, fCount || 3));
      const speedMult = proc ? 3.5 : 1.0;

      folios.forEach((mesh, idx) => {
        const isVisible = idx < activeFolios;
        mesh.visible = isVisible;
        const offsetIdx = idx - (activeFolios - 1) / 2;
        const targetX = offsetIdx * 1.05 * sp;
        const targetZ = -Math.abs(offsetIdx) * 0.35 * sp;
        const waveY = Math.sin(elapsed * 1.8 * speedMult + idx * 0.7) * (proc ? 0.14 : 0.05);

        mesh.position.x = THREE.MathUtils.damp(mesh.position.x, targetX, 6, dt);
        mesh.position.y = THREE.MathUtils.damp(mesh.position.y, waveY, 6, dt);
        mesh.position.z = THREE.MathUtils.damp(mesh.position.z, targetZ, 6, dt);
        mesh.rotation.y = THREE.MathUtils.damp(
          mesh.rotation.y,
          -offsetIdx * 0.22 * sp,
          6,
          dt
        );
      });

      // Animate Security / Pipeline Rings
      outerRing.rotation.z = elapsed * 0.5 * speedMult;
      outerRing.rotation.x = Math.sin(elapsed * 0.7) * 0.35;
      innerRing.rotation.y = -elapsed * 0.8 * speedMult;

      outerRingMat.color.setHex(locked ? 0xf59e0b : 0x8b5cf6);
      innerRingMat.color.setHex(proc ? 0x38bdf8 : 0x10b981);

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
      controls.dispose();
      envTarget.dispose();
      folioTex.dispose();
      folioGeo.dispose();
      edgeMat.dispose();
      coverMat.dispose();
      renderer.dispose();
    };
  }, [collapsed, mode, title]);

  return (
    <div className="rounded-xl bg-theme-surface border border-theme-subtle overflow-hidden">
      {/* Top Bar */}
      <div className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 border-b border-theme-subtle text-xs">
        <div className="flex items-center gap-2.5">
          <Box className="w-4 h-4 text-theme-accent shrink-0" />
          <span className="font-bold text-theme-primary">{title} — 3D WebGL Stage</span>
          <span className="text-theme-muted hidden sm:inline">·</span>
          <span className="text-theme-secondary hidden sm:inline">{subtitle}</span>
        </div>

        <div className="flex items-center gap-3">
          {!collapsed && (
            <>
              <div className="hidden md:flex items-center gap-1.5 font-mono text-[11px]">
                <span className="text-theme-muted">Spread:</span>
                <input
                  type="range"
                  min={0.15}
                  max={1.2}
                  step={0.05}
                  value={spread}
                  onChange={(e) => setSpread(Number(e.target.value))}
                  className="w-20 accent-violet-600 cursor-pointer"
                />
              </div>

              <div className="flex items-center gap-1 bg-theme-elevated p-0.5 rounded border border-theme-subtle text-[11px] font-semibold">
                {(
                  [
                    { id: 'iso', label: '3D Iso' },
                    { id: 'front', label: 'Front' },
                    { id: 'top', label: 'Top' }
                  ] as const
                ).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setCamPreset(p.id)}
                    className={`px-2 py-0.5 rounded cursor-pointer ${
                      camPreset === p.id
                        ? 'bg-theme-accent text-white'
                        : 'text-theme-secondary hover:text-theme-primary'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </>
          )}

          <button
            type="button"
            onClick={() => setCollapsed((prev) => !prev)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-theme-elevated border border-theme-subtle text-[11px] font-semibold text-theme-secondary hover:text-theme-primary cursor-pointer"
          >
            {collapsed ? (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                <span>Expand 3D Stage</span>
              </>
            ) : (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                <span>Collapse 3D</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* WebGL Viewport */}
      {!collapsed && (
        <div
          ref={mountRef}
          className="w-full h-[210px] relative select-none cursor-grab active:cursor-grabbing"
        />
      )}
    </div>
  );
};
