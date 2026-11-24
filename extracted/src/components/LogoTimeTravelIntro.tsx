/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 3D Slow-Zoom Time-Travel Logo Entrance for Al-Mamo Hardware Store.
 * Renders a Three.js WebGL wormhole tunnel & composite metallic store crest
 * reading "متجر خردوات المامو · بإدارة أحمد نوار المامو".
 */

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { ArrowLeft, Compass, RotateCcw } from 'lucide-react';
import { computeTimeTravelCameraState } from '../utils/welcome3d';

interface LogoTimeTravelIntroProps {
  storeName?: string;
  onComplete: () => void;
}

const INTRO_DURATION_SEC = 5.6;
const AUTO_COMPLETE_DELAY_MS = 1150;

function createSignageCanvasTexture(storeName: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  // Deep obsidian-navy machined faceplate background
  const radial = ctx.createRadialGradient(512, 470, 60, 512, 512, 500);
  radial.addColorStop(0, '#1e293b');
  radial.addColorStop(0.55, '#0f172a');
  radial.addColorStop(1, '#020617');
  ctx.fillStyle = radial;
  ctx.fillRect(0, 0, 1024, 1024);

  // Subtle concentric lathe grooves
  ctx.strokeStyle = 'rgba(251, 191, 36, 0.12)';
  ctx.lineWidth = 2;
  for (let r = 130; r <= 470; r += 34) {
    ctx.beginPath();
    ctx.arc(512, 512, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Outer brass ring accent
  const ringGrad = ctx.createLinearGradient(120, 120, 900, 900);
  ringGrad.addColorStop(0, '#fde68a');
  ringGrad.addColorStop(0.5, '#f59e0b');
  ringGrad.addColorStop(1, '#b45309');
  ctx.strokeStyle = ringGrad;
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.arc(512, 512, 466, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(512, 512, 434, 0, Math.PI * 2);
  ctx.stroke();

  // Top emblem arch icon (minimalist hardware store pediment + star)
  ctx.fillStyle = '#fbbf24';
  ctx.beginPath();
  ctx.moveTo(512, 168);
  ctx.lineTo(662, 260);
  ctx.lineTo(632, 260);
  ctx.lineTo(512, 188);
  ctx.lineTo(392, 260);
  ctx.lineTo(362, 260);
  ctx.closePath();
  ctx.fill();

  // Arabic primary store title
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.direction = 'rtl';

  ctx.shadowColor = 'rgba(245, 158, 11, 0.45)';
  ctx.shadowBlur = 18;
  ctx.fillStyle = '#fef3c7';
  ctx.font = '900 84px Cairo, Tajawal, sans-serif';
  ctx.fillText(storeName || 'متجر خردوات المامو', 512, 432);

  // Divider accent bar
  ctx.shadowBlur = 0;
  const barGrad = ctx.createLinearGradient(250, 515, 774, 515);
  barGrad.addColorStop(0, 'rgba(245, 158, 11, 0)');
  barGrad.addColorStop(0.5, '#fbbf24');
  barGrad.addColorStop(1, 'rgba(245, 158, 11, 0)');
  ctx.fillStyle = barGrad;
  ctx.fillRect(250, 515, 524, 5);

  // Manager signature
  ctx.fillStyle = '#fbbf24';
  ctx.font = '800 44px Cairo, Tajawal, sans-serif';
  ctx.fillText('بإدارة أحمد نوار المامو', 512, 594);

  // Subtitle badge
  ctx.fillStyle = '#38bdf8';
  ctx.font = '700 32px Cairo, Tajawal, sans-serif';
  ctx.fillText('للعدد الصناعية والإنشائية والكهربائية', 512, 682);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

export const LogoTimeTravelIntro: React.FC<LogoTimeTravelIntroProps> = ({
  storeName = 'متجر خردوات المامو',
  onComplete,
}) => {
  const canvasMountRef = useRef<HTMLDivElement>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const [phase, setPhase] = useState<'zooming' | 'arrived'>('zooming');
  const [progressPct, setProgressPct] = useState(0);
  const [titleOpacity, setTitleOpacity] = useState(0);

  const replayTriggerRef = useRef<() => void>(() => {});

  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    let width = mount.clientWidth || window.innerWidth;
    let height = mount.clientHeight || window.innerHeight;

    // Software WebGL check (games_3d.md / threejs SKILL.md)
    const isSoftwareGl = (() => {
      try {
        const probe = document.createElement('canvas').getContext('webgl2');
        if (!probe) return true;
        const ext = probe.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
        const gpu = String(probe.getParameter(param));
        probe.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x030712);
    scene.fog = new THREE.FogExp2(0x030712, 0.022);

    const camera = new THREE.PerspectiveCamera(64, width / Math.max(1, height), 0.1, 140);
    camera.position.set(0, 0, 30);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3;
    renderer.shadowMap.enabled = false;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';

    mount.innerHTML = '';
    mount.appendChild(renderer.domElement);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    roomEnv.dispose();
    pmremGenerator.dispose();

    // Lighting rig
    const ambient = new THREE.AmbientLight(0xfef3c7, 0.9);
    scene.add(ambient);

    const heroKey = new THREE.DirectionalLight(0xfbbf24, 2.8);
    heroKey.position.set(6, 7, 10);
    scene.add(heroKey);

    const rimCyan = new THREE.DirectionalLight(0x38bdf8, 2.2);
    rimCyan.position.set(-7, -4, 6);
    scene.add(rimCyan);

    // Materials
    const brushedGoldMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.88,
      roughness: 0.22,
      emissive: 0x451a03,
      emissiveIntensity: 0.25,
    });

    const darkTitaniumMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.85,
      roughness: 0.28,
    });

    const chromeSteelMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.92,
      roughness: 0.18,
    });

    const cyanNeonMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.75,
    });

    const goldRingMat = new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
      transparent: true,
      opacity: 0.85,
    });

    // 1. Composite 3D Store Crest & Metallic Logo Emblem at z = 0
    const emblemGroup = new THREE.Group();
    scene.add(emblemGroup);

    // Part 1: Hexagonal brass outer bezel (oriented cleanly flat in XY plane, behind signagePlate)
    const hexBezelGeo = new THREE.CylinderGeometry(3.38, 3.55, 0.28, 6);
    hexBezelGeo.rotateX(Math.PI / 2);
    hexBezelGeo.rotateZ(Math.PI / 6);
    const hexBezel = new THREE.Mesh(hexBezelGeo, brushedGoldMat);
    hexBezel.position.z = -0.05;
    emblemGroup.add(hexBezel);

    // Part 2: Titanium inner chassis disc
    const innerDiscGeo = new THREE.CylinderGeometry(3.04, 3.04, 0.36, 48);
    innerDiscGeo.rotateX(Math.PI / 2);
    const innerDisc = new THREE.Mesh(innerDiscGeo, darkTitaniumMat);
    innerDisc.position.z = 0;
    emblemGroup.add(innerDisc);

    // Part 3: Front high-resolution store crest plate ("متجر خردوات المامو")
    const signageTexture = createSignageCanvasTexture(storeName);
    const signageMat = new THREE.MeshStandardMaterial({
      map: signageTexture,
      roughness: 0.35,
      metalness: 0.22,
    });
    const signagePlate = new THREE.Mesh(new THREE.CircleGeometry(2.9, 64), signageMat);
    signagePlate.position.z = 0.24;
    emblemGroup.add(signagePlate);

    // Part 4: Back plate so full rotation stays solid
    const backPlate = new THREE.Mesh(new THREE.CircleGeometry(2.9, 64), signageMat);
    backPlate.position.z = -0.24;
    backPlate.rotation.y = Math.PI;
    emblemGroup.add(backPlate);

    // Part 5: Animated 12-tooth brass spur gear orbiting behind emblem
    const gearGroup = new THREE.Group();
    gearGroup.position.set(0, 0, -0.45);
    const gearRim = new THREE.Mesh(new THREE.TorusGeometry(3.85, 0.14, 12, 48), brushedGoldMat);
    gearGroup.add(gearRim);
    const toothGeo = new THREE.BoxGeometry(0.32, 0.52, 0.24);
    for (let i = 0; i < 12; i++) {
      const tooth = new THREE.Mesh(toothGeo, brushedGoldMat);
      const ang = (i / 12) * Math.PI * 2;
      tooth.position.set(Math.cos(ang) * 4.02, Math.sin(ang) * 4.02, 0);
      tooth.rotation.z = ang + Math.PI / 2;
      gearGroup.add(tooth);
    }
    emblemGroup.add(gearGroup);

    // Part 6: Machined Steel Wrench crowning the upper-left corner
    const wrenchGroup = new THREE.Group();
    const wrenchShaft = new THREE.Mesh(new THREE.BoxGeometry(0.28, 2.2, 0.16), chromeSteelMat);
    wrenchGroup.add(wrenchShaft);
    const wrenchHead = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.11, 10, 20, Math.PI * 1.45), chromeSteelMat);
    wrenchHead.position.y = 1.15;
    wrenchHead.rotation.z = Math.PI * 0.28;
    wrenchGroup.add(wrenchHead);
    wrenchGroup.position.set(-3.45, 1.35, -0.15);
    wrenchGroup.rotation.z = 0.52;
    emblemGroup.add(wrenchGroup);

    // Part 7: Brass Hardware Pediment / Peaked Crown atop the emblem
    const crownShape = new THREE.Mesh(new THREE.ConeGeometry(0.7, 0.9, 4), brushedGoldMat);
    crownShape.position.set(0, 3.62, 0.05);
    crownShape.rotation.y = Math.PI / 4;
    emblemGroup.add(crownShape);

    // Part 8: Outer Cyan Gyro Ring
    const gyroRing = new THREE.Mesh(new THREE.TorusGeometry(4.55, 0.045, 12, 64), cyanNeonMat);
    gyroRing.position.z = -0.2;
    emblemGroup.add(gyroRing);

    // 2. Time-Travel Wormhole Tunnel (18 glowing concentric rings along Z)
    const RING_COUNT = 18;
    const TUNNEL_SPAN = 42;
    const tunnelRings: THREE.Mesh[] = [];
    const hexRingGeo = new THREE.TorusGeometry(5.6, 0.055, 8, 6);
    const circleRingGeo = new THREE.TorusGeometry(4.8, 0.04, 8, 36);

    for (let i = 0; i < RING_COUNT; i++) {
      const isHex = i % 2 === 0;
      const mat = isHex ? goldRingMat.clone() : cyanNeonMat.clone();
      const ring = new THREE.Mesh(isHex ? hexRingGeo : circleRingGeo, mat);
      const zPos = 2 + (i / RING_COUNT) * TUNNEL_SPAN;
      ring.position.z = zPos;
      ring.rotation.z = i * 0.25;
      scene.add(ring);
      tunnelRings.push(ring);
    }

    // 3. Instanced Time-Warp Star/Spark Streaks (140 stretched instanced cylinders)
    const STREAK_COUNT = 140;
    const streakGeo = new THREE.CylinderGeometry(0.028, 0.028, 1.35, 6);
    streakGeo.rotateX(Math.PI / 2);
    const streakMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.78,
    });
    const streakInst = new THREE.InstancedMesh(streakGeo, streakMat, STREAK_COUNT);
    const dummy = new THREE.Object3D();
    const streakData: Array<{ angle: number; radius: number; z: number; speed: number }> = [];
    const streakColorGold = new THREE.Color(0xfbbf24);
    const streakColorSky = new THREE.Color(0x38bdf8);

    for (let i = 0; i < STREAK_COUNT; i++) {
      const angle = (i * 2.39996) % (Math.PI * 2);
      const radius = 3.9 + ((i * 17) % 100) / 14;
      const z = -6 + (i / STREAK_COUNT) * 44;
      const speed = 7 + (i % 5) * 2.2;
      streakData.push({ angle, radius, z, speed });
      streakInst.setColorAt(i, i % 3 === 0 ? streakColorSky : streakColorGold);
    }
    if (streakInst.instanceColor) streakInst.instanceColor.needsUpdate = true;
    scene.add(streakInst);

    // Timeline state
    let elapsedSec = 0;
    let lastTimeMs = performance.now();
    let arrivedTimestampMs: number | null = null;
    let hasAutoCompleted = false;
    let disposed = false;
    let contextLost = false;
    let rafId: number | null = null;
    let timerId: number | null = null;
    let lastUiPhase: 'zooming' | 'arrived' = 'zooming';

    const gl = renderer.getContext();

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      contextLost = true;
    };
    const handleContextRestored = () => {
      contextLost = false;
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored);

    const handleResize = () => {
      if (!mount || disposed) return;
      width = mount.clientWidth || window.innerWidth;
      height = mount.clientHeight || window.innerHeight;
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener('resize', handleResize);

    replayTriggerRef.current = () => {
      elapsedSec = 0;
      arrivedTimestampMs = null;
      hasAutoCompleted = false;
      lastTimeMs = performance.now();
      setPhase('zooming');
      lastUiPhase = 'zooming';
      setProgressPct(0);
      setTitleOpacity(0);
    };

    const scheduleNext = (cb: () => void) => {
      if (disposed) return;
      if (isSoftwareGl) {
        const anyGl = gl as WebGL2RenderingContext;
        if (typeof anyGl.fenceSync === 'function') {
          const sync = anyGl.fenceSync(anyGl.SYNC_GPU_COMMANDS_COMPLETE, 0);
          if (sync) {
            anyGl.flush();
            anyGl.deleteSync(sync);
          }
        }
        timerId = window.setTimeout(cb, 80);
      } else {
        rafId = window.requestAnimationFrame(cb);
      }
    };

    const tick = () => {
      if (disposed) return;
      const nowMs = performance.now();
      const rawDt = Math.min(0.1, Math.max(0.008, (nowMs - lastTimeMs) / 1000));
      lastTimeMs = nowMs;

      elapsedSec = Math.min(INTRO_DURATION_SEC + 3.5, elapsedSec + rawDt);

      const rawProgress = elapsedSec / INTRO_DURATION_SEC;
      const camState = computeTimeTravelCameraState(rawProgress);

      // Update camera slow-motion time-travel zoom
      camera.position.z = camState.cameraZ;
      camera.fov = camState.fov;
      camera.updateProjectionMatrix();
      camera.rotation.z = camState.rollRad;
      camera.lookAt(0, 0, 0);

      // Emblem scale & gentle idle majesty float once arrived
      const idleBreath = camState.phase === 'arrived' ? Math.sin(elapsedSec * 1.6) * 0.04 : 0;
      emblemGroup.scale.setScalar(camState.emblemScale);
      emblemGroup.rotation.y = Math.sin(elapsedSec * 0.55) * 0.14;
      emblemGroup.rotation.x = Math.cos(elapsedSec * 0.45) * 0.05 + idleBreath * 0.2;

      gearGroup.rotation.z -= rawDt * 0.42;
      gyroRing.rotation.z += rawDt * 0.65;
      gyroRing.rotation.y = Math.sin(elapsedSec * 0.8) * 0.35;

      // Advance wormhole rings smoothly past camera during travel
      const travelFactor = camState.phase === 'zooming' ? 1 : 0.28;
      for (let i = 0; i < tunnelRings.length; i++) {
        const ring = tunnelRings[i];
        ring.position.z += rawDt * 5.2 * travelFactor;
        if (ring.position.z > 40) {
          ring.position.z -= TUNNEL_SPAN;
        }
        ring.rotation.z += rawDt * (i % 2 === 0 ? 0.35 : -0.28);
        const rMat = ring.material as THREE.MeshBasicMaterial;
        rMat.opacity = (i % 2 === 0 ? 0.62 : 0.48) * camState.tunnelOpacity;
      }

      // Advance instanced temporal streaks
      for (let i = 0; i < STREAK_COUNT; i++) {
        const s = streakData[i];
        s.z += rawDt * s.speed * travelFactor;
        if (s.z > 36) s.z = -6;
        dummy.position.set(Math.cos(s.angle) * s.radius, Math.sin(s.angle) * s.radius, s.z);
        dummy.scale.set(1, 1, camState.phase === 'zooming' ? 1.55 : 0.55);
        dummy.updateMatrix();
        streakInst.setMatrixAt(i, dummy.matrix);
      }
      streakInst.instanceMatrix.needsUpdate = true;

      if (!contextLost) {
        renderer.render(scene, camera);
      }

      // Sync React HUD state sparsely / cleanly
      const nextPct = Math.round(camState.progress * 100);
      setProgressPct((prev) => (prev !== nextPct ? nextPct : prev));
      setTitleOpacity(camState.titleOpacity);

      if (camState.phase !== lastUiPhase) {
        lastUiPhase = camState.phase;
        setPhase(camState.phase);
      }

      if (camState.phase === 'arrived') {
        if (arrivedTimestampMs === null) {
          arrivedTimestampMs = nowMs;
        } else if (
          !hasAutoCompleted &&
          nowMs - arrivedTimestampMs >= AUTO_COMPLETE_DELAY_MS
        ) {
          hasAutoCompleted = true;
          onCompleteRef.current();
          return;
        }
      }

      scheduleNext(tick);
    };

    scheduleNext(tick);

    return () => {
      disposed = true;
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      if (timerId !== null) window.clearTimeout(timerId);
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored);

      signageTexture.dispose();
      signageMat.dispose();
      brushedGoldMat.dispose();
      darkTitaniumMat.dispose();
      chromeSteelMat.dispose();
      cyanNeonMat.dispose();
      goldRingMat.dispose();
      streakMat.dispose();
      streakGeo.dispose();
      hexRingGeo.dispose();
      circleRingGeo.dispose();
      hexBezelGeo.dispose();
      innerDiscGeo.dispose();
      toothGeo.dispose();
      tunnelRings.forEach((r) => (r.material as THREE.Material).dispose());
      envTarget.dispose();
      renderer.dispose();
      if (mount) mount.innerHTML = '';
    };
  }, [storeName]);

  return (
    <div
      data-testid="time-travel-intro"
      data-phase={phase}
      dir="rtl"
      className="fixed inset-0 z-50 bg-slate-950 text-white font-['Cairo',sans-serif] overflow-hidden select-none"
    >
      {/* Isolated WebGL Mount — React never renders children inside this div */}
      <div ref={canvasMountRef} className="absolute inset-0" />

      {/* Subtle Corner Greeting Overlays (No backdrop-blur over canvas) */}
      <header className="relative z-10 flex items-center justify-between px-5 sm:px-8 pt-4 pointer-events-none">
        <div className="px-3.5 py-1.5 rounded-xl bg-slate-950/85 border border-amber-500/35 text-amber-300 text-xs font-black flex items-center gap-2">
          <Compass className="w-4 h-4 text-amber-400" />
          <span>سفر عبر الزمن إلى شعار المتجر</span>
        </div>
        <div className="px-3 py-1 rounded-xl bg-slate-950/85 border border-sky-500/30 text-sky-300 text-[11px] font-bold tabular-nums">
          {progressPct}%
        </div>
      </header>

      {/* Rising Greeting Caption Once Zoom Approaches Focal Plane */}
      <div
        style={{ opacity: titleOpacity }}
        className="pointer-events-none absolute inset-x-0 bottom-24 z-10 flex flex-col items-center text-center px-4 transition-opacity duration-300"
      >
        <h1 className="text-xl sm:text-3xl font-black text-amber-200 drop-shadow-[0_4px_18px_rgba(245,158,11,0.55)]">
          مرحبا بك في {storeName}
        </h1>
        <p className="text-xs sm:text-sm font-bold text-sky-300 mt-1">
          بإدارة أحمد نوار المامو — منظومة المحاسبة والمخزون المتطورة
        </p>
      </div>

      {/* Docked Bottom Action Bar (Solid dark surface, zero backdrop-blur over WebGL) */}
      <footer className="absolute inset-x-0 bottom-0 z-20 bg-slate-950/92 border-t border-amber-500/25 px-4 sm:px-8 py-3">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-[180px]">
            <div className="w-full max-w-xs h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-sky-400 via-amber-400 to-amber-500 transition-all duration-100"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="text-[11px] font-bold text-slate-300 whitespace-nowrap">
              {phase === 'arrived' ? 'تم الوصول إلى المتجر ✓' : 'جاري الدخول البطيء...'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => replayTriggerRef.current()}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
              <span>إعادة السفر عبر الزمن</span>
            </button>

            <button
              type="button"
              data-testid="skip-time-travel-btn"
              onClick={() => onCompleteRef.current()}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-lg shadow-amber-500/20 transition-colors"
            >
              <span>دخول مباشر</span>
              <ArrowLeft className="w-4 h-4" />
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
