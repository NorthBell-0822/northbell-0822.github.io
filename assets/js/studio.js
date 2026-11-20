// =========================================================
// 「スタジオ」の背景
// - 床から壁へ、なめらかに曲がってつながる撮影スタジオ（ホリゾント）
// - 誰も座っていないスツール。その上にキャラが浮かぶ
// - 左上からのやわらかい光と、床に落ちる影
// - 写真は使わず、すべてコードで組み立てている
// =========================================================
import * as THREE from 'three';

const FLOOR = -2.7;   // 床を高めにして、画面の下に床と影が見えるように
const PHI = 1.618;

export function buildStudio(scene, renderer) {
  const group = new THREE.Group();
  scene.add(group);

  const BG = new THREE.Color('#c9d5e3');
  scene.background = BG.clone();
  scene.fog = new THREE.Fog(BG, 30, 75);

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // ---- ホリゾント：床 → 曲面 → 壁 を一枚でつなぐ ----
  const R = 7;                 // 床と壁をつなぐ曲面の半径
  const backZ = -24;           // 壁の位置
  const width = 140;
  const profile = [];          // (z, y) の断面
  for (let z = 12; z > backZ + R; z -= 1) profile.push([z, FLOOR]);
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * (Math.PI / 2);
    profile.push([backZ + R - Math.sin(a) * R, FLOOR + R - Math.cos(a) * R]);
  }
  for (let y = FLOOR + R + 1; y <= 40; y += 2) profile.push([backZ, y]);

  const cols = 2;
  const pos = [];
  const idx = [];
  for (let i = 0; i < profile.length; i++) {
    const [z, y] = profile[i];
    for (let c = 0; c < cols; c++) pos.push(-width / 2 + (c * width) / (cols - 1), y, z);
  }
  for (let i = 0; i < profile.length - 1; i++) {
    const a = i * cols, b = (i + 1) * cols;
    idx.push(a, a + 1, b, a + 1, b + 1, b);   // 面の表を上（カメラ側）に向ける
  }
  const cycGeo = new THREE.BufferGeometry();
  cycGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  cycGeo.setIndex(idx);
  cycGeo.computeVertexNormals();
  const cyc = new THREE.Mesh(cycGeo, new THREE.MeshStandardMaterial({ color: '#c3d1e2', roughness: 1, envMapIntensity: 0.15 }));
  cyc.receiveShadow = true;
  group.add(cyc);

  // ---- スツール（誰も座っていない） ----
  const stool = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: '#2a2b2f', roughness: 0.55, metalness: 0.1 });
  const seatH = 2.1;
  const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.6, 0.12, 48), dark);
  seat.position.y = seatH;
  stool.add(seat);
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + Math.PI / 4;
    const top = new THREE.Vector3(Math.cos(a) * 0.38, seatH - 0.05, Math.sin(a) * 0.38);
    const bottom = new THREE.Vector3(Math.cos(a) * 0.62, 0, Math.sin(a) * 0.62);   // 脚は少し外に開く
    const len = top.distanceTo(bottom);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, len, 12), dark);
    leg.position.copy(top).add(bottom).multiplyScalar(0.5);
    leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(bottom).normalize());
    stool.add(leg);
  }
  // 足置きの輪（高さは座面の 1/φ²）
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.022, 10, 64), dark);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = seatH / (PHI * PHI);
  stool.add(ring);
  stool.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  stool.position.set(-2, FLOOR, -7);
  stool.rotation.y = 0.3;
  group.add(stool);

  // ---- 光：左上からのやわらかい窓明かり ----
  const hemi = new THREE.HemisphereLight('#eef3fa', '#8e9cb0', 0.45);
  const key = new THREE.DirectionalLight('#fff6ea', 1.25);
  key.position.set(-9, 14, 8);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -14; key.shadow.camera.right = 14;
  key.shadow.camera.top = 14; key.shadow.camera.bottom = -14;
  key.shadow.camera.near = 1; key.shadow.camera.far = 50;
  key.shadow.radius = 8;
  key.shadow.bias = -0.0005;
  key.target.position.set(0, FLOOR, -6);
  // 壁にほんのり当たる、夕方の黄色（#FFCC00 をごく薄く）
  const warm = new THREE.SpotLight('#ffe08a', 40, 60, 0.5, 0.9, 1.4);
  warm.position.set(14, 8, -6);
  warm.target.position.set(-6, 2, backZ);
  group.add(hemi, key, key.target, warm, warm.target);

  return {
    hidesSky: true,
    wantsShadows: true,
    setTall(tall) {
      group.position.y = tall ? 1.8 : 0;   // スマホでは床を上げて、スツールをキャラのそばに（文字に重ならない）
    },
    // キャラの真下にスツールを置く（キャラがいないページは右寄りの黄金比の位置）
    setAnchor(x, tall) {
      // キャラの少し右奥。キャラがいないページは右寄りの黄金比の位置
      stool.position.x = x != null ? x + (tall ? 1.6 : 1.8) : (tall ? 1.6 : 3.4);
      stool.position.z = tall ? -15 : -7;   // スマホでは奥に下げて、文字に重ならないように
    },
    update(t) {
      stool.rotation.y = 0.3 + Math.sin(t * 0.15) * 0.05;
    },
  };
}
