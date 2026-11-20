// =========================================================
// 「静かな部屋」の背景（リミナルな空間）
// - 白い部屋、黄金比の縦長の窓、光の差し込み、水を張った床
// - 窓の外は夕方の光（#FFCC00 をほんのり）
// - 写真や既存作品は使わず、すべてコードで組み立てている
// =========================================================
import * as THREE from 'three';

const PHI = 1.618;

export function buildRoom(scene, renderer) {
  const group = new THREE.Group();
  scene.add(group);

  const FOG = new THREE.Color('#dfe6e2');
  scene.background = FOG.clone();
  scene.fog = new THREE.Fog(FOG, 14, 46);

  // 部屋の大きさ（カメラは z=10 から奥を見ている）
  const R = { halfW: 10, floor: -3.9, ceil: 7.5, back: -26, front: 12 };

  // ---- 壁・天井 ----
  const wallMat = new THREE.MeshStandardMaterial({ color: '#c9d3ce', roughness: 0.95, envMapIntensity: 0.45 });
  const depth = R.front - R.back;
  const height = R.ceil - R.floor;
  const midZ = (R.front + R.back) / 2;
  const midY = (R.ceil + R.floor) / 2;

  const back = new THREE.Mesh(new THREE.PlaneGeometry(R.halfW * 2, height), wallMat);
  back.position.set(0, midY, R.back);
  const left = new THREE.Mesh(new THREE.PlaneGeometry(depth, height), wallMat);
  left.rotation.y = Math.PI / 2;
  left.position.set(-R.halfW, midY, midZ);
  const right = left.clone();
  right.rotation.y = -Math.PI / 2;
  right.position.x = R.halfW;
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(R.halfW * 2, depth), wallMat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, R.ceil, midZ);
  group.add(back, left, right, ceil);

  // ---- 窓：黄金比の縦長（1 : 1.618）。光そのものとして描く ----
  const winMat = new THREE.MeshBasicMaterial({ color: '#ffffff', fog: false, toneMapped: false });
  winMat.color.setScalar(4);   // 1 より明るくして、水面に強く映るようにする
  const warm = new THREE.Color('#FFCC00');
  const winW = 1.5, winH = winW * PHI;
  const windows = [];
  const addWindow = (x, y, z, ry) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), winMat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    group.add(m);
    windows.push(m);
  };
  // 奥の壁：4 × 2
  for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) {
    addWindow((i - 1.5) * 4.2, R.floor + 3.2 + j * 4.6, R.back + 0.01, 0);
  }
  // 横の壁：奥から手前へ
  for (let k = 0; k < 4; k++) for (let j = 0; j < 2; j++) {
    const z = R.back + 5 + k * 6;
    addWindow(-R.halfW + 0.01, R.floor + 3.2 + j * 4.6, z, Math.PI / 2);
    addWindow(R.halfW - 0.01, R.floor + 3.2 + j * 4.6, z, -Math.PI / 2);
  }

  // 窓まわりのにじみ（ブルームの代わり）
  const glowTex = radialTexture();
  const glowMat = new THREE.SpriteMaterial({
    map: glowTex, color: new THREE.Color('#fffaf0'), transparent: true, opacity: 0.28,
    depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  });
  for (const w of windows) {
    const s = new THREE.Sprite(glowMat);
    s.position.copy(w.position);
    s.scale.set(winW * 2.4, winH * 1.6, 1);
    group.add(s);
  }

  // ---- 光の筋（左上の窓から斜めに） ----
  const shaftMat = new THREE.MeshBasicMaterial({
    map: shaftTexture(), color: warm.clone().lerp(new THREE.Color('#ffffff'), 0.75),
    transparent: true, opacity: 0.22, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  });
  const shafts = [];
  for (let k = 0; k < 3; k++) {
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 16), shaftMat);
    sh.position.set(-6 + k * 1.2, 2.5, -8 - k * 5);
    sh.rotation.set(0, 0.5, 0.62);
    group.add(sh);
    shafts.push(sh);
  }

  // ---- 水面 ----
  // 部屋そのものを一度だけキューブマップに写して、水の写り込みに使う
  const cubeRT = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
  const cubeCam = new THREE.CubeCamera(0.1, 80, cubeRT);
  cubeCam.position.set(0, R.floor - 0.6, -4);
  scene.add(cubeCam);

  const normal = waterNormalTexture();
  normal.wrapS = normal.wrapT = THREE.RepeatWrapping;
  normal.repeat.set(3, 7);
  const waterMat = new THREE.MeshStandardMaterial({
    color: '#1d4d47',          // 深い青緑
    roughness: 0.03,
    metalness: 0.75,
    normalMap: normal,
    normalScale: new THREE.Vector2(0.28, 0.5),
    envMapIntensity: 0.8,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(R.halfW * 2, depth), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, R.floor, midZ);
  group.add(water);

  // 照明（やわらかい外光）
  const hemi = new THREE.HemisphereLight('#ffffff', '#cfe0dc', 1.2);
  const sun = new THREE.DirectionalLight(warm.clone().lerp(new THREE.Color('#ffffff'), 0.6), 0.8);
  sun.position.set(-8, 10, 4);
  group.add(hemi, sun);

  // 水は隠した状態で部屋を撮る
  water.visible = false;
  cubeCam.update(renderer, scene);
  water.visible = true;
  waterMat.envMap = cubeRT.texture;

  return {
    // 縦長の画面では部屋ごと下げて、水面を足元だけにする（文字に被らないように）
    setTall(tall) {
      group.position.y = tall ? -4.6 : 0;
    },
    update(t) {
      normal.offset.set(t * 0.006, -t * 0.011);   // ゆらゆら
      for (let k = 0; k < shafts.length; k++) {
        shafts[k].material.opacity = 0.18 + Math.sin(t * 0.3 + k) * 0.04;
      }
    },
  };
}

// ---- テクスチャをコードで作る ----
function radialTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,.35)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function shaftTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 256;
  const g = c.getContext('2d');
  const h = g.createLinearGradient(0, 0, 64, 0);
  h.addColorStop(0, 'rgba(255,255,255,0)');
  h.addColorStop(0.5, 'rgba(255,255,255,1)');
  h.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = h;
  g.fillRect(0, 0, 64, 256);
  g.globalCompositeOperation = 'destination-in';
  const v = g.createLinearGradient(0, 0, 0, 256);
  v.addColorStop(0, 'rgba(0,0,0,1)');
  v.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = v;
  g.fillRect(0, 0, 64, 256);
  return new THREE.CanvasTexture(c);
}

// 継ぎ目なくつながる、さざ波の法線マップ
function waterNormalTexture() {
  const N = 256;
  const data = new Uint8Array(N * N * 4);
  const waves = [];
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 14; i++) {
    waves.push({ kx: Math.round(rnd() * 8 - 4) || 1, ky: Math.round(rnd() * 8 - 4) || 1, ph: rnd() * 6.28, a: 0.4 + rnd() });
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let dx = 0, dy = 0;
    for (const w of waves) {
      const arg = (2 * Math.PI * (w.kx * x + w.ky * y)) / N + w.ph;
      const c = Math.cos(arg) * w.a;
      dx += c * w.kx;
      dy += c * w.ky;
    }
    const nx = -dx * 0.03, ny = -dy * 0.03, nz = 1;
    const l = Math.hypot(nx, ny, nz);
    const i = (y * N + x) * 4;
    data[i] = ((nx / l) * 0.5 + 0.5) * 255;
    data[i + 1] = ((ny / l) * 0.5 + 0.5) * 255;
    data[i + 2] = ((nz / l) * 0.5 + 0.5) * 255;
    data[i + 3] = 255;
  }
  const t = new THREE.DataTexture(data, N, N);
  t.needsUpdate = true;
  return t;
}
