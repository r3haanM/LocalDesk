import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export interface ThreeHeroStageProps {
  isDropzoneActive?: boolean;
  activeFilterGroup?: string;
}

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

function createArchitecturalSheetTexture(
  maxAnisotropy: number,
  variant: number,
  isDark: boolean
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 680;
  const ctx = canvas.getContext('2d')!;

  if (isDark) {
    // Deep Forest Green architectural substrate
    ctx.fillStyle = variant % 2 === 0 ? '#10241C' : '#142C22';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle emerald drafting grid
    ctx.strokeStyle = 'rgba(52, 211, 153, 0.08)';
    ctx.lineWidth = 1;
    for (let x = 32; x < canvas.width; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 32; y < canvas.height; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Outer precision border
    ctx.strokeStyle = variant === 0 ? 'rgba(16, 185, 129, 0.45)' : 'rgba(52, 211, 153, 0.32)';
    ctx.lineWidth = 3;
    ctx.strokeRect(18, 18, canvas.width - 36, canvas.height - 36);

    // Corner fold diagonal indicator
    ctx.beginPath();
    ctx.moveTo(canvas.width - 78, 18);
    ctx.lineTo(canvas.width - 18, 78);
    ctx.strokeStyle = 'rgba(52, 211, 153, 0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Accent header rule
    ctx.fillStyle = variant === 0 ? 'rgba(16, 185, 129, 0.55)' : 'rgba(5, 150, 105, 0.48)';
    ctx.fillRect(38, 44, canvas.width - 96, 7);

    // Simulated vector typography lines
    ctx.fillStyle = 'rgba(242, 247, 244, 0.14)';
    ctx.fillRect(38, 76, 230, 18);
    ctx.fillStyle = 'rgba(163, 190, 179, 0.09)';
    for (let i = 0; i < 6; i++) {
      ctx.fillRect(38, 118 + i * 28, i % 2 === 0 ? 410 : 310, 10);
    }

    // Architectural diagram box
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.28)';
    ctx.lineWidth = 2;
    ctx.strokeRect(38, 320, canvas.width - 76, 185);

    ctx.fillStyle = 'rgba(16, 185, 129, 0.14)';
    ctx.fillRect(58, 350, 115, 125);
    ctx.fillStyle = 'rgba(52, 211, 153, 0.10)';
    ctx.fillRect(194, 378, 115, 97);
    ctx.fillStyle = 'rgba(242, 247, 244, 0.06)';
    ctx.fillRect(330, 342, 115, 133);

    // Bottom ISO specification footer bar
    ctx.fillStyle = 'rgba(52, 211, 153, 0.18)';
    ctx.fillRect(38, 548, 180, 8);
    ctx.fillRect(340, 548, 134, 8);
  } else {
    // Crisp Light Mode Architectural Ivory / Mint Paper Sheet
    ctx.fillStyle = variant % 2 === 0 ? '#FFFFFF' : '#F4F9F6';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle forest drafting grid (clearly visible against light canvas)
    ctx.strokeStyle = 'rgba(13, 31, 24, 0.065)';
    ctx.lineWidth = 1;
    for (let x = 32; x < canvas.width; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 32; y < canvas.height; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Outer precision border in Deep Forest & Emerald
    ctx.strokeStyle = variant === 0 ? 'rgba(5, 150, 105, 0.52)' : 'rgba(13, 31, 24, 0.26)';
    ctx.lineWidth = 3.5;
    ctx.strokeRect(18, 18, canvas.width - 36, canvas.height - 36);

    // Corner fold diagonal indicator
    ctx.beginPath();
    ctx.moveTo(canvas.width - 78, 18);
    ctx.lineTo(canvas.width - 18, 78);
    ctx.strokeStyle = 'rgba(5, 150, 105, 0.55)';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Accent header rule
    ctx.fillStyle = variant === 0 ? 'rgba(5, 150, 105, 0.65)' : 'rgba(16, 185, 129, 0.55)';
    ctx.fillRect(38, 44, canvas.width - 96, 7);

    // Simulated vector typography lines in Deep Forest ink tint
    ctx.fillStyle = 'rgba(13, 31, 24, 0.20)';
    ctx.fillRect(38, 76, 230, 18);
    ctx.fillStyle = 'rgba(13, 31, 24, 0.10)';
    for (let i = 0; i < 6; i++) {
      ctx.fillRect(38, 118 + i * 28, i % 2 === 0 ? 410 : 310, 10);
    }

    // Architectural diagram box
    ctx.strokeStyle = 'rgba(5, 150, 105, 0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(38, 320, canvas.width - 76, 185);

    ctx.fillStyle = 'rgba(5, 150, 105, 0.16)';
    ctx.fillRect(58, 350, 115, 125);
    ctx.fillStyle = 'rgba(16, 185, 129, 0.13)';
    ctx.fillRect(194, 378, 115, 97);
    ctx.fillStyle = 'rgba(13, 31, 24, 0.08)';
    ctx.fillRect(330, 342, 115, 133);

    // Bottom ISO specification footer bar
    ctx.fillStyle = 'rgba(5, 150, 105, 0.28)';
    ctx.fillRect(38, 548, 180, 8);
    ctx.fillRect(340, 548, 134, 8);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Hero-Scoped 3D Architectural Paper Stage
 * Renders composite 4-part ISO-32000 document assemblies along the left and right
 * flanks of the Hero section, reactive to Dark & Light appearance modes and file drag.
 */
export const ThreeHeroStage: React.FC<ThreeHeroStageProps> = ({
  isDropzoneActive = false,
  activeFilterGroup = 'all'
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef({
    isDropzoneActive,
    activeFilterGroup,
    pointerX: 0,
    pointerY: 0,
    isVisible: true
  });

  useEffect(() => {
    stateRef.current.isDropzoneActive = isDropzoneActive;
    stateRef.current.activeFilterGroup = activeFilterGroup;
  }, [isDropzoneActive, activeFilterGroup]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const getContainerSize = () => ({
      width: Math.max(container.clientWidth || window.innerWidth, 320),
      height: Math.max(container.clientHeight || 580, 420)
    });

    const { width, height } = getContainerSize();
    const isInitialDark = document.documentElement.classList.contains('dark');

    const scene = new THREE.Scene();
    const fog = new THREE.FogExp2(isInitialDark ? 0x0d1f18 : 0xf3f7f5, 0.048);
    scene.fog = fog;

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(0, 0.15, 8.9);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        alpha: true,
        powerPreference: 'high-performance'
      });
    } catch {
      return;
    }

    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();

    // Studio reflection environment
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    pmremGenerator.dispose();

    // Studio Lighting Rig (Forest & Emerald tuned)
    const ambientLight = new THREE.HemisphereLight(
      isInitialDark ? 0xa7f3d0 : 0xffffff,
      isInitialDark ? 0x0d1f18 : 0xdce7e1,
      isInitialDark ? 0.92 : 1.15
    );
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(
      isInitialDark ? 0xecfdf5 : 0xffffff,
      isInitialDark ? 1.75 : 1.45
    );
    keyLight.position.set(5, 7, 6);
    scene.add(keyLight);

    const accentLight = new THREE.PointLight(0x10b981, isInitialDark ? 4.2 : 2.6, 18);
    accentLight.position.set(-4.2, 2.0, 3.2);
    scene.add(accentLight);

    const secondaryLight = new THREE.PointLight(0x059669, isInitialDark ? 3.4 : 2.2, 16);
    secondaryLight.position.set(4.4, -1.6, 2.8);
    scene.add(secondaryLight);

    // Master Root Group for Parallax
    const worldGroup = new THREE.Group();
    scene.add(worldGroup);

    // Architectural Background Drafting Grid Plane
    const gridHelper = new THREE.GridHelper(
      30,
      30,
      isInitialDark ? 0x10b981 : 0x059669,
      isInitialDark ? 0x1a362b : 0xcbdcd3
    );
    gridHelper.position.set(0, -3.4, -4.2);
    gridHelper.rotation.x = 0.16;
    const gridMat = gridHelper.material as THREE.Material;
    gridMat.transparent = true;
    gridMat.opacity = isInitialDark ? 0.18 : 0.24;
    worldGroup.add(gridHelper);

    // Shared Geometries for Composite 4-Part Architectural Paper Assemblies
    const sheetGeo = new THREE.BoxGeometry(2.1, 2.8, 0.036);
    const lFrameVerticalGeo = new THREE.BoxGeometry(0.08, 2.55, 0.048);
    const lFrameHorizontalGeo = new THREE.BoxGeometry(1.75, 0.08, 0.048);
    const headerBarGeo = new THREE.BoxGeometry(1.55, 0.09, 0.024);

    let tex0 = createArchitecturalSheetTexture(maxAnisotropy, 0, isInitialDark);
    let tex1 = createArchitecturalSheetTexture(maxAnisotropy, 1, isInitialDark);

    const edgeMat = new THREE.MeshStandardMaterial({
      color: isInitialDark ? 0x1f3f33 : 0x8ca399,
      metalness: 0.65,
      roughness: 0.28
    });

    const datumFrameMat = new THREE.MeshStandardMaterial({
      color: isInitialDark ? 0x10b981 : 0x059669,
      metalness: 0.75,
      roughness: 0.22
    });

    const headerAccentMat = new THREE.MeshStandardMaterial({
      color: isInitialDark ? 0x34d399 : 0x047857,
      metalness: 0.5,
      roughness: 0.3
    });

    const frontMat0 = new THREE.MeshPhysicalMaterial({
      map: tex0,
      roughness: isInitialDark ? 0.22 : 0.32,
      metalness: isInitialDark ? 0.2 : 0.06,
      clearcoat: 0.75,
      transparent: true,
      opacity: isInitialDark ? 0.78 : 0.88
    });

    const frontMat1 = new THREE.MeshPhysicalMaterial({
      map: tex1,
      roughness: isInitialDark ? 0.24 : 0.35,
      metalness: isInitialDark ? 0.22 : 0.06,
      clearcoat: 0.7,
      transparent: true,
      opacity: isInitialDark ? 0.7 : 0.82
    });

    interface FloatingPaperAssembly {
      group: THREE.Group;
      basePos: THREE.Vector3;
      baseRot: THREE.Euler;
      speed: number;
      phase: number;
    }

    const assemblies: FloatingPaperAssembly[] = [];
    // Positioned along the left and right periphery to frame the centered Hero & Dropzone cleanly
    const planeConfigs = [
      { pos: [-5.4, 1.15, -1.6], rot: [0.16, 0.42, -0.1], scale: 1.04, mat: frontMat0, speed: 0.62, phase: 0 },
      { pos: [-4.3, -1.55, -3.0], rot: [-0.14, 0.34, 0.14], scale: 0.86, mat: frontMat1, speed: 0.5, phase: 1.4 },
      { pos: [5.4, 1.2, -1.5], rot: [0.15, -0.42, 0.09], scale: 1.06, mat: frontMat0, speed: 0.58, phase: 2.1 },
      { pos: [4.35, -1.5, -2.8], rot: [-0.18, -0.32, -0.13], scale: 0.88, mat: frontMat1, speed: 0.48, phase: 3.5 },
      { pos: [-2.8, 2.35, -4.6], rot: [0.24, 0.22, -0.18], scale: 0.72, mat: frontMat1, speed: 0.42, phase: 4.2 },
      { pos: [2.9, 2.3, -4.5], rot: [0.22, -0.22, 0.16], scale: 0.74, mat: frontMat0, speed: 0.44, phase: 5.1 }
    ];

    planeConfigs.forEach((cfg) => {
      const assembly = new THREE.Group();

      // Part 1: Primary ISO Architectural Sheet
      const sheetMesh = new THREE.Mesh(sheetGeo, [
        edgeMat,
        edgeMat,
        edgeMat,
        edgeMat,
        cfg.mat,
        edgeMat
      ]);
      assembly.add(sheetMesh);

      // Part 2: Grounded L-Frame Vertical Datum Bar (Echoing Local Desk Icon)
      const vBar = new THREE.Mesh(lFrameVerticalGeo, datumFrameMat);
      vBar.position.set(-1.02, -0.06, 0.022);
      assembly.add(vBar);

      // Part 3: Grounded L-Frame Horizontal Datum Bar
      const hBar = new THREE.Mesh(lFrameHorizontalGeo, datumFrameMat);
      hBar.position.set(-0.18, -1.36, 0.022);
      assembly.add(hBar);

      // Part 4: Raised Specification Header Bar
      const headerBar = new THREE.Mesh(headerBarGeo, headerAccentMat);
      headerBar.position.set(0.06, 1.08, 0.028);
      assembly.add(headerBar);

      assembly.position.set(cfg.pos[0], cfg.pos[1], cfg.pos[2]);
      assembly.rotation.set(cfg.rot[0], cfg.rot[1], cfg.rot[2]);
      assembly.scale.setScalar(cfg.scale);
      worldGroup.add(assembly);

      assemblies.push({
        group: assembly,
        basePos: new THREE.Vector3(cfg.pos[0], cfg.pos[1], cfg.pos[2]),
        baseRot: new THREE.Euler(cfg.rot[0], cfg.rot[1], cfg.rot[2]),
        speed: cfg.speed,
        phase: cfg.phase
      });
    });

    // React dynamically to Dark / Light theme switches on <html>
    const applyThemePalette = () => {
      const isDarkNow = document.documentElement.classList.contains('dark');
      fog.color.setHex(isDarkNow ? 0x0d1f18 : 0xf3f7f5);
      ambientLight.color.setHex(isDarkNow ? 0xa7f3d0 : 0xffffff);
      ambientLight.groundColor.setHex(isDarkNow ? 0x0d1f18 : 0xdce7e1);
      ambientLight.intensity = isDarkNow ? 0.92 : 1.15;
      keyLight.color.setHex(isDarkNow ? 0xecfdf5 : 0xffffff);
      keyLight.intensity = isDarkNow ? 1.75 : 1.45;
      accentLight.intensity = isDarkNow ? 4.2 : 2.6;
      secondaryLight.intensity = isDarkNow ? 3.4 : 2.2;

      edgeMat.color.setHex(isDarkNow ? 0x1f3f33 : 0x8ca399);
      datumFrameMat.color.setHex(isDarkNow ? 0x10b981 : 0x059669);
      headerAccentMat.color.setHex(isDarkNow ? 0x34d399 : 0x047857);

      const nextTex0 = createArchitecturalSheetTexture(maxAnisotropy, 0, isDarkNow);
      const nextTex1 = createArchitecturalSheetTexture(maxAnisotropy, 1, isDarkNow);

      frontMat0.map = nextTex0;
      frontMat0.opacity = isDarkNow ? 0.78 : 0.88;
      frontMat0.roughness = isDarkNow ? 0.22 : 0.32;
      frontMat0.needsUpdate = true;

      frontMat1.map = nextTex1;
      frontMat1.opacity = isDarkNow ? 0.7 : 0.82;
      frontMat1.roughness = isDarkNow ? 0.24 : 0.35;
      frontMat1.needsUpdate = true;

      tex0.dispose();
      tex1.dispose();
      tex0 = nextTex0;
      tex1 = nextTex1;
    };

    const htmlObserver = new MutationObserver(() => {
      applyThemePalette();
    });
    htmlObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });

    // Pause WebGL loop when Hero section scrolls out of viewport
    const visibilityObserver = new IntersectionObserver(
      (entries) => {
        if (entries[0]) {
          stateRef.current.isVisible = entries[0].isIntersecting;
        }
      },
      { threshold: 0.02 }
    );
    visibilityObserver.observe(container);

    const onPointerMove = (e: PointerEvent) => {
      stateRef.current.pointerX = (e.clientX / window.innerWidth) * 2 - 1;
      stateRef.current.pointerY = -(e.clientY / window.innerHeight) * 2 + 1;
    };

    const onResize = () => {
      const { width: w, height: h } = getContainerSize();
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('resize', onResize);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    const clock = new THREE.Clock();
    const targetColorHelper = new THREE.Color();
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
            frameId = window.setTimeout(poll, 6);
          } else {
            if (sync) gl.deleteSync(sync);
            frameId = window.setTimeout(cb, 80);
          }
        };
        frameId = window.setTimeout(poll, 6);
      } else {
        frameId = window.setTimeout(cb, 80);
      }
    }

    function tick() {
      if (disposed) return;
      const dt = Math.min(clock.getDelta(), 0.1);
      const elapsed = clock.getElapsedTime();

      if (stateRef.current.isVisible) {
        const {
          isDropzoneActive: dropActive,
          pointerX,
          pointerY,
          activeFilterGroup: group
        } = stateRef.current;

        const targetColorHex =
          group === 'archival'
            ? 0x059669
            : group === 'security-batch'
            ? 0x34d399
            : 0x10b981;
        targetColorHelper.setHex(targetColorHex);
        accentLight.color.lerp(targetColorHelper, 1 - Math.exp(-4 * dt));

        // Smooth pointer parallax on worldGroup
        const targetGroupX = pointerX * 0.38;
        const targetGroupY = pointerY * 0.24;
        const targetRotY = pointerX * 0.09;
        const targetRotX = -pointerY * 0.06;

        worldGroup.position.x = THREE.MathUtils.damp(worldGroup.position.x, targetGroupX, 4, dt);
        worldGroup.position.y = THREE.MathUtils.damp(worldGroup.position.y, targetGroupY, 4, dt);
        worldGroup.rotation.y = THREE.MathUtils.damp(worldGroup.rotation.y, targetRotY, 4, dt);
        worldGroup.rotation.x = THREE.MathUtils.damp(worldGroup.rotation.x, targetRotX, 4, dt);

        // Animate composite architectural PDF assemblies
        assemblies.forEach((fp, idx) => {
          const pullFactor = dropActive ? 0.78 : 1.0;
          const waveY = prefersReducedMotion ? 0 : Math.sin(elapsed * fp.speed + fp.phase) * 0.18;
          const waveRotZ = prefersReducedMotion
            ? 0
            : Math.cos(elapsed * fp.speed * 0.8 + fp.phase) * 0.05;

          fp.group.position.x = THREE.MathUtils.damp(
            fp.group.position.x,
            fp.basePos.x * pullFactor,
            5,
            dt
          );
          fp.group.position.y = THREE.MathUtils.damp(
            fp.group.position.y,
            fp.basePos.y * pullFactor + waveY,
            5,
            dt
          );
          fp.group.position.z = THREE.MathUtils.damp(
            fp.group.position.z,
            fp.basePos.z + (dropActive ? 0.75 : 0),
            5,
            dt
          );
          fp.group.rotation.z = THREE.MathUtils.damp(
            fp.group.rotation.z,
            fp.baseRot.z + waveRotZ,
            5,
            dt
          );
          fp.group.rotation.y = THREE.MathUtils.damp(
            fp.group.rotation.y,
            fp.baseRot.y + (idx % 2 === 0 ? 0.07 : -0.07) * Math.sin(elapsed * 0.4 + fp.phase),
            5,
            dt
          );
        });

        renderer.render(scene, camera);
      }

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
      htmlObserver.disconnect();
      visibilityObserver.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('resize', onResize);
      envTarget.dispose();
      tex0.dispose();
      tex1.dispose();
      sheetGeo.dispose();
      lFrameVerticalGeo.dispose();
      lFrameHorizontalGeo.dispose();
      headerBarGeo.dispose();
      edgeMat.dispose();
      datumFrameMat.dispose();
      headerAccentMat.dispose();
      frontMat0.dispose();
      frontMat1.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      aria-hidden="true"
      style={{
        maskImage:
          'radial-gradient(ellipse 90% 85% at 50% 45%, rgba(0,0,0,0.95) 35%, rgba(0,0,0,0.5) 75%, transparent 100%)',
        WebkitMaskImage:
          'radial-gradient(ellipse 90% 85% at 50% 45%, rgba(0,0,0,0.95) 35%, rgba(0,0,0,0.5) 75%, transparent 100%)'
      }}
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
    />
  );
};
