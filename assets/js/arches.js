// =========================================================
// 「アーチの水辺」の背景
// - 白く太いアーチが、鏡のような水面に奥まで並ぶ
// - 空は淡い青。地平線だけ、ほんのり夕焼けの色
// - 写真は使わず、すべてコードで組み立てている
// =========================================================
import * as THREE from 'three';
import { Reflector } from '/assets/js/vendor/Reflector.js';

const FLOOR = -3.6;

export function buildArches(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const HAZE = new THREE.Color('#dfe4e8');
  scene.fog = new THREE.Fog(HAZE, 30, 150);

  // ---- 空（画面いっぱいのグラデーション） ----
  const sky = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms: { uHorizon: { value: 0.5 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }',
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv;
        uniform float uHorizon;
        void main() {
          float h = vUv.y - uHorizon;                       // 地平線からの高さ
          vec3 top  = vec3(0.64, 0.73, 0.82);               // 上：淡い青
          vec3 mid  = vec3(0.86, 0.88, 0.89);               // 地平線近く：白っぽい
          vec3 warm = vec3(0.86, 0.72, 0.48);               // 地平線：夕焼けの帯
          vec3 col = mix(mid, top, smoothstep(0.0, 0.55, h));
          // 左寄りの地平線に、夕焼けの色がにじむ
          float glow = exp(-abs(h) * 28.0) * smoothstep(0.9, 0.0, vUv.x);
          col = mix(col, warm, glow * 0.75);
          gl_FragColor = vec4(pow(col, vec3(2.2)), 1.0);
          #include <colorspace_fragment>
        }
      `,
      depthWrite: false,
      depthTest: false,
    })
  );
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  scene.add(sky);

  // ---- アーチの形（外側の U 字から、内側の U 字をくり抜く） ----
  function archShape(w, h, band) {
    // 外側の線と内側の線を一筆書きでつないだ、逆U字の輪郭
    const r = w / 2, ir = r - band;
    const s = new THREE.Shape();
    s.moveTo(-r, 0);
    s.lineTo(-r, h - r);
    s.absarc(0, h - r, r, Math.PI, 0, true);   // 外側の半円（左→右）
    s.lineTo(r, 0);
    s.lineTo(ir, 0);
    s.lineTo(ir, h - r);
    s.absarc(0, h - r, ir, 0, Math.PI, false); // 内側の半円（右→左）
    s.lineTo(-ir, 0);
    s.lineTo(-r, 0);
    return s;
  }
  const W = 3.2, H = 9.5, BAND = 0.62, DEPTH = 1.5;
  const archGeo = new THREE.ExtrudeGeometry(archShape(W, H, BAND), {
    depth: DEPTH,
    bevelEnabled: true,
    bevelThickness: 0.14,
    bevelSize: 0.14,
    bevelSegments: 6,
    curveSegments: 48,
  });
  archGeo.translate(0, 0, -DEPTH / 2);
  const archMat = new THREE.MeshStandardMaterial({ color: '#d6d2cd', roughness: 0.85, envMapIntensity: 0.35 });
  // 足元の台座（少しだけ色が濃い帯）
  const plinthGeo = new THREE.BoxGeometry(BAND + 0.42, 0.32, DEPTH + 0.42);
  const plinthMat = new THREE.MeshStandardMaterial({ color: '#d9d6d2', roughness: 0.9, envMapIntensity: 0.4 });

  function addArch(x, z, ry, scale = 1) {
    const a = new THREE.Group();
    a.add(new THREE.Mesh(archGeo, archMat));
    for (const sx of [-1, 1]) {
      const p = new THREE.Mesh(plinthGeo, plinthMat);
      p.position.set(sx * (W / 2 - BAND / 2), 0.16, 0);
      a.add(p);
    }
    a.position.set(x, FLOOR, z);
    a.rotation.y = ry;
    a.scale.setScalar(scale);
    group.add(a);
  }

  // 並べ方：手前に大きな1基、奥へ向かって不規則に。開口部の向きはまちまち
  let seed = 5;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  addArch(-3.6, -17, 0.25, 1.1);                 // キャラの奥の大きなアーチ
  addArch(5.4, -24, Math.PI / 2 - 0.15, 1);
  addArch(-10.5, -26, Math.PI / 2 + 0.1, 1);
  for (let i = 0; i < 18; i++) {
    const z = -32 - rnd() * 100;
    const x = (rnd() - 0.5) * (24 + -z * 0.5);
    if (Math.abs(x) < 2.2 && z > -40) continue;   // 正面の抜けは少し空ける
    const ry = rnd() < 0.55 ? Math.PI / 2 + (rnd() - 0.5) * 0.3 : (rnd() - 0.5) * 0.4;
    addArch(x, z, ry, 0.9 + rnd() * 0.25);
  }

  // ---- 鏡のような水面 ----
  const water = new Reflector(new THREE.PlaneGeometry(600, 600), {
    textureWidth: 1024,
    textureHeight: 1024,
    color: new THREE.Color('#9fb0c0'),
    shader: {
      name: 'StillWater',
      uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null }, uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        uniform mat4 textureMatrix;
        varying vec4 vUv;
        varying vec3 vWorld;
        void main() {
          vUv = textureMatrix * vec4(position, 1.0);
          vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 color;
        uniform sampler2D tDiffuse;
        uniform float uTime;
        varying vec4 vUv;
        varying vec3 vWorld;
        void main() {
          // ごくわずかな揺らぎ（ほぼ静止した水）
          vec2 w = vec2(sin(vWorld.z * 0.6 + uTime * 0.5) + sin(vWorld.x * 0.4 - uTime * 0.3),
                        cos(vWorld.x * 0.5 + uTime * 0.4)) * 0.0012;
          vec4 uv = vUv;
          uv.xy += w * uv.w;
          vec3 refl = texture2DProj(tDiffuse, uv).rgb;
          // 映り込みを少し暗く、青灰色に寄せる
          vec3 col = refl * color * 0.92;
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    },
  });
  water.rotation.x = -Math.PI / 2;
  water.position.y = FLOOR;
  group.add(water);

  // ---- 光：夕方の、低くやわらかい光 ----
  const hemi = new THREE.HemisphereLight('#dfe9f4', '#7d8996', 0.6);
  const sun = new THREE.DirectionalLight('#ffe6c2', 1.15);
  sun.position.set(-10, 7, 6);   // 左手前の低い光で、アーチの丸みに陰影をつける
  const fill = new THREE.DirectionalLight('#cfdcea', 0.25);
  fill.position.set(8, 4, 10);
  group.add(hemi, sun, fill);

  return {
    hidesSky: true,
    setTall(tall) {
      // 縦長の画面ではアーチを少し下げる（地平線はカメラの高さ＝画面の中央のまま）
      group.position.y = tall ? -0.8 : 0;
    },
    update(t) {
      water.material.uniforms.uTime.value = t;
    },
  };
}
