// =========================================================
// 「境界」の背景：雲の海に、どこにも繋がっていない扉が並ぶ
// - リミナル（limen ＝ 敷居）を、そのまま「扉」で表している
// - 扉は黄金比（1 : 1.618）。奥の扉ほど遠く、一番奥だけ夕日の色に光る
// - 手前の扉には小さなベル（NorthBell）が吊るされて、かすかに揺れる
// - 写真や既存作品は使わず、すべてコードで組み立てている
// =========================================================
import * as THREE from 'three';

const PHI = 1.618;

export function buildGate(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const FLOOR = -3.6;
  const HORIZON = new THREE.Color('#dfe5ee');
  scene.fog = new THREE.Fog(HORIZON, 26, 110);

  // ---- 雲の海（足元一面のもこもこ） ----
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(420, 250, 8, 32),
    new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uHorizon: { value: HORIZON } },
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        varying float vDist;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vWorld = w.xyz;
          vec4 mv = viewMatrix * w;
          vDist = -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec3 vWorld;
        varying float vDist;
        uniform float uTime;
        uniform vec3 uHorizon;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
        }
        float fbm(vec2 p) {
          float v = 0.0, a = 0.5;
          for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.07 + 1.3; a *= 0.5; }
          return v;
        }
        void main() {
          vec2 p = vWorld.xz * 0.16 + vec2(uTime * 0.015, 0.0);
          float n = fbm(p + fbm(p * 0.5) * 1.2);
          float n2 = fbm(p + vec2(0.08, 0.05) + fbm(p * 0.5) * 1.2);
          float shade = clamp(0.6 + (n - n2) * 5.0, 0.0, 1.0);   // 夕日側が明るい
          vec3 low  = vec3(0.72, 0.76, 0.85);                    // 雲の谷：冷たい青灰
          vec3 high = vec3(1.0, 0.985, 0.96);                    // 雲の頂：温かい白
          vec3 col = mix(low, high, smoothstep(0.35, 0.75, n) * 0.6 + shade * 0.4);
          col += vec3(1.0, 0.8, 0.0) * 0.06 * shade;             // 夕日の照り返し（#FFCC00）
          float fog = smoothstep(20.0, 170.0, vDist);
          col = mix(col, uHorizon, fog);
          gl_FragColor = vec4(pow(col, vec3(2.2)), 1.0);
          #include <colorspace_fragment>
        }
      `,
    })
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, FLOOR, -127);   // 手前端は z=-2（カメラの真下まで伸ばさない）
  group.add(sea);

  // ---- 扉（枠だけ）。奥へ向かって、少しずつずれながら並ぶ ----
  const frameMat = new THREE.MeshStandardMaterial({ color: '#f7f6f2', roughness: 0.7, envMapIntensity: 0.8 });
  const doorW = 1.5, doorH = doorW * PHI, bar = 0.14, depth = 0.2;
  function makeDoor() {
    const d = new THREE.Group();
    const side = new THREE.BoxGeometry(bar, doorH + bar, depth);
    const top = new THREE.BoxGeometry(doorW + bar * 2, bar, depth);
    const l = new THREE.Mesh(side, frameMat); l.position.set(-doorW / 2 - bar / 2, doorH / 2, 0);
    const r = l.clone(); r.position.x *= -1;
    const t = new THREE.Mesh(top, frameMat); t.position.set(0, doorH + bar / 2, 0);
    d.add(l, r, t);
    return d;
  }
  // 足元が雲に少し沈むように、y は床より下から
  const spots = [
    [-1.6, -3, 0.22], [-5.2, -9, 0.35], [1.4, -14, -0.2], [-3.0, -22, 0.12], [3.6, -32, -0.3], [-6.5, -44, 0.4],
  ];
  const doors = spots.map(([x, z, ry]) => {
    const d = makeDoor();
    d.position.set(x, FLOOR - 0.35, z);
    d.rotation.y = ry;
    group.add(d);
    return d;
  });

  // 一番奥の扉の中だけ、夕日の色に光る（どこか別の場所の気配）
  const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#FFD54A'), fog: false, toneMapped: false });
  glowMat.color.multiplyScalar(1.15);
  const inner = new THREE.Mesh(new THREE.PlaneGeometry(doorW, doorH), glowMat);
  inner.position.set(0, doorH / 2, -0.01);
  doors[doors.length - 1].add(inner);

  // ---- ベル（手前の扉に吊るす） ----
  const bellMat = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.25, clearcoat: 1, envMapIntensity: 1 });
  const profile = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    // 上は丸く、裾が広がるベルの断面
    const r = 0.05 + 0.13 * Math.pow(t, 1.6) + 0.05 * Math.sin(t * Math.PI) ;
    profile.push(new THREE.Vector2(r, 0.32 * (1 - t)));
  }
  const bell = new THREE.Group();
  const bellBody = new THREE.Mesh(new THREE.LatheGeometry(profile, 32), bellMat);
  bellBody.material.side = THREE.DoubleSide;
  const clapper = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), new THREE.MeshStandardMaterial({ color: '#FFCC00', roughness: 0.4 }));
  clapper.position.y = -0.02;
  const string = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.45, 6), new THREE.MeshBasicMaterial({ color: '#b9bcc4' }));
  string.position.y = 0.32 + 0.22;
  bell.add(bellBody, clapper, string);
  const pivot = new THREE.Group();          // 揺れの支点（扉の上枠）
  pivot.position.set(0, doorH, 0);
  bell.position.y = -0.32 - 0.45;
  pivot.add(bell);
  doors[0].add(pivot);

  // 照明（夕方のやわらかい光）
  const hemi = new THREE.HemisphereLight('#ffffff', '#c9d2e0', 1.1);
  const sun = new THREE.DirectionalLight('#fff1cf', 1.2);
  sun.position.set(6, 5, -10);
  group.add(hemi, sun);

  return {
    setTall(tall) {
      group.position.y = tall ? -1.2 : 0;
    },
    update(t) {
      sea.material.uniforms.uTime.value = t;
      pivot.rotation.z = Math.sin(t * 0.9) * 0.06;
      pivot.rotation.x = Math.sin(t * 0.6 + 1.0) * 0.03;
    },
  };
}
