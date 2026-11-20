// =========================================================
// 背景の3D：すりガラスの立方体と三角すい
// - キャラ画像も3D空間の板として置くので、ガラス越しにぼけて見える
// - WebGL が使えない環境では何もしない（HTML の画像がそのまま見える）
// =========================================================
import * as THREE from 'three';
import { RoomEnvironment } from '/assets/js/vendor/RoomEnvironment.js';
import { RoundedBoxGeometry } from '/assets/js/vendor/RoundedBoxGeometry.js';
import { buildStudio } from '/assets/js/studio.js';

// 背景の世界：'sky'（雲の空）か 'studio'（スツールのあるスタジオ）
// URL の末尾に ?world=studio を付けると切り替えて見比べられる
const PARAMS = new URLSearchParams(location.search);
const WORLD = PARAMS.get('world') || 'sky';
// インスタントカメラ風の質感（ざらつき・にじみ・色かぶり）。?film=off で外せる
const FILM = PARAMS.get('film') !== 'off';
if (!FILM) document.documentElement.dataset.film = 'off';
if (WORLD !== 'sky') document.documentElement.dataset.world = WORLD;
// タブを移動しても、同じ見た目の設定のままにする
if (location.search) {
  document.querySelectorAll('a[href^="/"]').forEach((a) => {
    a.href = a.getAttribute('href') + location.search;
  });
}

const PHI = 1.618;
const canvas = document.getElementById('gl');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---- ページごとの配置（画面に対する割合。黄金比の点を基準） ----
// x, y : 画面の幅・高さに対する位置 (0〜1)
// s    : 画面の短い辺に対する大きさ
const LAYOUTS = {
  top: {
    wide: { cube: { x: .36, y: .60, s: .46 }, pyramid: { x: .15, y: .28, s: .46 / PHI } },
    tall: { cube: { x: .52, y: .36, s: .46 }, pyramid: { x: .80, y: .15, s: .46 / PHI } },
  },
  sub: {
    wide: { cube: { x: .80, y: .60, s: .46 }, pyramid: { x: .66, y: .26, s: .46 / PHI } },
    tall: { cube: { x: .74, y: .72, s: .44 }, pyramid: { x: .24, y: .82, s: .44 / PHI } },
  },
  profile: {
    wide: { cube: { x: .70, y: .78, s: .34 }, pyramid: { x: .88, y: .20, s: .34 / PHI } },
    tall: { cube: { x: .66, y: .76, s: .42 }, pyramid: { x: .84, y: .14, s: .42 / PHI } },
  },
};
const layoutKey = document.body.dataset.scene || 'sub';

// ---- 空のシェーダー ----
// 冷たく澄んだ空気、白い雲、雲の向こうから透ける夕日（#FFCC00）
const SKY_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.9999, 1.0);   // カメラに関係なく画面いっぱい・一番奥
  }
`;
const SKY_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uAspect;
  uniform float uFade;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
               mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
    for (int i = 0; i < 6; i++) { v += a * noise(p); p = r * p * 2.03 + 3.1; a *= 0.5; }
    return v;
  }
  // 雲の濃さ（ゆがませて、ちぎれた雲らしく）
  float cloud(vec2 p) {
    vec2 q = vec2(fbm(p + vec2(0.0, uTime * 0.012)), fbm(p + vec2(5.2, 1.3)));
    float n = fbm(p + 1.6 * q);
    return smoothstep(0.40, 0.70, n);
  }

  void main() {
    vec2 uv = vUv;
    vec2 p = vec2(uv.x * uAspect, uv.y);
    // 少しだけ右上がりに傾けて、横長に伸ばす（雲は縦より横に広がる）
    float a = 0.22;
    p = mat2(cos(a), sin(a), -sin(a), cos(a)) * p;
    p *= vec2(1.3, 2.6);
    p.x += uTime * 0.010;                   // 右へゆっくり流れる

    // 太陽は画面の右下の外
    vec2 sunPos = vec2(0.80 * uAspect, -0.08);
    vec2 sp = vec2(uv.x * uAspect, uv.y);
    float sunD = length(sp - sunPos);
    vec2 toSun = normalize(sunPos - sp);

    // 空：上は冷たい青、下は白っぽく
    vec3 skyTop = vec3(0.70, 0.78, 0.89);
    vec3 skyLow = vec3(0.90, 0.92, 0.94);
    vec3 col = mix(skyLow, skyTop, smoothstep(0.0, 1.0, uv.y));

    float d  = cloud(p);
    float d2 = cloud(p + toSun * 0.06);      // 太陽側に少しずらして、光の当たり方を出す
    float lit = clamp(0.6 + (d - d2) * 3.0, 0.0, 1.0);
    lit *= 1.0 - smoothstep(0.75, 1.0, d) * 0.35;   // 厚いところは少し暗く（もこもこ感）

    vec3 shadow = vec3(0.64, 0.67, 0.74);    // 雲の影：冷たいグレー
    vec3 white  = vec3(1.0, 1.0, 0.995);
    vec3 cloudCol = mix(shadow, white, lit);

    // 夕日：太陽に近いほど、雲の縁が黄色く透ける
    vec3 sunCol = vec3(1.0, 0.80, 0.0);      // #FFCC00
    float glow = exp(-sunD * 2.6);
    float rim = smoothstep(0.15, 0.6, d) * (1.0 - smoothstep(0.6, 1.0, d));   // 薄いところほど透ける
    cloudCol += sunCol * glow * (0.35 + rim * 0.9);

    col = mix(col, cloudCol, d * 0.92);
    col += sunCol * exp(-sunD * 4.0) * 0.45;          // 太陽まわりの光
    col = mix(col, vec3(1.0), exp(-sunD * 9.0) * 0.6); // 中心は白く飛ばす

    // 文字が読めるように、全体を白っぽく淡くする
    col = mix(col, vec3(0.93, 0.94, 0.95), uFade);
    // ここまでの色は見た目（sRGB）で決めているので、リニアに直してから three.js に渡す
    gl_FragColor = vec4(pow(col, vec3(2.2)), 1.0);
    #include <colorspace_fragment>
  }
`;

// ---- フィルムの仕上げ（画面全体にかける最後の一手） ----
const FILM_FRAG = /* glsl */ `
  // ふんわり明るい、チェキ風の仕上げ
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tScene;
  uniform vec2 uRes;
  uniform float uTime;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

  void main() {
    vec2 uv = vUv;
    vec2 c = uv - 0.5;
    vec3 col = texture2D(tScene, uv).rgb;

    // 1. ふんわり光る：明るいところから、白っぽい光がやわらかくあふれる
    vec3 bloom = vec3(0.0);
    for (int i = 0; i < 16; i++) {
      float a = float(i) * 0.3927;
      float r = (i < 8) ? 0.006 : 0.016;
      vec2 d = vec2(cos(a), sin(a) * uRes.x / uRes.y) * r;
      vec3 sm = texture2D(tScene, uv + d).rgb;
      sm = sm / (1.0 + sm);                       // 明るさを 0〜1 に収めてから判定（白い物が光って見えないように）
      bloom += max(sm - 0.62, 0.0);
    }
    col += bloom / 16.0 * vec3(1.0, 0.96, 0.93) * 1.6;

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    col = pow(clamp(gl_FragColor.rgb, 0.0, 1.0), vec3(1.0 / 2.2));

    // 2. 色：コントラストを少し下げて明るく。影はラベンダー、明るいところはクリーム
    col = mix(vec3(0.13, 0.12, 0.17), vec3(1.0, 0.99, 0.965), col);
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(lum), col, 1.06);                       // ほんの少しだけ色を濃く

    // 3. 光漏れ：右上からピンクと黄色がうっすら（ゆっくり呼吸する）
    float leakA = smoothstep(0.75, 0.0, length((uv - vec2(1.05, 1.02)) * vec2(1.0, 1.4)));
    float leakB = smoothstep(0.55, 0.0, length((uv - vec2(0.92, 1.1)) * vec2(1.6, 1.0)));
    float breathe = 0.85 + 0.15 * sin(uTime * 0.4);
    col += vec3(1.0, 0.72, 0.80) * leakA * 0.10 * breathe;   // ピンク
    col += vec3(1.0, 0.85, 0.30) * leakB * 0.07 * breathe;   // 黄色（#FFCC00 寄り）

    // 4. 四隅をほんのり白く飛ばす（明るい写真の周辺）
    col = mix(col, vec3(1.0, 0.985, 0.975), smoothstep(0.45, 0.95, length(c * vec2(1.15, 1.0))) * 0.22);

    // 5. 細かい粒子：控えめに
    vec2 px = floor(uv * uRes);
    float t = floor(uTime * 12.0);
    float g = hash(px + t * 17.13) - 0.5;
    col += g * 0.035;

    gl_FragColor = vec4(col, 1.0);
  }
`;

function init() {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (e) {
    return; // WebGL なし
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));   // 高精細な画面ではキャラもくっきり
  renderer.toneMapping = THREE.NeutralToneMapping;   // 色がくすまないトーンマップ
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#e7e7e7');

  // 写り込み用のスタジオ照明
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  // ---- 背景の空と雲（写真は使わず、ノイズで描いている） ----
  const sky = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms: {
        uTime:   { value: 0 },
        uAspect: { value: 1 },
        uFade:   { value: Number(document.body.dataset.skyFade ?? 0.25) },
      },
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      depthWrite: false,
      depthTest: false,
    })
  );
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  let room = null;   // 追加の世界（アーチの水辺など）
  if (WORLD === 'studio') room = buildStudio(scene, renderer);
  if (!room?.hidesSky) scene.add(sky);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 300);
  camera.position.set(0, 0, 10);

  // フィルム仕上げ用：一度テクスチャに描いてから、全画面の板で仕上げる
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const postMat = new THREE.ShaderMaterial({
    uniforms: { tScene: { value: rt.texture }, uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: FILM_FRAG,
    depthTest: false,
    depthWrite: false,
  });
  const postScene = new THREE.Scene();
  const postQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat);
  postQuad.frustumCulled = false;
  postScene.add(postQuad);

  // ---- すりガラス＋パールの質感 ----
  // ---- ガラスブロックの質感 ----
  // 厚みのある透明ガラス。表面がゆらゆら波打っていて、向こう側が歪んで見える。
  // 縁はほんのり青緑、中には小さな気泡
  const ripple = glassBlockNormalTexture();
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    transmission: 1,          // 透過
    roughness: 0.04,          // ほぼ透明（ぼかしではなく、波打ちで歪ませる）
    thickness: 1.0,           // 厚いほど屈折が強くなる
    ior: 1.5,
    normalMap: ripple,        // 表面の波打ち
    normalScale: new THREE.Vector2(0.32, 0.32),
    attenuationColor: new THREE.Color('#e4f4ee'),   // 厚いところほど、ほんのり青緑に
    attenuationDistance: 7,
    iridescence: 0.15,        // パールの虹色はほんの少し
    iridescenceIOR: 1.35,
    iridescenceThicknessRange: [120, 420],
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    specularIntensity: 1,
    envMapIntensity: 0.42,
  });

  // 三角すい用：色のない、すっきり透明なガラス
  const clearGlass = glass.clone();
  clearGlass.roughness = 0.03;
  clearGlass.normalScale = new THREE.Vector2(0.5, 0.5);
  clearGlass.thickness = 0.6;
  clearGlass.iridescence = 0.5;
  clearGlass.envMapIntensity = 0.7;   // 透明でも輪郭が見えるよう、写り込みは少し強め

  const cube = new THREE.Mesh(new RoundedBoxGeometry(1, 1, 0.82, 6, 0.07), glass);
  cube.rotation.set(0.5, 0.6, 0.1);

  // 気泡：ガラスの中に小さな粒を散らす
  const bubbleMat = new THREE.MeshPhysicalMaterial({ color: '#ffffff', metalness: 1, roughness: 0.05, envMapIntensity: 1.6 });
  const bubbleGeo = new THREE.SphereGeometry(1, 10, 8);
  let seed = 3;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 46; i++) {
    const b = new THREE.Mesh(bubbleGeo, bubbleMat);
    b.position.set((rnd() - 0.5) * 0.8, (rnd() - 0.5) * 0.8, (rnd() - 0.5) * 0.62);
    b.scale.setScalar(0.004 + rnd() * rnd() * 0.016);
    cube.add(b);
  }

  // 三角すい（底面が三角形の錐）。先端を右に向けて「再生ボタン ▶」に見立てる
  const pyramidMesh = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1, 3, 1), clearGlass);
  const pyramid = new THREE.Group();
  pyramid.add(pyramidMesh);
  pyramid.rotation.z = -Math.PI / 2;
  cube.position.z = 1.6;
  pyramid.position.z = 2.2;
  if (!room?.hideGlass) scene.add(cube, pyramid);

  // ---- キャラ画像を板として置く ----
  const figures = [];
  const loader = new THREE.TextureLoader();
  const pending = [];
  if (!room?.hideFigure) document.querySelectorAll('[data-gl="figure"]').forEach((img) => {
    // transparent にするとガラスの透過に写らないので、alphaToCoverage で縁をなめらかに抜く
    const mat = new THREE.MeshBasicMaterial({ alphaToCoverage: true, toneMapped: false, fog: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    mesh.visible = false;
    scene.add(mesh);
    figures.push({ img, mesh });
    pending.push(new Promise((resolve) => {
      loader.load(img.currentSrc || img.src, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.generateMipmaps = true;
        mat.map = tex;
        mat.needsUpdate = true;
        if (room?.wantsShadows) {
          // キャラの形どおりの影を床に落とす
          mesh.castShadow = true;
          mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ map: tex, alphaTest: 0.5 });
        }
        mesh.visible = true;
        resolve();
      }, undefined, resolve);
    }));
  });

  // ---- 画面サイズに合わせて配置し直す ----
  let W = 0, H = 0, unit = 1, base = {};
  // 地平線を下げるためのレンズシフト量（px）。建築写真のように縦の線は傾かない
  let shiftY = 0;
  // 画面上の px 位置 → 奥行き z の面での座標（遠近で位置がずれないように補正）
  function pxToWorld(px, py, z = 0) {
    const u = unitAt(z);
    return [(px - W / 2) * u, -(py - shiftY - H / 2) * u];
  }
  function unitAt(z) {
    return unit * (camera.position.z - z) / camera.position.z;
  }
  function layout() {
    W = innerWidth; H = innerHeight;
    renderer.setSize(W, H, false);
    const dpr = renderer.getPixelRatio();
    rt.setSize(Math.round(W * dpr), Math.round(H * dpr));
    postMat.uniforms.uRes.value.set(W * dpr, H * dpr);
    sky.material.uniforms.uAspect.value = W / H;
    const tall = W < 760 || W / H < 0.8;
    room?.setTall(tall);
    shiftY = (room?.horizonShift?.(tall) ?? 0) * H;
    camera.aspect = W / H;
    if (shiftY) camera.setViewOffset(W, H, 0, -shiftY, W, H);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    // 世界によっては、カメラの位置と向きを変える（スタジオは少し上から見下ろす）
    if (room?.pose) room.pose(camera, tall);
    // z=0 の面で 1px が何ユニットか
    unit = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z) / H;

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
      const ar = (f.img.naturalWidth || 2566) / (f.img.naturalHeight || 1724);
      let w = r.width, h = r.width / ar;
      if (h > r.height) { h = r.height; w = h * ar; }
      const [x, y] = pxToWorld(r.left + r.width / 2, r.top + r.height / 2);
      f.mesh.position.set(x, y, 0);
      f.mesh.scale.set(w * unit, h * unit, 1);
    }
    room?.setAnchor?.(figures[0]?.mesh.position.x, tall);
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
    sky.material.uniforms.uTime.value = 20 + t * m;
    room?.update(t * m);
    cube.rotation.x = 0.5 + t * 0.09 * m + pointer.y * 0.3;
    cube.rotation.y = 0.6 + t * 0.12 * m + pointer.x * 0.3;
    pyramidMesh.rotation.y = 0.5 + t * 0.35 * m;              // 先端の軸まわりにくるくる
    pyramid.rotation.x = pointer.y * 0.4;
    pyramid.rotation.y = pointer.x * 0.4;
    pyramid.rotation.z = -Math.PI / 2 + Math.sin(t * 0.4) * 0.08 * m;

    cube.position.x = base.cube.x - pointer.x * 0.25;
    cube.position.y = base.cube.y + Math.sin(t * 0.6) * 0.06 * m + pointer.y * 0.2;
    pyramid.position.x = base.pyramid.x - pointer.x * 0.4;
    pyramid.position.y = base.pyramid.y + Math.sin(t * 0.5 + 1.6) * 0.08 * m + pointer.y * 0.3;

    if (FILM) {
      postMat.uniforms.uTime.value = t;
      renderer.setRenderTarget(rt);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.render(postScene, postCam);
    } else {
      renderer.render(scene, camera);
    }
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

// ガラスブロックの表面の「ゆらぎ」。継ぎ目なくつながる法線マップをコードで作る
function glassBlockNormalTexture() {
  const N = 256;
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  // 大きなうねり＋細かいでこぼこ（ハンマーで叩いたような面）
  const waves = [];
  for (let i = 0; i < 10; i++) waves.push({ kx: Math.round(rnd() * 4 - 2) || 1, ky: Math.round(rnd() * 4 - 2) || 1, ph: rnd() * 6.28, a: 1.6 });
  for (let i = 0; i < 18; i++) waves.push({ kx: Math.round(rnd() * 16 - 8) || 3, ky: Math.round(rnd() * 16 - 8) || 3, ph: rnd() * 6.28, a: 0.12 });
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let dx = 0, dy = 0;
    for (const w of waves) {
      const arg = (2 * Math.PI * (w.kx * x + w.ky * y)) / N + w.ph;
      const c = Math.cos(arg) * w.a;
      dx += c * w.kx;
      dy += c * w.ky;
    }
    const nx = -dx * 0.045, ny = -dy * 0.045;
    const l = Math.hypot(nx, ny, 1);
    const i = (y * N + x) * 4;
    data[i] = (nx / l * 0.5 + 0.5) * 255;
    data[i + 1] = (ny / l * 0.5 + 0.5) * 255;
    data[i + 2] = (1 / l * 0.5 + 0.5) * 255;
    data[i + 3] = 255;
  }
  const t = new THREE.DataTexture(data, N, N);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}
