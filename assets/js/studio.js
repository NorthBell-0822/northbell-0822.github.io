// =========================================================
// 「スタジオ」の背景
// - 床から壁へ、なめらかに曲がってつながる撮影スタジオ（ホリゾント）
// - 誰も座っていないスツール
// - 画面の外にある「窓」や「柱」の影が床と壁に落ちて、
//   見えていない部分にも空間が続いているように感じさせる
// - 写真は使わず、すべてコードで組み立てている
// =========================================================
import * as THREE from 'three';

const PHI = 1.618;
const FLOOR = -2.2;

export function buildStudio(scene, renderer) {
  const group = new THREE.Group();
  scene.add(group);

  const BG = new THREE.Color('#b9c8db');
  scene.background = BG.clone();
  scene.fog = new THREE.Fog(BG, 26, 60);

  // やわらかくぼける影
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // ---- ホリゾント：床 → 曲面 → 壁 を一枚でつなぐ ----
  const R = 4.5;               // 床と壁をつなぐ曲面の半径
  const backZ = -15;           // 壁の位置
  const width = 120;
  const profile = [];          // (z, y) の断面
  for (let z = 12; z > backZ + R; z -= 0.5) profile.push([z, FLOOR]);
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * (Math.PI / 2);
    profile.push([backZ + R - Math.sin(a) * R, FLOOR + R - Math.cos(a) * R]);
  }
  for (let y = FLOOR + R + 0.5; y <= 30; y += 0.5) profile.push([backZ, y]);
  const cols = 60;
  const pos = [], idx = [];
  for (const [z, y] of profile) {
    for (let c = 0; c < cols; c++) pos.push(-width / 2 + (c * width) / (cols - 1), y, z);
  }
  for (let i = 0; i < profile.length - 1; i++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = i * cols + c, b = (i + 1) * cols + c;
      idx.push(a, a + 1, b, a + 1, b + 1, b);   // 面の表をカメラ側へ
    }
  }
  const cycGeo = new THREE.BufferGeometry();
  cycGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  cycGeo.setIndex(idx);
  cycGeo.computeVertexNormals();
  const cyc = new THREE.Mesh(cycGeo, new THREE.MeshStandardMaterial({ color: '#b3c3d6', roughness: 1, envMapIntensity: 0.05 }));
  cyc.receiveShadow = true;
  group.add(cyc);

  // ---- スツール（誰も座っていない） ----
  const stool = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: '#26272b', roughness: 0.5, metalness: 0.1 });
  const seatH = 2.3;
  const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.58, 0.12, 48), dark);
  seat.position.y = seatH;
  stool.add(seat);
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + Math.PI / 4;
    const top = new THREE.Vector3(Math.cos(a) * 0.38, seatH - 0.05, Math.sin(a) * 0.38);
    const bottom = new THREE.Vector3(Math.cos(a) * 0.6, 0, Math.sin(a) * 0.6);   // 脚は少し外に開く
    const len = top.distanceTo(bottom);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, len, 12), dark);
    leg.position.copy(top).add(bottom).multiplyScalar(0.5);
    leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(bottom).normalize());
    stool.add(leg);
  }
  // 足置きの輪（高さは座面の 1/φ²）
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.024, 10, 64), dark);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = seatH / (PHI * PHI);
  stool.add(ring);
  stool.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  stool.position.set(-1.6, FLOOR, -6);
  stool.rotation.y = 0.3;
  group.add(stool);

  // ---- 画面の外にある「窓のある壁」と「柱」：見えないが影だけ落とす ----
  const ghost = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  const occluders = new THREE.Group();
  // 窓の格子：縦長の窓（1 : φ）が2つ並ぶ壁。光はこの窓を通って床と奥の壁に落ちる
  const winW = 2.2, winH = winW * PHI, gap = 0.5, frame = 6;
  const wallParts = [
    // [幅, 高さ, x, y]  ※窓の外側を埋める板
    [frame * 2 + winW * 2 + gap, frame, 0, winH / 2 + frame / 2],     // 上
    [frame * 2 + winW * 2 + gap, frame, 0, -winH / 2 - frame / 2],    // 下
    [frame, winH, -(winW + gap / 2) - frame / 2, 0],                  // 左
    [frame, winH, (winW + gap / 2) + frame / 2, 0],                   // 右
    [gap, winH, 0, 0],                                                // 窓と窓のあいだ
    [winW * 2 + gap, 0.12, 0, 0.35],                                  // 横の桟
  ];
  for (const [w, h, x, y] of wallParts) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.2), ghost);
    m.position.set(x, y, 0);
    m.castShadow = true;
    occluders.add(m);
  }
  // 光の向きに対して窓を立てる（左上・手前に、画面の外）
  occluders.position.set(-6.5, 13.5, 1.1);
  occluders.lookAt(0, FLOOR, -8);
  group.add(occluders);
  const OCC = occluders.position.clone();
  // 右手前の柱：奥の壁に、縦長の影を落とす
  const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 30, 1.4), ghost);
  pillar.position.set(13, 6, 2);
  pillar.castShadow = true;
  group.add(pillar);

  // ---- 光 ----
  // 窓から差し込む光（強め・少し温かい白）
  const sun = new THREE.DirectionalLight('#fff4e2', 2.4);
  sun.position.set(-10, 22, 6);   // 高めの位置から差し込む光
  sun.target.position.set(0, FLOOR, -8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);   // 影を高精細に
  Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 70 });
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.02;
  // 部屋全体のやわらかい青い光（影の部分の色）
  const hemi = new THREE.HemisphereLight('#dbe6f3', '#7f8fa6', 0.26);
  // 右の壁にごく薄く当たる夕方の黄色（#FFCC00）
  const warm = new THREE.SpotLight('#ffd76a', 30, 50, 0.45, 1, 1.5);
  warm.position.set(12, 6, -4);
  warm.target.position.set(4, 1, backZ);
  group.add(sun, sun.target, hemi, warm, warm.target);

  return {
    hidesSky: true,
    hideFigure: true,
    hideGlass: true,    // スツールと影を見せるため、ガラスも一旦しまう
    // カメラ：少し上から、スツールを見下ろす
    pose(camera, tall) {
      camera.position.set(0, tall ? 6.5 : 6, tall ? 13 : 12);
      camera.lookAt(stool.position.x * 0.4, FLOOR + 1.2, stool.position.z + (tall ? -1 : 0));
    },
    setTall(tall) {
      // ページと画面の向きで、文字に重ならない場所に置く
      const page = document.body.dataset.scene || 'sub';
      const spot = tall
        ? (page === 'top' ? [0.4, -13, 0] : [1.2, -6, 0])         // [x, z, 床の持ち上げ]
        : (page === 'top' ? [-3.2, -7, 0] : [4.4, -7, 0]);
      const [x, z, lift] = spot;
      group.position.y = lift;
      stool.position.set(x, FLOOR, z);
      // 窓の光だまりも、スツールと一緒に動かす
      occluders.position.set(OCC.x + (x + 0.2), OCC.y, OCC.z + (z + 7));
    },
    update(t) {
      stool.rotation.y = 0.3 + Math.sin(t * 0.15) * 0.04;
    },
  };
}
