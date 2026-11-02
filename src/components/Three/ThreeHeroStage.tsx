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

function createArchitecturalSheetTexture(maxAnisotropy: number, variant: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 680;
  const ctx = canvas.getContext('2d')!;

  // Deep translucent slate substrate
  ctx.fillStyle = variant % 2 === 0 ? '#12131c' : '#161824';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Subtle architectural grid
  ctx.strokeStyle = 'rgba(139, 92, 246, 0.08)';
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
  ctx.strokeStyle = variant === 0 ? 'rgba(139, 92, 246, 0.38)' : 'rgba(16, 185, 129, 0.25)';
  ctx.lineWidth = 3;
  ctx.strokeRect(16, 16, canvas.width - 32, canvas.height - 32);

  // Accent header rule
  ctx.fillStyle = variant === 0 ? 'rgba(139, 92, 246, 0.45)' : 'rgba(99, 102, 241, 0.35)';
  ctx.fillRect(36, 42, canvas.width - 72, 6);

  // Simulated vector content blocks
  ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
  ctx.fillRect(36, 76, 220, 18);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
  for (let i = 0; i < 6; i++) {
    ctx.fillRect(36, 120 + i * 28, i % 2 === 0 ? 410 : 320, 10);
  }

  // Geometric diagram box
  ctx.strokeStyle = 'rgba(139, 92, 246, 0.24)';
  ctx.lineWidth = 2;
  ctx.strokeRect(36, 320, canvas.width - 72, 180);

  ctx.fillStyle = 'rgba(139, 92, 246, 0.09)';
  ctx.fillRect(56, 350, 110, 120);
  ctx.fillStyle = 'rgba(16, 185, 129, 0.09)';
  ctx.fillRect(190, 380, 110, 90);
  ctx.fillStyle = 'rgba(245, 158, 11, 0.09)';
  ctx.fillRect(324, 340, 110, 130);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Full-Bleed Ambient 3D Architectural Background Canvas
 * Renders floating glass/titanium ISO-32000 document planes, precision rings,
 * and depth-of-field spatial geometry behind the Homepage UI.
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
    scrollY: 0
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

    const width = Math.max(window.innerWidth, 320);
    const height = Math.max(window.innerHeight, 480);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x090a0f, 0.055);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    camera.position.set(0, 0.2, 8.8);

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
    renderer.toneMappingExposure = 1.05;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();

    // Studio reflection environment
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    pmremGenerator.dispose();

    // Lighting rig
    const ambientLight = new THREE.HemisphereLight(0xc4b5fd, 0x090a0f, 0.85);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xede9fe, 1.8);
    keyLight.position.set(5, 7, 6);
    scene.add(keyLight);

    const accentLight = new THREE.PointLight(0x7c3aed, 4.5, 18);
    accentLight.position.set(-3.5, 2.2, 3.2);
    scene.add(accentLight);

    const secondaryLight = new THREE.PointLight(0x10b981, 3.2, 16);
    secondaryLight.position.set(4.2, -1.8, 2.5);
    scene.add(secondaryLight);

    // Master Root Group for Parallax & Scroll Choreography
    const worldGroup = new THREE.Group();
    scene.add(worldGroup);

    // Architectural Background Grid Plane (Tilted in deep space)
    const gridHelper = new THREE.GridHelper(32, 32, 0x4c1d95, 0x1e1b4b);
    gridHelper.position.set(0, -3.6, -4.5);
    gridHelper.rotation.x = 0.18;
    const gridMat = gridHelper.material as THREE.Material;
    gridMat.transparent = true;
    gridMat.opacity = 0.22;
    worldGroup.add(gridHelper);

    // Floating Architectural PDF Planes (Distributed around the periphery to frame UI)
    const tex0 = createArchitecturalSheetTexture(maxAnisotropy, 0);
    const tex1 = createArchitecturalSheetTexture(maxAnisotropy, 1);

    const sheetGeo = new THREE.BoxGeometry(2.1, 2.8, 0.035);
    const edgeMat = new THREE.MeshStandardMaterial({
      color: 0x3f3f46,
      metalness: 0.85,
      roughness: 0.2
    });

    const frontMat0 = new THREE.MeshPhysicalMaterial({
      map: tex0,
      roughness: 0.2,
      metalness: 0.25,
      clearcoat: 0.85,
      transparent: true,
      opacity: 0.72
    });

    const frontMat1 = new THREE.MeshPhysicalMaterial({
      map: tex1,
      roughness: 0.22,
      metalness: 0.3,
      clearcoat: 0.8,
      transparent: true,
      opacity: 0.64
    });

    interface FloatingPlaneSpec {
      mesh: THREE.Mesh;
      basePos: THREE.Vector3;
      baseRot: THREE.Euler;
      speed: number;
      phase: number;
    }

    const floatingPlanes: FloatingPlaneSpec[] = [];
    const planeConfigs = [
      { pos: [-5.4, 1.3, -1.8], rot: [0.18, 0.42, -0.12], scale: 1.05, mat: frontMat0, speed: 0.65, phase: 0 },
      { pos: [-4.2, -1.7, -3.2], rot: [-0.14, 0.35, 0.16], scale: 0.85, mat: frontMat1, speed: 0.52, phase: 1.4 },
      { pos: [5.3, 1.4, -1.6], rot: [0.15, -0.44, 0.1], scale: 1.08, mat: frontMat0, speed: 0.6, phase: 2.1 },
      { pos: [4.4, -1.6, -2.9], rot: [-0.2, -0.32, -0.15], scale: 0.88, mat: frontMat1, speed: 0.48, phase: 3.5 },
      { pos: [-1.8, 2.7, -4.8], rot: [0.28, 0.15, -0.22], scale: 0.72, mat: frontMat1, speed: 0.4, phase: 4.2 },
      { pos: [2.2, -2.6, -4.6], rot: [-0.24, -0.18, 0.18], scale: 0.75, mat: frontMat0, speed: 0.44, phase: 5.1 }
    ];

    planeConfigs.forEach((cfg) => {
      const mesh = new THREE.Mesh(sheetGeo, [
        edgeMat,
        edgeMat,
        edgeMat,
        edgeMat,
        cfg.mat,
        edgeMat
      ]);
      mesh.position.set(cfg.pos[0], cfg.pos[1], cfg.pos[2]);
      mesh.rotation.set(cfg.rot[0], cfg.rot[1], cfg.rot[2]);
      mesh.scale.setScalar(cfg.scale);
      worldGroup.add(mesh);

      floatingPlanes.push({
        mesh,
        basePos: new THREE.Vector3(cfg.pos[0], cfg.pos[1], cfg.pos[2]),
        baseRot: new THREE.Euler(cfg.rot[0], cfg.rot[1], cfg.rot[2]),
        speed: cfg.speed,
        phase: cfg.phase
      });
    });

    // Precision Gyroscopic Document Rings in Deep Background
    const ringGroup = new THREE.Group();
    ringGroup.position.set(0, 0.3, -4.2);
    worldGroup.add(ringGroup);

    const outerRing = new THREE.Mesh(
      new THREE.TorusGeometry(3.4, 0.014, 16, 120),
      new THREE.MeshStandardMaterial({
        color: 0x7c3aed,
        metalness: 0.9,
        roughness: 0.15,
        transparent: true,
        opacity: 0.32
      })
    );
    ringGroup.add(outerRing);

    const innerRing = new THREE.Mesh(
      new THREE.TorusGeometry(2.45, 0.012, 16, 100),
      new THREE.MeshStandardMaterial({
        color: 0x10b981,
        metalness: 0.9,
        roughness: 0.18,
        transparent: true,
        opacity: 0.24
      })
    );
    innerRing.rotation.x = Math.PI / 3;
    ringGroup.add(innerRing);

    // Subtle Spatial Nodes (Particles)
    const particleCount = 70;
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 18;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 11;
      positions[i * 3 + 2] = -1.5 - Math.random() * 6;
    }
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0xa78bfa,
      size: 0.045,
      transparent: true,
      opacity: 0.45
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    worldGroup.add(particles);

    const onPointerMove = (e: PointerEvent) => {
      stateRef.current.pointerX = (e.clientX / window.innerWidth) * 2 - 1;
      stateRef.current.pointerY = -(e.clientY / window.innerHeight) * 2 + 1;
    };

    const onScroll = () => {
      stateRef.current.scrollY = window.scrollY || 0;
    };

    const onResize = () => {
      const w = Math.max(window.innerWidth, 320);
      const h = Math.max(window.innerHeight, 480);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

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

      const { isDropzoneActive: dropActive, pointerX, pointerY, scrollY, activeFilterGroup: group } =
        stateRef.current;

      // Adapt accent light color subtly by selected filter tab
      const targetColorHex =
        group === 'edit'
          ? 0x8b5cf6
          : group === 'organize'
          ? 0x3b82f6
          : group === 'security-batch'
          ? 0x10b981
          : group === 'word-convert'
          ? 0xf59e0b
          : 0x7c3aed;
      accentLight.color.lerp(new THREE.Color(targetColorHex), 1 - Math.exp(-4 * dt));

      // Smooth pointer parallax + scroll depth on worldGroup
      const targetGroupX = pointerX * 0.45;
      const targetGroupY = pointerY * 0.3 + Math.min(scrollY * 0.0018, 1.8);
      const targetRotY = pointerX * 0.12;
      const targetRotX = -pointerY * 0.08;

      worldGroup.position.x = THREE.MathUtils.damp(worldGroup.position.x, targetGroupX, 4, dt);
      worldGroup.position.y = THREE.MathUtils.damp(worldGroup.position.y, targetGroupY, 4, dt);
      worldGroup.rotation.y = THREE.MathUtils.damp(worldGroup.rotation.y, targetRotY, 4, dt);
      worldGroup.rotation.x = THREE.MathUtils.damp(worldGroup.rotation.x, targetRotX, 4, dt);

      // Animate floating architectural PDF planes
      floatingPlanes.forEach((fp, idx) => {
        const pullFactor = dropActive ? 0.76 : 1.0;
        const waveY = prefersReducedMotion ? 0 : Math.sin(elapsed * fp.speed + fp.phase) * 0.22;
        const waveRotZ = prefersReducedMotion ? 0 : Math.cos(elapsed * fp.speed * 0.8 + fp.phase) * 0.06;

        fp.mesh.position.x = THREE.MathUtils.damp(
          fp.mesh.position.x,
          fp.basePos.x * pullFactor,
          5,
          dt
        );
        fp.mesh.position.y = THREE.MathUtils.damp(
          fp.mesh.position.y,
          fp.basePos.y * pullFactor + waveY,
          5,
          dt
        );
        fp.mesh.position.z = THREE.MathUtils.damp(
          fp.mesh.position.z,
          fp.basePos.z + (dropActive ? 0.85 : 0),
          5,
          dt
        );
        fp.mesh.rotation.z = THREE.MathUtils.damp(
          fp.mesh.rotation.z,
          fp.baseRot.z + waveRotZ,
          5,
          dt
        );
        fp.mesh.rotation.y = THREE.MathUtils.damp(
          fp.mesh.rotation.y,
          fp.baseRot.y + (idx % 2 === 0 ? 0.08 : -0.08) * Math.sin(elapsed * 0.4 + fp.phase),
          5,
          dt
        );
      });

      if (!prefersReducedMotion) {
        outerRing.rotation.z = elapsed * (dropActive ? 0.35 : 0.12);
        outerRing.rotation.y = Math.sin(elapsed * 0.25) * 0.25;
        innerRing.rotation.z = -elapsed * (dropActive ? 0.45 : 0.16);
        particles.rotation.y = elapsed * 0.03;
      }

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
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      envTarget.dispose();
      tex0.dispose();
      tex1.dispose();
      sheetGeo.dispose();
      particleGeo.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden opacity-85"
    />
  );
};
