// =========================================================
// 背景の3D：すりガラスの立方体と三角すい
// - キャラ画像も3D空間の板として置くので、ガラス越しにぼけて見える
// - WebGL が使えない環境では何もしない（HTML の画像がそのまま見える）
// =========================================================
import * as THREE from 'three';
import { RoomEnvironment } from '/assets/js/vendor/RoomEnvironment.js';
import { RoundedBoxGeometry } from '/assets/js/vendor/RoundedBoxGeometry.js';
import { buildRoom } from '/assets/js/room.js';

// 背景の世界：'sky'（雲の空）か 'room'（静かな部屋）
// URL の末尾に ?world=room を付けると切り替えて見比べられる
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
    wide: { cube: { x: .382, y: .618, s: .30 }, pyramid: { x: .17, y: .32, s: .30 / PHI } },
    tall: { cube: { x: .50, y: .36, s: .30 }, pyramid: { x: .80, y: .17, s: .30 / PHI } },
  },
  sub: {
    wide: { cube: { x: .809, y: .618, s: .30 }, pyramid: { x: .70, y: .30, s: .30 / PHI } },
    tall: { cube: { x: .76, y: .70, s: .30 }, pyramid: { x: .26, y: .80, s: .30 / PHI } },
  },
  profile: {
    wide: { cube: { x: .72, y: .80, s: .22 }, pyramid: { x: .86, y: .22, s: .26 / PHI } },
    tall: { cube: { x: .66, y: .74, s: .30 }, pyramid: { x: .86, y: .14, s: .28 / PHI } },
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
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tScene;
  uniform vec2 uRes;
  uniform float uTime;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

  void main() {
    vec2 uv = vUv;
    vec2 c = uv - 0.5;
    float r2 = dot(c, c);

    // 1. 端ほど色がずれる（安いレンズっぽさ）
    vec2 off = c * r2 * 0.018;
    vec3 col;
    col.r = texture2D(tScene, uv + off).r;
    col.g = texture2D(tScene, uv).g;
    col.b = texture2D(tScene, uv - off).b;

    // 2. にじみ：明るいところの周りが赤橙ににじむ（ハレーション）＋全体を少しだけ甘く
    vec3 glow = vec3(0.0), soft = vec3(0.0);
    for (int i = 0; i < 12; i++) {
      float a = float(i) * 0.5236;
      vec2 d = vec2(cos(a), sin(a) * uRes.x / uRes.y);
      vec3 s1 = texture2D(tScene, uv + d * 0.004).rgb;
      vec3 s2 = texture2D(tScene, uv + d * 0.011).rgb;
      soft += s1;
      glow += max(s1 - 1.0, 0.0) + max(s2 - 1.0, 0.0) * 0.7;
    }
    soft /= 12.0;
    col = mix(col, soft, 0.22);
    col += glow / 12.0 * vec3(1.0, 0.62, 0.42) * 0.55;

    // ここで普段どおりのトーンマップをかけてから、見た目の色（sRGB）で仕上げる
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    col = pow(clamp(gl_FragColor.rgb, 0.0, 1.0), vec3(1.0 / 2.2));

    // 3. 色：黒を浮かせて白を少し抑える（フィルムの淡さ）
    col = mix(vec3(0.07, 0.075, 0.085), vec3(0.975, 0.965, 0.93), col);
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col += (1.0 - lum) * vec3(-0.012, 0.012, 0.022);   // 影は青緑寄り
    col += lum * vec3(0.018, 0.008, -0.022);            // 明るいところは温かく

    // 4. 光漏れ：左上からうっすら（ゆっくり呼吸する）
    float leak = smoothstep(0.85, 0.0, length((uv - vec2(-0.05, 1.05)) * vec2(1.0, 1.3)));
    col += vec3(1.0, 0.62, 0.25) * leak * (0.07 + 0.03 * sin(uTime * 0.35));

    // 5. 周辺減光
    col *= 1.0 - smoothstep(0.3, 0.85, length(c * vec2(1.1, 1.0))) * 0.3;

    // 6. 粒子：毎フレーム変わる、中間調に強めのざらつき
    vec2 px = floor(uv * uRes / 1.5);
    float t = floor(uTime * 24.0);
    float g = hash(px + t * 17.13) - 0.5;
    vec3 gc = vec3(hash(px + t * 3.1 + 1.7), hash(px + t * 5.3 + 4.2), hash(px + t * 7.7 + 9.1)) - 0.5;
    float amt = 0.11 * (1.0 - abs(lum - 0.5) * 0.9);
    col += g * amt + gc * amt * 0.35;

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
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
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
  let room = null;
  if (WORLD === 'room') room = buildRoom(scene, renderer);
  else scene.add(sky);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
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
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    transmission: 1,          // 透過
    roughness: 0.17,          // すりガラスのぼけ具合（0 で透明ガラス）
    thickness: 0.8,
    ior: 1.45,
    iridescence: 0.5,         // パールの虹色
    iridescenceIOR: 1.35,
    iridescenceThicknessRange: [120, 420],
    clearcoat: 0.5,
    clearcoatRoughness: 0.15,
    specularIntensity: 1,
    envMapIntensity: 0.3,     // 写り込みを控えめにして、向こう側を見せる
  });

  // 三角すい用：色のない、すっきり透明なガラス
  const clearGlass = glass.clone();
  clearGlass.roughness = 0.04;
  clearGlass.thickness = 0.6;
  clearGlass.iridescence = 0.5;
  clearGlass.envMapIntensity = 0.7;   // 透明でも輪郭が見えるよう、写り込みは少し強め

  const cube = new THREE.Mesh(new RoundedBoxGeometry(1, 1, 1, 6, 0.06), glass);
  cube.rotation.set(0.5, 0.6, 0.1);

  // 三角すい（底面が三角形の錐）。先端を右に向けて「再生ボタン ▶」に見立てる
  const pyramidMesh = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1, 3, 1), clearGlass);
  const pyramid = new THREE.Group();
  pyramid.add(pyramidMesh);
  pyramid.rotation.z = -Math.PI / 2;
  cube.position.z = 1.6;
  pyramid.position.z = 2.2;
  scene.add(cube, pyramid);

  // ---- キャラ画像を板として置く ----
  const figures = [];
  const loader = new THREE.TextureLoader();
  const pending = [];
  document.querySelectorAll('[data-gl="figure"]').forEach((img) => {
    // transparent にするとガラスの透過に写らないので alphaTest で抜く
    const mat = new THREE.MeshBasicMaterial({ alphaTest: 0.5, toneMapped: false, fog: false });
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
    const dpr = renderer.getPixelRatio();
    rt.setSize(Math.round(W * dpr), Math.round(H * dpr));
    postMat.uniforms.uRes.value.set(W * dpr, H * dpr);
    sky.material.uniforms.uAspect.value = W / H;
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    // z=0 の面で 1px が何ユニットか
    unit = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z) / H;

    const tall = W < 760 || W / H < 0.8;
    room?.setTall(tall);
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
