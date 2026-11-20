// =========================================================
// 「アーチの水辺」の背景（オーナーの Blender 作品をもとに再現）
// - 角の丸い、厚みのある白いアーチが、鏡のような水面に並ぶ
// - 低い位置から見上げる構図：地平線を画面の下寄りに置く（レンズシフト）
// - 空は淡い青。左奥の地平線だけ、夕焼けの色がにじむ
// =========================================================
import * as THREE from 'three';
import { Reflector } from '/assets/js/vendor/Reflector.js';

const FLOOR = -3.6;

export function buildArches(scene) {
  const group = new THREE.Group();
  scene.add(group);

  scene.fog = new THREE.Fog(new THREE.Color('#e3e6e8'), 45, 190);

  // ---- 空：大きな球の内側に描く（水面にも正しく映るように、方向で色を決める） ----
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(260, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec3 vDir;
        void main() {
          float h = max(vDir.y, 0.0);
          vec3 top  = vec3(0.63, 0.71, 0.79);               // 上：くすんだ淡い青
          vec3 low  = vec3(0.86, 0.87, 0.87);               // 地平線近く：白っぽい
          vec3 warm = vec3(0.80, 0.66, 0.42);               // 夕焼けの帯
          vec3 col = mix(low, top, pow(smoothstep(0.0, 0.5, h), 0.8));
          // 左奥（-x, -z の方向）の地平線だけ、夕焼けがにじむ
          float side = smoothstep(0.1, -0.7, vDir.x) * smoothstep(0.3, -0.6, vDir.z);
          col = mix(col, warm, exp(-h * 30.0) * side * 0.85);
          gl_FragColor = vec4(pow(col, vec3(2.2)), 1.0);
          #include <colorspace_fragment>
        }
      `,
    })
  );
  sky.renderOrder = -1;
  scene.add(sky);

  // ---- アーチの形：外側と内側を一筆書きでつないだ逆U字 ----
  function archShape(w, h, band) {
    const r = w / 2, ir = r - band;
    const s = new THREE.Shape();
    s.moveTo(-r, 0);
    s.lineTo(-r, h - r);
    s.absarc(0, h - r, r, Math.PI, 0, true);
    s.lineTo(r, 0);
    s.lineTo(ir, 0);
    s.lineTo(ir, h - r);
    s.absarc(0, h - r, ir, 0, Math.PI, false);
    s.lineTo(-ir, 0);
    s.lineTo(-r, 0);
    return s;
  }
  // 元の作品のように、太くて厚みがあり、角がやわらかく丸い
  const W = 3.6, H = 10.5, BAND = 0.95, DEPTH = 1.5, BEVEL = 0.32;
  const archGeo = new THREE.ExtrudeGeometry(archShape(W - BEVEL * 2, H - BEVEL, BAND - BEVEL * 2), {
    depth: DEPTH - BEVEL * 2,
    bevelEnabled: true,
    bevelThickness: BEVEL,
    bevelSize: BEVEL,
    bevelSegments: 10,
    curveSegments: 64,
  });
  archGeo.translate(0, 0, -(DEPTH - BEVEL * 2) / 2);
  archGeo.computeVertexNormals();
  const archMat = new THREE.MeshStandardMaterial({ color: '#d8d6d3', roughness: 0.92, envMapIntensity: 0.2 });

  // 足元の台座：少しはみ出した、グレーがかった帯
  const plinthGeo = new THREE.BoxGeometry(BAND + 0.12, 0.42, DEPTH + 0.12);
  const plinthMat = new THREE.MeshStandardMaterial({ color: '#cdcac6', roughness: 0.95, envMapIntensity: 0.2 });

  function addArch(x, z, ry, scale = 1) {
    const a = new THREE.Group();
    a.add(new THREE.Mesh(archGeo, archMat));
    for (const sx of [-1, 1]) {
      const p = new THREE.Mesh(plinthGeo, plinthMat);
      p.position.set(sx * (W / 2 - BAND / 2 - BEVEL / 2), 0.21, 0);
      a.add(p);
    }
    a.position.set(x, FLOOR, z);
    a.rotation.y = ry;
    a.scale.setScalar(scale);
    group.add(a);
  }

  // ---- 配置：元の作品の構図をもとに ----
  // 手前右寄りに大きな1基。左側は奥へ続く列（横向き）、右側にも数基
  addArch(1.6, -14, 0.32, 1.12);
  addArch(6.8, -19, -0.25, 1.0);
  addArch(-3.2, -24, 1.25, 1.0);
  addArch(-5.6, -31, 1.3, 1.0);
  addArch(-7.8, -39, 1.32, 1.0);
  addArch(-10.2, -48, 1.35, 1.0);
  addArch(-12.8, -58, 1.35, 1.0);
  addArch(-15.6, -69, 1.38, 1.0);
  addArch(-1.4, -36, 1.2, 1.0);
  addArch(1.2, -46, 1.25, 1.0);
  addArch(3.6, -30, 0.1, 0.95);
  addArch(9.8, -34, -0.1, 1.0);
  addArch(13.5, -50, 1.4, 1.0);
  addArch(-20, -86, 1.38, 1.0);
  addArch(-25, -104, 1.4, 1.0);

  // ---- 鏡のような水面 ----
  const water = new Reflector(new THREE.PlaneGeometry(800, 800), {
    textureWidth: 1024,
    textureHeight: 1024,
    color: new THREE.Color('#8f9eae'),
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
          // ほとんど動かない水。ごくわずかに揺らす
          vec2 w = vec2(sin(vWorld.z * 0.35 + uTime * 0.4), cos(vWorld.x * 0.3 + uTime * 0.3)) * 0.0006;
          vec4 uv = vUv;
          uv.xy += w * uv.w;
          vec3 refl = texture2DProj(tDiffuse, uv).rgb;
          // 手前ほど暗い青灰色に沈む
          float near = smoothstep(-40.0, 0.0, vWorld.z);
          vec3 col = refl * color * mix(0.95, 0.72, near);
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

  // ---- 光：空からのやわらかい光＋左奥からの低い夕日 ----
  const hemi = new THREE.HemisphereLight('#d9e2ec', '#9c9a98', 0.8);
  const sun = new THREE.DirectionalLight('#ffd9a6', 0.6);
  sun.position.set(-14, 5, -10);
  group.add(hemi, sun);

  return {
    hidesSky: true,
    // 地平線を画面の下寄りに（元の作品の、見上げる構図）
    horizonShift(tall) {
      return tall ? 0.2 : 0.16;
    },
    setTall() {},
    update(t) {
      water.material.uniforms.uTime.value = t;
    },
  };
}
