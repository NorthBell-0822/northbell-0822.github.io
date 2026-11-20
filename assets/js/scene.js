// =========================================================
// 背景の3D：すりガラスの立方体と三角すい
// - キャラ画像も3D空間の板として置くので、ガラス越しにぼけて見える
// - WebGL が使えない環境では何もしない（HTML の画像がそのまま見える）
// =========================================================
import * as THREE from 'three';
import { RoomEnvironment } from '/assets/js/vendor/RoomEnvironment.js';
import { RoundedBoxGeometry } from '/assets/js/vendor/RoundedBoxGeometry.js';

const PHI = 1.618;
const canvas = document.getElementById('gl');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---- ページごとの配置（画面に対する割合。黄金比の点を基準） ----
// x, y : 画面の幅・高さに対する位置 (0〜1)
// s    : 画面の短い辺に対する大きさ
const LAYOUTS = {
  top: {
    wide: { cube: { x: .382, y: .618, s: .30 }, pyramid: { x: .17, y: .32, s: .30 / PHI } },
    tall: { cube: { x: .74, y: .50, s: .34 }, pyramid: { x: .24, y: .22, s: .34 / PHI } },
  },
  sub: {
    wide: { cube: { x: .809, y: .618, s: .30 }, pyramid: { x: .70, y: .30, s: .30 / PHI } },
    tall: { cube: { x: .80, y: .86, s: .34 }, pyramid: { x: .12, y: .90, s: .34 / PHI } },
  },
  profile: {
    wide: { cube: { x: .72, y: .80, s: .22 }, pyramid: { x: .86, y: .22, s: .26 / PHI } },
    tall: { cube: { x: .82, y: .40, s: .34 }, pyramid: { x: .86, y: .15, s: .30 / PHI } },
  },
};
const layoutKey = document.body.dataset.scene || 'sub';

function init() {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (e) {
    return; // WebGL なし
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;

  const BG = new THREE.Color('#e7e7e7');
  const scene = new THREE.Scene();
  scene.background = BG;

  // 写り込み用のスタジオ照明
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(0, 0, 10);

  // ---- すりガラス＋パールの質感 ----
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    transmission: 1,          // 透過
    roughness: 0.28,          // すりガラスのぼけ具合（0 で透明ガラス）
    thickness: 1.2,
    ior: 1.45,
    iridescence: 0.5,         // パールの虹色
    iridescenceIOR: 1.35,
    iridescenceThicknessRange: [120, 420],
    clearcoat: 1,
    clearcoatRoughness: 0.15,
    specularIntensity: 1,
    envMapIntensity: 0.55,
  });

  const cube = new THREE.Mesh(new RoundedBoxGeometry(1, 1, 1, 6, 0.06), glass);
  // 三角すい（底面が三角形の錐）
  const pyramid = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1, 3, 1), glass);
  cube.rotation.set(0.5, 0.6, 0.1);
  pyramid.rotation.set(0.45, 0.4, -0.25);
  cube.position.z = 1.6;
  pyramid.position.z = 2.2;
  scene.add(cube, pyramid);

  // ---- キャラ画像を板として置く ----
  const figures = [];
  const loader = new THREE.TextureLoader();
  const pending = [];
  document.querySelectorAll('[data-gl="figure"]').forEach((img) => {
    // transparent にするとガラスの透過に写らないので alphaTest で抜く
    const mat = new THREE.MeshBasicMaterial({ alphaTest: 0.5, toneMapped: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    mesh.visible = false;
    scene.add(mesh);
    figures.push({ img, mesh });
    pending.push(new Promise((resolve) => {
      loader.load(img.currentSrc || img.src, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        mat.map = tex;
        mat.needsUpdate = true;
        mesh.visible = true;
        resolve();
      }, undefined, resolve);
    }));
  });

  // ---- 画面サイズに合わせて配置し直す ----
  let W = 0, H = 0, unit = 1, base = {};
  // 画面上の px 位置 → 奥行き z の面での座標（遠近で位置がずれないように補正）
  function pxToWorld(px, py, z = 0) {
    const u = unitAt(z);
    return [(px - W / 2) * u, -(py - H / 2) * u];
  }
  function unitAt(z) {
    return unit * (camera.position.z - z) / camera.position.z;
  }
  function layout() {
    W = innerWidth; H = innerHeight;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    // z=0 の面で 1px が何ユニットか
    unit = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z) / H;

    const tall = W < 760 || W / H < 0.8;
    const L = LAYOUTS[layoutKey][tall ? 'tall' : 'wide'];
    const short = Math.min(W, H);
    for (const [name, mesh] of [['cube', cube], ['pyramid', pyramid]]) {
      const c = L[name];
      const z = mesh.position.z;
      const [x, y] = pxToWorld(c.x * W, c.y * H, z);
      const s = c.s * short * unitAt(z);
      base[name] = { x, y };
      mesh.scale.setScalar(s);
    }

    for (const f of figures) {
      const r = f.img.getBoundingClientRect();
      // object-fit: contain の実際の描画サイズを求める
      const ar = (f.img.naturalWidth || 1800) / (f.img.naturalHeight || 1209);
      let w = r.width, h = r.width / ar;
      if (h > r.height) { h = r.height; w = h * ar; }
      const [x, y] = pxToWorld(r.left + r.width / 2, r.top + r.height / 2);
      f.mesh.position.set(x, y, 0);
      f.mesh.scale.set(w * unit, h * unit, 1);
    }
  }
  addEventListener('resize', layout);

  // ---- マウスに少しだけ追従 ----
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  addEventListener('pointermove', (e) => {
    pointer.tx = e.clientX / innerWidth - 0.5;
    pointer.ty = e.clientY / innerHeight - 0.5;
  });

  const clock = new THREE.Clock();
  function frame() {
    const t = clock.getElapsedTime();
    pointer.x += (pointer.tx - pointer.x) * 0.04;
    pointer.y += (pointer.ty - pointer.y) * 0.04;

    const m = reduceMotion ? 0 : 1;
    cube.rotation.x = 0.5 + t * 0.09 * m + pointer.y * 0.3;
    cube.rotation.y = 0.6 + t * 0.12 * m + pointer.x * 0.3;
    pyramid.rotation.x = 0.45 + pointer.y * 0.3;
    pyramid.rotation.y = 0.4 - t * 0.15 * m + pointer.x * 0.4;
    pyramid.rotation.z = -0.25 + Math.sin(t * 0.4) * 0.08 * m;

    cube.position.x = base.cube.x - pointer.x * 0.25;
    cube.position.y = base.cube.y + Math.sin(t * 0.6) * 0.06 * m + pointer.y * 0.2;
    pyramid.position.x = base.pyramid.x - pointer.x * 0.4;
    pyramid.position.y = base.pyramid.y + Math.sin(t * 0.5 + 1.6) * 0.08 * m + pointer.y * 0.3;

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  Promise.all(pending).then(() => {
    layout();
    renderer.compile(scene, camera);
    requestAnimationFrame(() => {
      document.documentElement.classList.add('gl-ready');
      frame();
    });
  });
  // 画像やフォントでレイアウトが動いた時のため
  document.fonts?.ready.then(layout);
}

if (canvas) init();
