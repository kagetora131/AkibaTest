/* view-3d-impl.js — 「3D」ビューの本体（ES モジュール。3Dを選んだときだけ読み込まれる）
   three.js はこのフォルダの vendor/three から読む（外部通信なし） */
import * as THREE from 'three';
import { OrbitControls } from '../vendor/three/OrbitControls.js';

const Neo = window.Neo;
const FH = 14; // 1階の高さ（斜めビューと同じ）
const CREAM = '#ead9bb', NEUTRAL = '#cfc6b6';
const FILLER = [0xeceae5, 0xe5e2dc, 0xdedad2]; // 斜めビューのまわりの建物と同じ色
// ジャンル色（css/style.css の --g-* と同じ値）
const GENRE_HEX = {
  tcg: '#1098ad', maid_cafe: '#d6336c', plamo: '#2b8a3e', buyback: '#e67700', pc_parts: '#1971c2',
  cafe: '#8d6e63', retro_arcade: '#c92a2a', crane_arcade: '#f59f00', anime_goods: '#7048e8', quick_food: '#e8590c'
};
const INIT_AZ = 25 * Math.PI / 180, INIT_EL = 55 * Math.PI / 180, INIT_DIST = 520;

function wx(x) { return x - 300; }  // 世界のX
function wz(y) { return y - 500; }  // 世界のZ

export function create() {
  let dispose = null;
  const view = {
    mount(container, api) { dispose = mount(container, api, view); },
    update() {}, centerOn() {}, zoomBy() {}, resetView() {}, fitBounds() {},
    unmount() { if (dispose) { dispose(); dispose = null; } }
  };
  return view;
}

function mount(container, api, view) {
  const town = Neo.data.town, buildings = Neo.data.buildings;
  const here = town.here;
  const reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

  /* ---------- 描画器（WebGL が無ければここで例外 → 呼び出し側が案内を出す） ---------- */
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  container.innerHTML = '';
  const canvas = renderer.domElement;
  canvas.className = 'v3d-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'ネオ電気街の3D地図');
  container.appendChild(canvas);
  const overlay = document.createElement('div');
  overlay.className = 'v3d-overlay';
  container.appendChild(overlay);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xeae6de);
  scene.fog = new THREE.Fog(0xeae6de, 800, 2100);
  const camera = new THREE.PerspectiveCamera(40, 1, 5, 4000);

  /* ---------- ライト ---------- */
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb9b2a6, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 0.8);
  sun.position.set(350, 700, 500); // 南東の上
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -600, right: 600, top: 600, bottom: -600, near: 100, far: 1800 });
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun);

  const disposables = []; // 後始末する geometry / material
  function track(o) { disposables.push(o); return o; }
  function lambert(color) { return track(new THREE.MeshLambertMaterial({ color })); }

  /* ---------- 地面・通り・線路・駅 ---------- */
  const ground = new THREE.Mesh(track(new THREE.PlaneGeometry(town.mapSize.width, town.mapSize.height)), lambert(0xdcd6ca));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const streetMat = lambert(0x8c877e);
  const dashMatrices = [];
  town.streets.forEach((s) => {
    const vertical = s.x1 === s.x2;
    const len = vertical ? Math.abs(s.y2 - s.y1) : Math.abs(s.x2 - s.x1);
    const m = new THREE.Mesh(track(new THREE.BoxGeometry(vertical ? s.width : len, 0.5, vertical ? len : s.width)), streetMat);
    m.position.set(wx((s.x1 + s.x2) / 2), 0.25, wz((s.y1 + s.y2) / 2));
    m.receiveShadow = true;
    scene.add(m);
    if (s.width >= 24) {
      for (let d = 5; d < len; d += 20) {
        const mat4 = new THREE.Matrix4();
        const px = vertical ? wx(s.x1) : wx(Math.min(s.x1, s.x2) + d);
        const pz = vertical ? wz(Math.min(s.y1, s.y2) + d) : wz(s.y1);
        mat4.compose(new THREE.Vector3(px, 0.6, pz), new THREE.Quaternion(),
          new THREE.Vector3(vertical ? 1.5 : 10, 0.1, vertical ? 10 : 1.5));
        dashMatrices.push(mat4);
      }
    }
  });
  if (dashMatrices.length) {
    const dashes = new THREE.InstancedMesh(track(new THREE.BoxGeometry(1, 1, 1)), track(new THREE.MeshBasicMaterial({ color: 0xf3efe7 })), dashMatrices.length);
    dashMatrices.forEach((mt, i) => dashes.setMatrixAt(i, mt));
    scene.add(dashes);
  }

  // 高架の線路（2本）：床・複線のレール・柱。縦(ns)は高さ22、横(ew)は30で、駅のところが立体交差
  const RAIL_LEVEL = { ns: 22, ew: 30 };
  {
    const st = town.station;
    const trackMat = lambert(0xb9b3a8);
    const pillarMat = lambert(0x57534e);
    const pil = [];
    town.rails.forEach((rl) => {
      const lvl = RAIL_LEVEL[rl.id] || 22;
      const dx = rl.x2 - rl.x1, dz = rl.y2 - rl.y1, len = Math.hypot(dx, dz);
      const ux = dx / len, uz = dz / len, rotY = Math.atan2(ux, uz);
      const cx = wx((rl.x1 + rl.x2) / 2), cz = wz((rl.y1 + rl.y2) / 2);
      const deck = new THREE.Mesh(track(new THREE.BoxGeometry(rl.width, 4, len)), lambert(0x6d6964));
      deck.position.set(cx, lvl, cz); deck.rotation.y = rotY; deck.castShadow = true; deck.receiveShadow = true;
      scene.add(deck);
      [-6.9, -5.1, 5.1, 6.9].forEach((off) => { // 複線：上り・下りのレール2本ずつ
        const t = new THREE.Mesh(track(new THREE.BoxGeometry(0.7, 0.6, len)), trackMat);
        t.position.set(cx - uz * off, lvl + 2.3, cz + ux * off); t.rotation.y = rotY;
        scene.add(t);
      });
      // 柱：60ごと。駅の中と、中央通り・横丁の路面は避ける（ewは30から、nsは0から）
      for (let d = rl.id === 'ew' ? 30 : 0; d <= len; d += 60) {
        const px = rl.x1 + ux * d, py = rl.y1 + uz * d;
        if (Math.abs(px - st.x) < st.w / 2 + 4 && Math.abs(py - st.y) < st.h / 2 + 4) continue;
        [-12, 12].forEach((off) => {
          pil.push({ x: wx(px) - uz * off, z: wz(py) + ux * off, h: lvl - 2 });
        });
      }
    });
    const pillars = new THREE.InstancedMesh(track(new THREE.BoxGeometry(3, 1, 3)), pillarMat, pil.length);
    const pm = new THREE.Matrix4();
    pil.forEach((q, i) => {
      pm.compose(new THREE.Vector3(q.x, q.h / 2, q.z), new THREE.Quaternion(), new THREE.Vector3(1, q.h, 1));
      pillars.setMatrixAt(i, pm);
    });
    pillars.instanceMatrix.needsUpdate = true;
    pillars.castShadow = true;
    scene.add(pillars);
    // 駅：交差部を包む建物（ガラスの帯と屋根つき）
    const station = new THREE.Mesh(track(new THREE.BoxGeometry(st.w, 36, st.h)), lambert(0xece6da));
    station.position.set(wx(st.x), 18, wz(st.y)); station.castShadow = true; station.receiveShadow = true;
    const glass = new THREE.Mesh(track(new THREE.BoxGeometry(st.w + 0.6, 6, st.h + 0.6)), lambert(0x8fb3c7));
    glass.position.set(wx(st.x), 26, wz(st.y));
    const roofSlab = new THREE.Mesh(track(new THREE.BoxGeometry(st.w + 6, 2, st.h + 6)), lambert(0xd9d4ca));
    roofSlab.position.set(wx(st.x), 37, wz(st.y)); roofSlab.castShadow = true;
    scene.add(station, glass, roofSlab);
  }

  // 川（電気川）：水面・さざ波・護岸。中央通りは橋（路面がそのまま渡る）、nsの高架線は床がそのまま続く
  {
    const rv = town.river, rvH = rv.y2 - rv.y1, rzc = wz((rv.y1 + rv.y2) / 2);
    const c = document.createElement('canvas'); c.width = 512; c.height = 128;
    const g = c.getContext('2d'), rng = Neo.mulberry32(4242);
    g.fillStyle = '#6f9fb8'; g.fillRect(0, 0, 512, 128);
    g.strokeStyle = '#8fb7cc'; g.lineWidth = 2; g.lineCap = 'round';
    for (let i = 0; i < 60; i++) {
      const x = rng() * 500, y = 8 + rng() * 112;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + 14 + rng() * 34, y); g.stroke();
    }
    const tex = track(new THREE.CanvasTexture(c)); tex.colorSpace = THREE.SRGBColorSpace;
    const water = new THREE.Mesh(track(new THREE.PlaneGeometry(town.mapSize.width, rvH)), track(new THREE.MeshLambertMaterial({ map: tex })));
    water.rotation.x = -Math.PI / 2; water.position.set(0, 0.3, rzc); water.receiveShadow = true;
    scene.add(water);
    const main = town.streets.find((t) => t.id === 'main');
    const bankMat = lambert(0x8a857c), railMat = lambert(0xf3efe7);
    const mw = town.mapSize.width, gap = main ? main.width / 2 + 6 : 0;
    const segs = main ? [[0, main.x1 - gap], [main.x1 + gap, mw]] : [[0, mw]];
    [rv.y1 + 1.5, rv.y2 - 1.5].forEach((zy) => segs.forEach((sg) => { // 護岸（橋のところは切る）
      const m = new THREE.Mesh(track(new THREE.BoxGeometry(sg[1] - sg[0], 2, 3)), bankMat);
      m.position.set(wx((sg[0] + sg[1]) / 2), 1, wz(zy));
      scene.add(m);
    }));
    if (main) [-1, 1].forEach((sgn) => { // 橋の欄干
      const m = new THREE.Mesh(track(new THREE.BoxGeometry(0.8, 2.2, rvH)), railMat);
      m.position.set(wx(main.x1 + sgn * (main.width / 2 + 5)), 1.6, rzc);
      scene.add(m);
    });
  }

  // 駅前広場：舗装とタイルの目地（木は townLayout の trees に入っている）
  {
    const pl = town.plaza;
    const c = document.createElement('canvas'); c.width = c.height = 180;
    const g = c.getContext('2d');
    g.fillStyle = '#cfc8bb'; g.fillRect(0, 0, 180, 180);
    g.strokeStyle = '#bdb6a9'; g.lineWidth = 2;
    for (let i = 0; i <= 180; i += 20) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 180); g.moveTo(0, i); g.lineTo(180, i); g.stroke(); }
    const tex = track(new THREE.CanvasTexture(c)); tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(track(new THREE.BoxGeometry(pl.w, 0.55, pl.h)), track(new THREE.MeshLambertMaterial({ map: tex })));
    m.position.set(wx(pl.x), 0.275, wz(pl.y)); m.receiveShadow = true;
    scene.add(m);
  }

  // 歩行者天国：路面に白い文字（半透明）を2か所
  {
    const main = town.streets.find((t) => t.id === 'main');
    if (main && town.pedestrianMall) {
      const c = document.createElement('canvas'); c.width = 64; c.height = 768;
      const g = c.getContext('2d');
      g.translate(32, 384); g.rotate(Math.PI / 2);
      g.font = 'bold 44px sans-serif'; g.fillStyle = 'rgba(255,255,255,.6)'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(town.pedestrianMall.label, 0, 0);
      const tex = track(new THREE.CanvasTexture(c)); tex.colorSpace = THREE.SRGBColorSpace;
      const mat = track(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
      const geo = track(new THREE.PlaneGeometry(20.4, 244.6));
      [240, 800].forEach((yy) => {
        const m = new THREE.Mesh(geo, mat);
        m.rotation.x = -Math.PI / 2; m.position.set(wx(main.x1), 0.7, wz(yy)); m.renderOrder = 1;
        scene.add(m);
      });
    }
  }

  /* ---------- まわりの建物（1つの InstancedMesh）と緑地 ---------- */
  {
    const lay = Neo.townLayout(town, buildings);
    const inst = new THREE.InstancedMesh(track(new THREE.BoxGeometry(1, 1, 1)),
      track(new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 })), lay.rects.length);
    const mt = new THREE.Matrix4(), col = new THREE.Color();
    lay.rects.forEach((r, i) => {
      const H = r.floors * FH; // 階数は townLayout で決める（真上・斜めと共通）
      mt.compose(new THREE.Vector3(wx(r.x + r.w / 2), H / 2, wz(r.y + r.h / 2)), new THREE.Quaternion(), new THREE.Vector3(r.w, H, r.h));
      inst.setMatrixAt(i, mt);
      inst.setColorAt(i, col.setHex(FILLER[i % FILLER.length]));
    });
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.castShadow = !coarse; // スマホ（指で操作する端末）では影を落とさない（軽くするため）
    inst.receiveShadow = true;
    scene.add(inst);
    const treeGeo = track(new THREE.IcosahedronGeometry(1, 1));
    lay.trees.forEach((t) => {
      const m = new THREE.Mesh(treeGeo, lambert(t.alt ? 0x6f8f5a : 0x7fa06a));
      m.scale.setScalar(t.r); m.position.set(wx(t.x), t.r, wz(t.y));
      scene.add(m);
    });
  }

  /* ---------- 縦型看板・大型ビジョン・日よけ（canvas で描いた絵。外部の画像は使わない） ---------- */
  const NORMAL = { e: [1, 0], w: [-1, 0], s: [0, 1], n: [0, -1] };
  const ROTY = { e: Math.PI / 2, w: -Math.PI / 2, s: 0, n: Math.PI };
  const darkMat = lambert(0x2a2622);
  const bladeMats = {}, bladeGeos = {};
  // 文字を縦に1文字ずつ並べた板の素材（言葉・色・縦横比ごとに1つ、使い回す）
  function bladeMaterial(word, color, k) {
    const key = word + '|' + color + '|' + k;
    if (bladeMats[key]) return bladeMats[key];
    const W = 48, Hc = 48 * k, c = document.createElement('canvas');
    c.width = W; c.height = Hc;
    const g = c.getContext('2d');
    g.fillStyle = color; g.fillRect(0, 0, W, Hc);
    g.strokeStyle = '#2a2622'; g.lineWidth = 4; g.strokeRect(2, 2, W - 4, Hc - 4);
    const chars = Array.from(word), cell = (Hc - 8) / chars.length, size = Math.min(W * 0.72, cell * 0.85);
    g.font = 'bold ' + Math.round(size) + 'px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = Neo.signInk(color);
    chars.forEach((ch, i) => g.fillText(ch, W / 2, 4 + cell * (i + 0.5)));
    const tex = track(new THREE.CanvasTexture(c)); tex.colorSpace = THREE.SRGBColorSpace;
    const mat = track(new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.3 }));
    return (bladeMats[key] = mat);
  }
  // 建物の通り側の面：中心 (cx, cz)・大きさ w×d（世界の座標）・向き face
  function facade(face, cx, cz, w, d) {
    const nv = NORMAL[face], rot = ROTY[face], len = nv[0] ? d : w, half = nv[0] ? w / 2 : d / 2;
    return {
      cx: cx + nv[0] * half, cz: cz + nv[1] * half, nx: nv[0], nz: nv[1],
      tx: Math.cos(rot), tz: -Math.sin(rot), rot, len
    };
  }
  // 面から垂直に出る縦看板（面の隅に寄せる）
  function makeBlade(face, cx, cz, w, d, spec, word, color, side) {
    const f = facade(face, cx, cz, w, d), k = Math.max(2, Math.round(spec.hb / spec.P));
    const gk = spec.P + '|' + spec.hb.toFixed(1);
    const geo = bladeGeos[gk] || (bladeGeos[gk] = track(new THREE.BoxGeometry(spec.th, spec.hb, spec.P)));
    const m = bladeMaterial(word, color, k);
    const mesh = new THREE.Mesh(geo, [m, m, darkMat, darkMat, darkMat, darkMat]);
    const t = side * (f.len / 2 - 1.6);
    mesh.position.set(f.cx + f.nx * spec.P / 2 + f.tx * t, spec.z0 + spec.hb / 2, f.cz + f.nz * spec.P / 2 + f.tz * t);
    mesh.rotation.y = f.rot;
    return mesh;
  }

  // 大型ビジョンの絵（斜めの縞・ブロック。キャラクターなどは描かない）3種類
  const SCREEN_COLORS = ['#2de2e6', '#ff4fae', '#ffd43b', '#7048e8'];
  const screenMats = [0, 1, 2].map((v) => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 96;
    const g = c.getContext('2d'), rng = Neo.mulberry32(900 + v);
    g.fillStyle = '#1c1b22'; g.fillRect(0, 0, 128, 96);
    if (v === 0) { // 斜めの縞
      for (let i = -96; i < 128; i += 16) {
        g.fillStyle = SCREEN_COLORS[((i + 96) / 16) % 4]; g.beginPath();
        g.moveTo(i, 96); g.lineTo(i + 10, 96); g.lineTo(i + 106, 0); g.lineTo(i + 96, 0); g.fill();
      }
    } else { // 色のブロック
      const n = v === 1 ? 5 : 8;
      for (let i = 0; i < n * 3; i++) {
        g.fillStyle = SCREEN_COLORS[Math.floor(rng() * 4)];
        g.fillRect(Math.floor(rng() * 7) * 18, Math.floor(rng() * 5) * 19, 12 + rng() * 24, 8 + rng() * 14);
      }
    }
    const tex = track(new THREE.CanvasTexture(c)); tex.colorSpace = THREE.SRGBColorSpace;
    return track(new THREE.MeshBasicMaterial({ map: tex })); // 光って見えるよう影の影響を受けない素材
  });

  {
    const lay = Neo.townLayout(town, buildings);
    const AWN = ['#e03131', '#f59f00', '#1971c2', '#e64980', '#2f9e44', '#7048e8', '#ffd43b'];
    const awnings = [];
    lay.rects.forEach((r) => {
      const cx = wx(r.x + r.w / 2), cz = wz(r.y + r.h / 2), H = r.floors * FH;
      if (r.sign) scene.add(makeBlade(r.face, cx, cz, r.w, r.h, Neo.bladeSpec(r.floors, FH, r.avenue), r.sign, r.signColor, r.n % 2 ? 1 : -1));
      if (r.screen) { // 通り側の面の上の階に、枠つきの大きな画面
        const f = facade(r.face, cx, cz, r.w, r.h), sw = f.len * 0.6, sh = (2 + (r.n % 2)) * FH, y = H - FH * 0.5 - sh / 2;
        const frame = new THREE.Mesh(track(new THREE.BoxGeometry(sw + 1.6, sh + 1.6, 0.6)), darkMat);
        frame.position.set(f.cx + f.nx * 0.3, y, f.cz + f.nz * 0.3); frame.rotation.y = f.rot;
        const pic = new THREE.Mesh(track(new THREE.PlaneGeometry(sw, sh)), screenMats[r.n % 3]);
        pic.position.set(f.cx + f.nx * 0.65, y, f.cz + f.nz * 0.65); pic.rotation.y = f.rot;
        scene.add(frame, pic);
      }
      if (r.avenue) awnings.push({ f: facade(r.face, cx, cz, r.w, r.h), col: AWN[r.n % AWN.length] });
    });
    // 日よけ（通り沿いの1階）：1つの InstancedMesh（色はインスタンスごと）
    const awn = new THREE.InstancedMesh(track(new THREE.BoxGeometry(1, 1, 1)), lambert(0xffffff), awnings.length);
    const am = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
    awnings.forEach((a, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a.f.rot);
      am.compose(new THREE.Vector3(a.f.cx + a.f.nx * 1.8, FH * 0.62, a.f.cz + a.f.nz * 1.8), q, new THREE.Vector3(a.f.len * 0.9, 1.4, 3.6));
      awn.setMatrixAt(i, am); awn.setColorAt(i, col.set(a.col));
    });
    awn.instanceMatrix.needsUpdate = true;
    if (awn.instanceColor) awn.instanceColor.needsUpdate = true;
    scene.add(awn);
  }

  /* ---------- データのビル（階ごとに積む） ---------- */
  const bData = {};   // id → {b, floors: [{mesh, mat, band, bandMat, edges}], roof, roofMat}
  const pickables = [];
  const edgeMat = track(new THREE.LineBasicMaterial({ color: 0xe8732c }));
  buildings.forEach((b) => {
    const slabGeo = track(new THREE.BoxGeometry(b.w, FH - 1, b.h));
    const bandGeo = track(new THREE.BoxGeometry(b.w + 0.6, 1, b.h + 0.6));
    const edgeGeo = track(new THREE.EdgesGeometry(slabGeo));
    const bandMat = track(new THREE.MeshLambertMaterial({ color: 0xc9b89a }));
    const rec = { b, floors: [] };
    for (let f = 1; f <= b.floors; f++) {
      const mat = track(new THREE.MeshStandardMaterial({ color: CREAM, roughness: 1, metalness: 0 }));
      const mesh = new THREE.Mesh(slabGeo, mat);
      mesh.position.set(wx(b.x), (f - 1) * FH + (FH - 1) / 2, wz(b.y));
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.userData.b = b.id;
      const edges = new THREE.LineSegments(edgeGeo, edgeMat);
      edges.visible = false;
      mesh.add(edges);
      const bm = track(bandMat.clone());
      const band = new THREE.Mesh(bandGeo, bm);
      band.position.set(wx(b.x), (f - 1) * FH + FH - 0.5, wz(b.y));
      band.userData.b = b.id;
      scene.add(mesh, band);
      pickables.push(mesh, band);
      rec.floors.push({ mesh, mat, band, bandMat: bm, edges });
    }
    rec.roofMat = track(new THREE.MeshLambertMaterial({ color: 0xf6eedf }));
    rec.roof = new THREE.Mesh(track(new THREE.BoxGeometry(b.w + 1.2, 1.5, b.h + 1.2)), rec.roofMat);
    rec.roof.position.set(wx(b.x), b.floors * FH + 0.25, wz(b.y));
    rec.roof.castShadow = true; rec.roof.userData.b = b.id;
    scene.add(rec.roof);
    pickables.push(rec.roof);
    bData[b.id] = rec;
  });
  // データのビルの縦看板：見えているお店の主なジャンルから。お店が無ければ付けない（角に寄せるので階の帯は隠れない）
  function syncBlade(rec, list) {
    const b = rec.b, sg = Neo.buildingSign(list), key = sg ? sg.word + sg.color : '';
    if (key === rec.bladeKey) return;
    rec.bladeKey = key;
    if (rec.blade) { scene.remove(rec.blade); rec.blade = null; }
    if (!sg) return;
    rec.blade = makeBlade(Neo.streetFace(b, town), wx(b.x), wz(b.y), b.w, b.h, Neo.bladeSpec(b.floors, FH, b.street === 'main'), sg.word, sg.color, 1);
    scene.add(rec.blade);
  }

  /* ---------- 現在地（地面の青い円） ---------- */
  {
    const disc = new THREE.Mesh(track(new THREE.CircleGeometry(6, 32)), track(new THREE.MeshBasicMaterial({ color: 0x1971c2 })));
    disc.rotation.x = -Math.PI / 2; disc.position.set(wx(here.x), 0.8, wz(here.y));
    const ring = new THREE.Mesh(track(new THREE.RingGeometry(6, 9, 32)), track(new THREE.MeshBasicMaterial({ color: 0xffffff })));
    ring.rotation.x = -Math.PI / 2; ring.position.set(wx(here.x), 0.75, wz(here.y));
    scene.add(ring, disc);
  }

  /* ---------- カメラと操作 ---------- */
  const hereW = new THREE.Vector3(wx(here.x), 0, wz(here.y));
  function initialOffset(dist) {
    return new THREE.Vector3(Math.cos(INIT_EL) * Math.sin(INIT_AZ), Math.sin(INIT_EL), Math.cos(INIT_EL) * Math.cos(INIT_AZ)).multiplyScalar(dist);
  }
  camera.position.copy(hereW).add(initialOffset(INIT_DIST));
  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(hereW);
  const SAVE_KEY = 'cam3d'; // 最後の3Dの向きを覚えておく（別の表示から戻っても同じ見え方）
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 120; controls.maxDistance = 1100;
  controls.maxPolarAngle = 80 * Math.PI / 180; controls.minPolarAngle = 10 * Math.PI / 180;
  controls.screenSpacePanning = false; // 平行移動は地面に沿って
  controls.update();

  // 9つのビルと現在地がぜんぶ入る範囲（世界のX/Z）と最大の高さ
  let bx0 = hereW.x, bx1 = hereW.x, bz0 = hereW.z, bz1 = hereW.z, bh = 40;
  buildings.forEach((b) => {
    bx0 = Math.min(bx0, wx(b.x - b.w / 2)); bx1 = Math.max(bx1, wx(b.x + b.w / 2));
    bz0 = Math.min(bz0, wz(b.y - b.h / 2)); bz1 = Math.max(bz1, wz(b.y + b.h / 2));
    bh = Math.max(bh, b.floors * FH + 8);
  });
  const boxCenter = new THREE.Vector3((bx0 + bx1) / 2, 0, (bz0 + bz1) / 2);
  const boxCorners = [];
  [bx0, bx1].forEach((x) => [bz0, bz1].forEach((z) => [0, bh].forEach((y) => boxCorners.push(new THREE.Vector3(x, y, z)))));

  // 初期の角度のまま、全体が「空いている範囲」に収まる最小の距離を探す
  function frameDistance(center, corners) {
    const W = container.clientWidth || 1, H = container.clientHeight || 1;
    const fa = api.freeArea ? api.freeArea() : { top: 0, bottom: H };
    const availW = W - 24, availH = Math.max(120, fa.bottom - fa.top - 24 - 50); // 50: ピンの頭の分
    const dir = initialOffset(1);
    const saveP = camera.position.clone(), saveT = controls.target.clone();
    const v = new THREE.Vector3();
    function fits(dist) {
      camera.position.copy(center).addScaledVector(dir, dist);
      camera.lookAt(center); camera.updateMatrixWorld(true);
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const c of corners) {
        v.copy(c).project(camera);
        const sx = (v.x * 0.5 + 0.5) * W, sy = (-v.y * 0.5 + 0.5) * H;
        x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
      }
      return x1 - x0 <= availW && y1 - y0 <= availH;
    }
    let lo = controls.minDistance, hi = controls.maxDistance;
    if (!fits(hi)) return hi;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid; else lo = mid;
    }
    camera.position.copy(saveP); controls.target.copy(saveT); camera.lookAt(controls.target); camera.updateMatrixWorld(true);
    return hi;
  }

  // 画面上の target（枠内の px）にその点が来るよう、地面に沿ってずらした注視点を返す
  function shifted(T, target) {
    if (!target) return T;
    const W = container.clientWidth, H = container.clientHeight;
    const dx = target.x - W / 2, dy = target.y - H / 2;
    const dist = camera.position.distanceTo(controls.target);
    const u = 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / H; // 1px あたりの世界の長さ
    const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    const sinEl = Math.max(0.2, Math.sin(Math.PI / 2 - controls.getPolarAngle()));
    return T.clone().addScaledVector(right, -dx * u).addScaledVector(fwd, dy * u / sinEl);
  }

  // 全体の構図にする（moveTarget=false なら注視点はそのまま、角度と距離だけ戻す）
  // center / corners を渡すと、その範囲（ルートの外枠など）が収まる構図にする
  function applyFraming(moveTarget, center, corners) {
    center = center || boxCenter; corners = corners || boxCorners;
    const dist = frameDistance(center, corners);
    if (moveTarget) {
      controls.target.copy(center);
      camera.position.copy(center).add(initialOffset(dist));
      controls.update();
      const W = container.clientWidth || 1, H = container.clientHeight || 1;
      const fa = api.freeArea ? api.freeArea() : { top: 0, bottom: H };
      const T = shifted(center, { x: W / 2, y: (fa.top + fa.bottom) / 2 });
      T.x = Math.max(-300, Math.min(300, T.x)); T.z = Math.max(-500, Math.min(500, T.z));
      controls.target.copy(T);
      camera.position.copy(T).add(initialOffset(dist));
    } else {
      camera.position.copy(controls.target).add(initialOffset(dist));
    }
    controls.update(); request();
  }

  let rafId = 0, dirty = true, animId = 0, disposed = false;
  function request() { dirty = true; if (!rafId && !disposed) rafId = requestAnimationFrame(frame); }
  function frame() {
    rafId = 0;
    if (disposed) return;
    controls.update(); // ダンピング中は change が出て、次のフレームが予約される
    if (dirty) { dirty = false; draw(); }
  }
  controls.addEventListener('change', () => {
    // 街の外へ出ないよう、注視点を範囲内に戻す（カメラも同じ量だけ動かす）
    const t = controls.target;
    const cx = Math.max(-300, Math.min(300, t.x)), cz = Math.max(-500, Math.min(500, t.z));
    if (cx !== t.x || cz !== t.z) {
      camera.position.x += cx - t.x; camera.position.z += cz - t.z;
      t.x = cx; t.z = cz;
    }
    request();
  });

  /* ---------- 画面の大きさ ---------- */
  function resize() {
    const W = container.clientWidth || 1, H = container.clientHeight || 1;
    renderer.setSize(W, H);
    camera.aspect = W / H; camera.updateProjectionMatrix();
    request();
  }
  const ro = window.ResizeObserver ? new ResizeObserver(resize) : null;
  if (ro) ro.observe(container);
  resize();
  {
    const saved = Neo.mapState[SAVE_KEY];
    if (saved) {
      camera.position.fromArray(saved.pos); controls.target.fromArray(saved.target); controls.update();
    } else {
      applyFraming(true);
    }
  }

  /* ---------- 上に重ねる HTML（ピン・吹き出し・通り名） ---------- */
  const tmpV = new THREE.Vector3();
  function toScreen(x, y, z) {
    tmpV.set(x, y, z).project(camera);
    const W = container.clientWidth, H = container.clientHeight;
    return { x: (tmpV.x * 0.5 + 0.5) * W, y: (-tmpV.y * 0.5 + 0.5) * H, ok: tmpV.z < 1 && tmpV.z > -1 && Math.abs(tmpV.x) < 1.15 && Math.abs(tmpV.y) < 1.15 };
  }
  function place(el, p, extra) {
    if (!p.ok) { el.style.visibility = 'hidden'; return false; }
    el.style.visibility = '';
    el.style.transform = 'translate(' + p.x.toFixed(1) + 'px,' + p.y.toFixed(1) + 'px)' + (extra || '');
    return true;
  }

  const labelHost = document.createElement('div');
  overlay.appendChild(labelHost);
  const labels = [];
  town.streets.forEach((s) => {
    if (s.id === 'roji2' || s.id === 'rojiv') return; // ジャンク小路の札は1枚だけ
    const el = document.createElement('div');
    el.className = 'v3d-label'; el.textContent = s.name;
    labelHost.appendChild(el);
    labels.push({ el, x: wx(s.x1 === s.x2 ? s.x1 : 235), y: 1, z: wz(s.x1 === s.x2 ? 150 : s.y1) });
  });
  {
    const el = document.createElement('div');
    el.className = 'v3d-label'; el.textContent = town.station.name;
    labelHost.appendChild(el);
    labels.push({ el, x: wx(town.station.x), y: 46, z: wz(town.station.y) });
  }
  [[town.river.name, 150, 1, (town.river.y1 + town.river.y2) / 2], [town.plaza.name, town.plaza.x, 2, town.plaza.y - town.plaza.h / 2 + 8]].forEach((a) => {
    const el = document.createElement('div');
    el.className = 'v3d-label'; el.textContent = a[0];
    labelHost.appendChild(el);
    labels.push({ el, x: wx(a[1]), y: a[2], z: wz(a[3]) });
  });
  const hereEl = document.createElement('div');
  hereEl.className = 'v3d-here';
  hereEl.innerHTML = '<span class="v3d-halo"></span>';
  overlay.appendChild(hereEl);
  const pinHost = document.createElement('div');
  overlay.appendChild(pinHost);
  const coHost = document.createElement('div');
  overlay.appendChild(coHost);

  let vs = null;       // 最新の viewState
  let pins = [];       // {el, b, h（置く高さ）, extra（追加の変形）}
  let callouts = [];   // {el, card, svgLine, floor, text, w}
  let byB = {};

  function draw() {
    renderer.render(scene, camera);
    Neo.mapState[SAVE_KEY] = { pos: camera.position.toArray(), target: controls.target.toArray() };
    // 通り名・現在地
    labels.forEach((l) => place(l.el, toScreen(l.x, l.y, l.z)));
    place(hereEl, toScreen(wx(here.x), 0.8, wz(here.y)));
    // ピン
    pins.forEach((p) => place(p.el, toScreen(wx(p.b.x), p.b.floors * FH + p.h, wz(p.b.y)), p.extra));
    layoutCallouts();
  }

  // 選んだビルの階ごとの吹き出し（右にはみ出すなら左側へ。縦に重ならないよう押し下げる）
  function layoutCallouts() {
    if (!callouts.length) return;
    const sel = vs && vs.selectedBuilding && bData[vs.selectedBuilding];
    if (!sel) return;
    const b = sel.b, W = container.clientWidth;
    const right = callouts.map((c) => toScreen(wx(b.x + b.w / 2), (c.floor - 0.5) * FH, wz(b.y)));
    let left = false;
    callouts.forEach((c, i) => { if (right[i].ok && right[i].x + 34 + c.w > W - 8) left = true; });
    const pts = callouts.map((c, i) => (left ? toScreen(wx(b.x - b.w / 2), (c.floor - 0.5) * FH, wz(b.y)) : right[i]));
    const order = callouts.map((c, i) => i).sort((a, z) => pts[a].y - pts[z].y);
    let prevBottom = -1e9;
    order.forEach((i) => {
      const c = callouts[i], p = pts[i];
      if (!p.ok) { c.el.style.visibility = 'hidden'; return; }
      c.el.style.visibility = '';
      const top = Math.max(p.y - 10, prevBottom + 4), dyc = top + 10 - p.y;
      c.el.style.transform = 'translate(' + p.x.toFixed(1) + 'px,' + p.y.toFixed(1) + 'px)';
      c.line.setAttribute('x2', left ? -34 : 34); c.line.setAttribute('y2', dyc.toFixed(1));
      c.card.style.transform = 'translate(' + (left ? 'calc(-100% - 34px)' : '34px') + ',' + (dyc - 10).toFixed(1) + 'px)';
      prevBottom = top + 20;
    });
  }

  const PIN_SVG = (selected, count) =>
    '<svg width="30" height="42" viewBox="-15 -44 30 44" aria-hidden="true" focusable="false">' +
    '<path d="M0 0 C-4 -10 -15 -18 -15 -27 A15 15 0 1 1 15 -27 C15 -18 4 -10 0 0Z" fill="' + (selected ? '#b34812' : '#e8732c') + '" stroke="#fff" stroke-width="2"/>' +
    '<circle cx="0" cy="-27" r="9.5" fill="#fff"/>' +
    '<text x="0" y="-22.5" text-anchor="middle" font-size="13" font-weight="800" fill="#b34812">' + count + '</text></svg>';

  /* ---------- ルートの線（地面の上の平らなリボン） ---------- */
  let routeKey = '', routeObjs = [];
  function clearRoute() {
    routeObjs.forEach((o) => { scene.remove(o); o.geometry.dispose(); o.material.dispose(); });
    routeObjs = [];
  }
  // 点列に沿った幅 width のリボン（線分ごとの四角＋点ごとの丸で、角もなめらかに）
  function ribbonGeometry(pts, width, y) {
    const pos = [], hw = width / 2, SEG = 12;
    const tri = (a, b, c) => pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    for (let i = 0; i + 1 < pts.length; i++) {
      const p = pts[i], q = pts[i + 1], dx = q.x - p.x, dz = q.z - p.z, len = Math.hypot(dx, dz);
      if (len < 0.01) continue;
      const nx = -dz / len * hw, nz = dx / len * hw;
      const a = [p.x + nx, y, p.z + nz], b = [p.x - nx, y, p.z - nz], c = [q.x - nx, y, q.z - nz], d = [q.x + nx, y, q.z + nz];
      tri(a, b, c); tri(a, c, d);
    }
    pts.forEach((p) => {
      for (let k = 0; k < SEG; k++) {
        const a0 = k / SEG * Math.PI * 2, a1 = (k + 1) / SEG * Math.PI * 2;
        tri([p.x, y, p.z], [p.x + Math.cos(a0) * hw, y, p.z + Math.sin(a0) * hw], [p.x + Math.cos(a1) * hw, y, p.z + Math.sin(a1) * hw]);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return g;
  }
  function syncRoute(rt) {
    const key = rt && rt.path.length > 1 ? JSON.stringify(rt.path) : '';
    if (key === routeKey) return;
    routeKey = key;
    clearRoute();
    if (!key) { request(); return; }
    const pts = rt.path.map((p) => ({ x: wx(p.x), z: wz(p.y) }));
    [[9, 1.1, 0xffffff], [6, 1.2, 0xb34812]].forEach((spec) => {
      const m = new THREE.Mesh(ribbonGeometry(pts, spec[0], spec[1]), new THREE.MeshBasicMaterial({ color: spec[2], side: THREE.DoubleSide }));
      m.renderOrder = 1;
      scene.add(m); routeObjs.push(m);
    });
    request();
  }

  /* ---------- 状態の反映（シーンは作り直さない） ---------- */
  function applyState(state) {
    vs = state;
    byB = {};
    (state.shops || []).forEach((s) => { (byB[s.building] = byB[s.building] || []).push(s); });
    const sel = state.selectedBuilding;

    // 階の色と、選んだビルの透け
    Object.keys(bData).forEach((id) => {
      const rec = bData[id], isSel = id === sel;
      syncBlade(rec, byB[id] || []);
      rec.floors.forEach((fl, i) => {
        const shops = (byB[id] || []).filter((s) => s.floor === i + 1);
        const match = shops.find((s) => s.match);
        const color = match ? GENRE_HEX[match.genre] || CREAM : shops.length ? NEUTRAL : CREAM;
        const solid = !(isSel && !match);
        fl.mat.color.set(color);
        fl.mat.emissive.set(match ? color : '#000000');
        fl.mat.emissiveIntensity = match ? 0.15 : 0;
        [fl.mat, fl.bandMat].forEach((m) => {
          m.transparent = !solid; m.opacity = solid ? 1 : 0.25; m.depthWrite = solid; m.needsUpdate = true;
        });
        fl.mesh.castShadow = solid;
        fl.edges.visible = isSel && !!match;
      });
      rec.roofMat.transparent = isSel; rec.roofMat.opacity = isSel ? 0.25 : 1; rec.roofMat.depthWrite = !isSel; rec.roofMat.needsUpdate = true;
      rec.roof.castShadow = !isSel;
    });

    // ピン（ルート表示中は番号つきの停留所に置き換わる）
    const focusId = document.activeElement && document.activeElement.classList &&
      (document.activeElement.classList.contains('v3d-pin') || document.activeElement.classList.contains('v3d-stop'))
      ? document.activeElement.getAttribute('data-pin') : null;
    pinHost.innerHTML = '';
    pins = [];
    syncRoute(state.route);
    if (state.route) {
      const rt = state.route;
      if (!rt.startAtHere && rt.stops[0] && bData[rt.stops[0].building]) {
        const el = document.createElement('div');
        el.className = 'v3d-label v3d-start'; el.textContent = 'スタート';
        pinHost.appendChild(el);
        pins.push({ el, b: bData[rt.stops[0].building].b, h: 4, extra: ' translate(-50%,-50%) translateY(-32px)' });
      }
      rt.stops.slice().sort((a, z) => (a.building === rt.activeBuilding ? 1 : 0) - (z.building === rt.activeBuilding ? 1 : 0)).forEach((st) => {
        const rec = bData[st.building];
        if (!rec) return;
        const label = st.numbers.join('・');
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'v3d-stop' + (st.building === rt.activeBuilding ? ' is-active' : '');
        el.setAttribute('data-pin', rec.b.id);
        el.setAttribute('aria-label', label + '番目 ' + st.name);
        el.innerHTML = '<span class="v3d-stop-dot" aria-hidden="true"></span>';
        el.firstChild.textContent = label;
        if (label.length > 1) el.firstChild.style.minWidth = (34 + (label.length - 1) * 9) + 'px';
        pinHost.appendChild(el);
        pins.push({ el, b: rec.b, h: 4, extra: ' translate(-50%,-50%)' });
        if (focusId === rec.b.id) el.focus({ preventScroll: true });
      });
    }
    (state.route ? [] : state.pins).slice().sort((a, z) => (a.selected ? 1 : 0) - (z.selected ? 1 : 0)).forEach((p) => {
      const rec = bData[p.building];
      if (!rec) return;
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'v3d-pin' + (p.selected ? ' is-selected' : '');
      el.setAttribute('data-pin', rec.b.id);
      el.setAttribute('aria-label', rec.b.name + '（お店' + p.count + '軒）');
      el.innerHTML = PIN_SVG(p.selected, p.count);
      pinHost.appendChild(el);
      pins.push({ el, b: rec.b, h: 8, extra: '' });
      if (focusId === rec.b.id) el.focus({ preventScroll: true });
    });

    // 吹き出し（選んだビルだけ）
    coHost.innerHTML = '';
    callouts = [];
    const srec = sel && bData[sel];
    if (srec) {
      const floors = {};
      (byB[sel] || []).forEach((s) => { (floors[s.floor] = floors[s.floor] || []).push(s); });
      Object.keys(floors).map(Number).filter((n) => n >= 1).sort((a, z) => z - a).forEach((fl) => {
        const list = floors[fl];
        const text = Neo.floorLabel(fl) + ' ' + list[0].name + (list.length > 1 ? ' ほか' + (list.length - 1) + '軒' : '');
        const el = document.createElement('div');
        el.className = 'v3d-co';
        el.innerHTML = '<svg class="co-svg" width="1" height="1" aria-hidden="true"><line x1="0" y1="0" x2="34" y2="0"/></svg><span class="co-card"></span>';
        el.querySelector('.co-card').textContent = text;
        coHost.appendChild(el);
        callouts.push({ el, card: el.querySelector('.co-card'), line: el.querySelector('line'), floor: fl, w: text.length * 12 + 18 });
      });
    }
    request();
  }

  /* ---------- 画面の点をタップしたときの選択 ---------- */
  overlay.addEventListener('click', (e) => {
    const btn = e.target.closest && e.target.closest('.v3d-pin, .v3d-stop');
    if (btn) api.onSelectBuilding(btn.getAttribute('data-pin'));
  });
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let down = null;
  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, id: e.pointerId }; });
  canvas.addEventListener('pointerup', (e) => {
    if (!down || down.id !== e.pointerId) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    if (moved >= 6) return;
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(pickables, false)[0];
    if (hit && hit.object.userData.b && (byB[hit.object.userData.b] || []).length) api.onSelectBuilding(hit.object.userData.b);
  });

  /* ---------- 動き ---------- */
  function stopAnim() { if (animId) { cancelAnimationFrame(animId); animId = 0; } }

  function moveTo(newTarget, instant) {
    stopAnim();
    const off = camera.position.clone().sub(controls.target);
    const endT = newTarget.clone();
    endT.x = Math.max(-300, Math.min(300, endT.x)); endT.z = Math.max(-500, Math.min(500, endT.z));
    if (reduce || instant) {
      controls.target.copy(endT); camera.position.copy(endT).add(off); controls.update(); request(); return;
    }
    const startT = controls.target.clone(), t0 = performance.now();
    (function step(now) {
      const t = Math.min(1, (now - t0) / 400), e = 1 - Math.pow(1 - t, 3);
      controls.target.lerpVectors(startT, endT, e);
      camera.position.copy(controls.target).add(off);
      controls.update(); request();
      animId = t < 1 ? requestAnimationFrame(step) : 0;
    })(t0);
  }

  view.update = (state) => { if (!disposed) applyState(state); };

  // 画面上の target（枠内の px）にその点が来るよう、地面に沿ってずらす
  view.centerOn = (x, y, instant, target) => {
    if (disposed) return;
    let yy = 0;
    buildings.forEach((b) => { if (Math.abs(b.x - x) < 0.5 && Math.abs(b.y - y) < 0.5) yy = b.floors * FH / 2; });
    moveTo(shifted(new THREE.Vector3(wx(x), yy, wz(y)), target), instant);
  };

  view.zoomBy = (factor) => {
    if (disposed) return;
    const off = camera.position.clone().sub(controls.target);
    const len = Math.max(controls.minDistance, Math.min(controls.maxDistance, off.length() / factor));
    camera.position.copy(controls.target).add(off.setLength(len));
    controls.update(); request();
  };

  // 範囲（地図の座標）が空いている範囲に収まる構図にする（動きはつけない）
  view.fitBounds = (x0, y0, x1, y1) => {
    if (disposed) return;
    stopAnim();
    const ax = wx(x0), bx = wx(x1), az = wz(y0), bz = wz(y1);
    const center = new THREE.Vector3((ax + bx) / 2, 0, (az + bz) / 2);
    const corners = [];
    [ax, bx].forEach((x) => [az, bz].forEach((z) => [0, bh].forEach((y) => corners.push(new THREE.Vector3(x, y, z)))));
    applyFraming(true, center, corners);
  };

  // 向きを戻す：最初の構図（角度と距離）に。ビルを選んでいるときは注視点をそのままにする
  view.resetView = () => {
    if (disposed) return;
    stopAnim();
    applyFraming(!(vs && vs.selectedBuilding));
  };

  /* ---------- 後始末 ---------- */
  return function cleanup() {
    disposed = true;
    stopAnim();
    clearRoute();
    cancelAnimationFrame(rafId); rafId = 0;
    if (ro) ro.disconnect();
    controls.dispose();
    scene.traverse((o) => { if (o.isInstancedMesh && o.dispose) o.dispose(); });
    disposables.forEach((d) => { if (d.dispose) d.dispose(); });
    renderer.dispose();
    if (renderer.forceContextLoss) renderer.forceContextLoss();
    container.innerHTML = '';
  };
}
