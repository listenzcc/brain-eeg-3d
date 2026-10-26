// 主程序：基于 Three.js 的脑电电极 × 大脑脑区 3D 可视化（真实皮层网格版）
import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import {
  CATEGORIES, SENSORS, regionCategory, dirFromSpherical, sensorSide
} from './data.js';

const ACCENT = 0xffffff;

let scene, camera, renderer, controls, raycaster, pointer;
// let brainMesh, brainInner, geometry, baseColors, vcat, vreg;
let brainMesh, geometry, baseColors, vcat, vreg;
let initCamPos;
let sensorsGroup, labelEls = [], sensorMeshes = [];
let selected = null;                 // { kind:'sensor'|'category'|'region', value }
const state = { sensors: true, labels: true, brain: true, rotate: true };

const canvasWrap = document.getElementById('canvas-wrap');
const labelsContainer = document.getElementById('labels');
const loadingEl = document.getElementById('loading');
const errorEl = document.getElementById('hud-error');
const infoEl = document.getElementById('info');
const legendEl = document.getElementById('legend');
const tableBody = document.getElementById('electrode-table');

function fail(msg) {
  if (errorEl) { errorEl.hidden = false; errorEl.textContent = msg; }
  if (loadingEl) loadingEl.style.display = 'none';
  console.error(msg);
}

async function fetchBin(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('资源加载失败: ' + url);
  return res.arrayBuffer();
}

async function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);   // 纯白背景，玻璃透射折射也取白底，避免发暗

  // ---------- 加载资产 ----------
  const [posAB, idxAB, vregAB] = await Promise.all([
    fetchBin('./assets/gen/brain_pos.bin'),
    fetchBin('./assets/gen/brain_idx.bin'),
    fetchBin('./assets/gen/brain_vregion.bin')
  ]);
  const atlas = await (await fetch('./assets/gen/atlas.json')).json();

  const position = new Float32Array(posAB);
  const index = new Uint32Array(idxAB);
  vreg = new Uint16Array(vregAB);
  const nv = position.length / 3;
  const meta = atlas.meta;

  // 脑区 idx -> 名称
  const regNameByIdx = {};
  atlas.regions.forEach((r) => { regNameByIdx[r.idx] = r.name; });
  window.__regNameByIdx = regNameByIdx;
  // 脑区 idx -> 分类 id
  const regCatByIdx = {};
  atlas.regions.forEach((r) => { regCatByIdx[r.idx] = regionCategory(r.name); });

  // ---------- 相机 ----------
  let maxR = 0;
  for (let i = 0; i < nv; i++) {
    const r = Math.hypot(position[i * 3], position[i * 3 + 1], position[i * 3 + 2]);
    if (r > maxR) maxR = r;
  }
  const fov = 45;
  const dist = (maxR / Math.sin((fov / 2) * Math.PI / 180)) * 1.06;

  const w = canvasWrap.clientWidth, h = canvasWrap.clientHeight;
  camera = new THREE.PerspectiveCamera(fov, w / h, 1, dist * 12);
  camera.position.set(0, maxR * 0.14, dist);
  initCamPos = camera.position.clone();

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h);
  renderer.setClearColor(0x000000, 0);
  canvasWrap.insertBefore(renderer.domElement, labelsContainer);

  // 程序化环境贴图：给玻璃材质提供镜面反射与整体亮度，避免发暗
  scene.environment = buildEnvironment();

  // 绑定到外层容器而不是 canvas 本身：即使事件被标签等覆盖层拦截，
  // 在观察区任意位置按下拖拽也都能旋转（覆盖层在容器内部，事件会冒泡上来）
  controls = new OrbitControls(camera, canvasWrap);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;          // 禁用平移，避免把脑子拖丢
  controls.minDistance = maxR * 0.55;
  controls.maxDistance = dist * 4;
  controls.autoRotateSpeed = 1.2;
  controls.target.set(0, 0, 0);

  // ---------- 光照（环境贴图已提供主要亮度，这里补方向光塑形） ----------
  scene.add(new THREE.HemisphereLight(0xcfe0ff, 0xe6ecf5, 0.95));  // 地面色提亮，避免脑底发暗
  scene.add(new THREE.AmbientLight(0xffffff, 0.4));
  const key = new THREE.DirectionalLight(0xffffff, 1.15);
  key.position.set(maxR, maxR * 1.2, maxR);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xbcd4ff, 0.55);
  fill.position.set(-maxR * 0.6, maxR * 0.3, maxR);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0x88b4ff, 0.5);
  rim.position.set(-maxR, -maxR * 0.5, -maxR);
  scene.add(rim);

  // ---------- 脑网格（按脑区顶点着色） ----------
  geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.computeVertexNormals();

  baseColors = new Float32Array(nv * 3);
  vcat = new Array(nv);
  const tmp = new THREE.Color();
  for (let i = 0; i < nv; i++) {
    const ri = vreg[i];
    const cat = regCatByIdx[ri] || 'other';
    vcat[i] = cat;
    const c = new THREE.Color(CATEGORIES[cat].color);
    c.offsetHSL(0, 0.08, 0);            // 提饱和度，抵消白底混合造成的发灰发粉
    // 同分类内按脑区微调亮度，制造纹理感（整体提亮，地板抬高避免发暗）
    const f = 0.98 + 0.16 * hash01(ri);
    baseColors[i * 3] = c.r * f;
    baseColors[i * 3 + 1] = c.g * f;
    baseColors[i * 3 + 2] = c.b * f;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(baseColors.slice(), 3));

  // const brainMat = new THREE.MeshPhysicalMaterial({
  //   vertexColors: true,
  //   transparent: true,
  //   opacity: 0.9,                       // 明显的半透明：脑区颜色清晰，又不挡住内部电极
  //   roughness: 0.38,                    // 哑光一些，压掉表面疙瘩的镜面高光
  //   metalness: 0.0,
  //   transmission: 0.0,                  // 关掉透射：白底上会把白掺进颜色，洗成马卡龙色
  //   clearcoat: 0.3,                     // 保留少量玻璃高光
  //   clearcoatRoughness: 0.4,
  //   envMapIntensity: 0.7,
  //   side: THREE.FrontSide,              // 只渲染外层正面，避免双面+无深度排序导致"只显反面"
  //   depthWrite: false
  // });

  const brainMat = new THREE.MeshPhysicalMaterial({
    vertexColors: true,

    // 保留半透明脑皮层
    transparent: true,
    opacity: 0.9,

    roughness: 0.38,
    metalness: 0.0,
    transmission: 0.0,

    clearcoat: 0.3,
    clearcoatRoughness: 0.4,
    envMapIntensity: 0.7,

    // 只绘制朝向相机的皮层表面
    side: THREE.FrontSide,

    // 保留原有的透明显示逻辑
    depthWrite: true, //false,

    // 深度测试必须开启
    depthTest: true
  });

  // 顶点色自发光
  brainMat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      'vec3 totalEmissiveRadiance = emissive;',
      'vec3 totalEmissiveRadiance = emissive + vColor * 0.35;'
    );
  };

  brainMesh = new THREE.Mesh(geometry, brainMat);

  // 脑皮层透明绘制
  brainMesh.renderOrder = 2;

  scene.add(brainMesh);

  // 给顶点色加一点自发光，保证脑区在任意光照下都不发黑
  brainMat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      'vec3 totalEmissiveRadiance = emissive;',
      'vec3 totalEmissiveRadiance = emissive + vColor * 0.35;'
    );
  };
  brainMesh = new THREE.Mesh(geometry, brainMat);
  brainMesh.renderOrder = 2;            // 近侧外壁最后画，压在最上层
  scene.add(brainMesh);

  // 内壁（背面）：淡淡的远侧皮层，建立体积感与正确的前后遮挡关系
  // const innerMat = brainMat.clone();
  // innerMat.side = THREE.BackSide;
  // innerMat.opacity = 0.15;
  // innerMat.depthWrite = false;
  // innerMat.onBeforeCompile = (shader) => {
  //   shader.fragmentShader = shader.fragmentShader.replace(
  //     'vec3 totalEmissiveRadiance = emissive;',
  //     'vec3 totalEmissiveRadiance = emissive + vColor * 0.35;'
  //   );
  // };
  // brainInner = new THREE.Mesh(geometry, innerMat);
  // brainInner.renderOrder = 1;           // 远侧内壁先画，被近壁与电极遮挡
  // scene.add(brainInner);

  // ---------- 传感器（10-20）投影到皮层表面 ----------
  buildSensors(position, nv, regNameByIdx);
  buildRegionSensorMap(atlas);

  // ---------- UI ----------
  buildLegend();
  buildLobesGrid();
  buildTable();

  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointerup', onPointerUp);
  window.addEventListener('resize', onResize);
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') clearFocus(); });

  bindControls();
  loadingEl.style.display = 'none';
  animate();
}

// 确定性hash -> [0,1)
function hash01(n) {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

// 程序化环境贴图：渐变天空 + 几个高光点，给玻璃材质提供反射与整体亮度
function buildEnvironment() {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0.0, '#eaf2ff');
  g.addColorStop(0.45, '#9fb4dd');
  g.addColorStop(1.0, '#26314f');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 256);
  const spots = [[120, 60, 70, 50], [380, 50, 50, 36], [260, 120, 40, 28]];
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  spots.forEach(([x, y, rx, ry]) => {
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  });
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  const envTex = pmrem.fromEquirectangular(tex).texture;
  tex.dispose();
  pmrem.dispose();
  return envTex;
}

// ---------- 传感器 ----------
function buildSensors(position, nv, regNameByIdx) {
  sensorsGroup = new THREE.Group();
  const sphere = new THREE.SphereGeometry(maxRSensor(), 22, 22);
  SENSORS.forEach((s) => {
    const d = dirFromSpherical(s.theta, s.phi);   // 单位方向
    // 找方向上最接近的皮层顶点
    let best = -1, bestScore = -2;
    const dx = d[0], dy = d[1], dz = d[2];
    for (let i = 0; i < nv; i++) {
      const px = position[i * 3], py = position[i * 3 + 1], pz = position[i * 3 + 2];
      const den = px * px + py * py + pz * pz;
      if (den < 1e-6) continue;
      const dot = px * dx + py * dy + pz * dz;
      const score = dot / Math.sqrt(den);          // = cos(夹角)，带符号，取最同向的顶点
      if (score > bestScore) { bestScore = score; best = i; }
    }
    const vx = position[best * 3], vy = position[best * 3 + 1], vz = position[best * 3 + 2];
    const k = 1.1;   // 外移更多，电极球完全浮在皮层表面外，不陷进脑沟
    const wp = [vx * k, vy * k, vz * k];
    s.worldPos = wp;
    s.regionIdx = vreg[best];

    const col = new THREE.Color(CATEGORIES[s.cat].color);
    const mat = new THREE.MeshStandardMaterial({
      color: col, emissive: col, emissiveIntensity: 0.85,
      roughness: 0.3, metalness: 0.1
    });
    const mesh = new THREE.Mesh(sphere, mat);
    mesh.position.set(wp[0], wp[1], wp[2]);
    mesh.userData = { sensor: s };
    sensorsGroup.add(mesh);
    sensorMeshes.push(mesh);

    const el = document.createElement('div');
    el.className = 'electrode-label';
    el.textContent = s.name;
    el.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); focusSensor(s); });
    labelsContainer.appendChild(el);
    labelEls.push({ el, mesh });
  });
  scene.add(sensorsGroup);
}

function maxRSensor() {
  // 传感器球半径：相对脑尺寸（脑半径约 60+），64 导下取小一些避免拥挤
  return 1.8;
}

// 为每个传感器找到其正下方最近的 atlas 脑区（用于"对应脑区"说明）
function buildRegionSensorMap(atlas) {
  const centroids = atlas.regions.map((r) => ({ idx: r.idx, p: r.p }));
  const regionSensors = {};
  SENSORS.forEach((s) => {
    let bestIdx = -1, bestD = Infinity;
    for (const c of centroids) {
      const dx = s.worldPos[0] - c.p[0], dy = s.worldPos[1] - c.p[1], dz = s.worldPos[2] - c.p[2];
      const dd = dx * dx + dy * dy + dz * dz;
      if (dd < bestD) { bestD = dd; bestIdx = c.idx; }
    }
    s.overRegionIdx = bestIdx;
    s.overRegionName = (atlas.regions.find((r) => r.idx === bestIdx) || {}).name || '—';
    (regionSensors[bestIdx] = regionSensors[bestIdx] || []).push(s.name);
  });
  window.__regionSensors = regionSensors;
}

// ---------- 高亮 ----------
function applyHighlight(mode, key) {
  const col = geometry.attributes.color;
  const base = baseColors;
  for (let i = 0; i < vcat.length; i++) {
    let r, g, b;
    if (mode === 'none') {
      r = base[i * 3]; g = base[i * 3 + 1]; b = base[i * 3 + 2];
    } else if (mode === 'category') {
      if (vcat[i] === key) { r = base[i * 3]; g = base[i * 3 + 1]; b = base[i * 3 + 2]; }
      else { r = base[i * 3] * 0.55; g = base[i * 3 + 1] * 0.55; b = base[i * 3 + 2] * 0.55; }
    } else { // region
      if (vreg[i] === key) { r = base[i * 3]; g = base[i * 3 + 1]; b = base[i * 3 + 2]; }
      else { r = base[i * 3] * 0.7; g = base[i * 3 + 1] * 0.7; b = base[i * 3 + 2] * 0.7; }
    }
    col.setXYZ(i, r, g, b);
  }
  col.needsUpdate = true;
}

function setSensorEmphasis(selName) {
  sensorMeshes.forEach((m) => {
    const on = selName && m.userData.sensor.name === selName;
    m.material.opacity = selName ? (on ? 1 : 0.4) : 1;
    m.material.transparent = !!selName;
    m.material.emissiveIntensity = on ? 1.2 : 0.85;
    m.scale.setScalar(on ? 1.8 : 1);
  });
}

function focusSensor(s) {
  selected = { kind: 'sensor', value: s };
  applyHighlight('category', s.cat);
  setSensorEmphasis(s.name);
  showSensorInfo(s);
}

function focusCategory(catId) {
  selected = { kind: 'category', value: catId };
  applyHighlight('category', catId);
  setSensorEmphasis(null);
  showCategoryInfo(catId);
}

function focusRegion(regionIdx) {
  selected = { kind: 'region', value: regionIdx };
  applyHighlight('region', regionIdx);
  setSensorEmphasis(null);
  showRegionInfo(regionIdx);
}

function clearFocus() {
  selected = null;
  applyHighlight('none');
  setSensorEmphasis(null);
  infoEl.innerHTML = defaultInfo();
}

function defaultInfo() {
  return '点击任意电极（传感器），或下方脑区图例 / 直接点击大脑表面，查看其对应的脑区与功能。';
}

// ---------- 信息面板 ----------
function showSensorInfo(s) {
  const C = CATEGORIES[s.cat];
  const side = sensorSide(s.name);
  infoEl.innerHTML = `
    <div class="info-head">
      <span class="dot" style="background:${C.color}"></span>
      <span class="info-name">${s.name}</span>
      <span class="info-sub">${s.label} · ${side}</span>
    </div>
    <div class="info-row"><b>所属脑区</b><span style="color:${C.color}">${C.name}（${C.nameEn}）</span></div>
    <div class="info-row"><b>下方脑区</b><span>${s.overRegionName}</span></div>
    <div class="info-row"><b>位置说明</b><span>${s.note}</span></div>
    <div class="info-row"><b>脑区功能</b><span>${C.func}</span></div>`;
}

function showCategoryInfo(catId) {
  const C = CATEGORIES[catId];
  const names = SENSORS.filter((s) => s.cat === catId).map((s) => s.name).join('、');
  infoEl.innerHTML = `
    <div class="info-head">
      <span class="dot" style="background:${C.color}"></span>
      <span class="info-name">${C.name}</span>
      <span class="info-sub">${C.nameEn}</span>
    </div>
    <div class="info-row"><b>覆盖电极</b><span style="color:${C.color}">${names || '—'}</span></div>
    <div class="info-row"><b>主要功能</b><span>${C.func}</span></div>`;
}

function showRegionInfo(regionIdx) {
  const name = window.__regNameByIdx ? window.__regNameByIdx[regionIdx] : regionIdx;
  const catId = regionCategory(name);
  const C = CATEGORIES[catId];
  const over = (window.__regionSensors && window.__regionSensors[regionIdx]) || [];
  infoEl.innerHTML = `
    <div class="info-head">
      <span class="dot" style="background:${C.color}"></span>
      <span class="info-name" style="font-size:15px">${name}</span>
      <span class="info-sub">${C.name}</span>
    </div>
    <div class="info-row"><b>所属分类</b><span style="color:${C.color}">${C.name}（${C.nameEn}）</span></div>
    <div class="info-row"><b>覆盖电极</b><span>${over.length ? over.join('、') : '无（该脑区无 10-20 电极直接覆盖）'}</span></div>
    <div class="info-row"><b>脑区功能</b><span>${C.func}</span></div>`;
}

// ---------- 图例 / 卡片 / 表 ----------
function catOrder() {
  return ['frontal', 'central', 'parietal', 'temporal', 'occipital',
    'cingulate', 'insula', 'limbic', 'cerebellum', 'brainstem', 'other']
    .filter((id) => CATEGORIES[id]);
}

function buildLegend() {
  catOrder().forEach((id) => {
    const C = CATEGORIES[id];
    const count = SENSORS.filter((s) => s.cat === id).length;
    const item = document.createElement('button');
    item.className = 'legend-item';
    item.innerHTML = `
      <span class="swatch" style="background:${C.color}"></span>
      <span class="legend-name">${C.name}</span>
      <span class="legend-count">${count ? count + ' 电极' : '—'}</span>`;
    item.addEventListener('click', () => focusCategory(id));
    legendEl.appendChild(item);
  });
}

function buildLobesGrid() {
  const grid = document.getElementById('lobes-grid');
  if (!grid) return;
  catOrder().forEach((id) => {
    const C = CATEGORIES[id];
    const count = SENSORS.filter((s) => s.cat === id).length;
    const chip = document.createElement('button');
    chip.className = 'lobe-chip';
    chip.innerHTML = `
      <div class="lc-head"><span class="swatch" style="background:${C.color}"></span>${C.name}${count ? ` · ${count} 电极` : ''}</div>
      <div style="font-size:12px;color:var(--text-dim);margin:4px 0 0">${C.nameEn}</div>
      <p>${C.func}</p>`;
    chip.addEventListener('click', () => focusCategory(id));
    grid.appendChild(chip);
  });
}

function buildTable() {
  SENSORS.forEach((s) => {
    const C = CATEGORIES[s.cat];
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><b>${s.name}</b></td>
      <td>${s.label}</td>
      <td><span class="swatch sm" style="background:${C.color}"></span>${C.name}</td>
      <td class="func-cell">${s.note}</td>`;
    tableBody.appendChild(tr);
  });
}

// ---------- 交互事件 ----------
function pickSensor(ev) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(sensorMeshes, false);
  return hits.length ? hits[0].object.userData.sensor : null;
}

let downX = 0, downY = 0, downActive = false;

function onPointerDown(ev) {
  downX = ev.clientX; downY = ev.clientY; downActive = true;
  // 用户开始手动操作时停掉自动旋转，并同步按钮状态
  if (state.rotate) {
    state.rotate = false;
    controls.autoRotate = false;
    const btn = document.querySelector('#controls [data-action="rotate"]');
    if (btn) btn.classList.remove('active');
  }
}

function onPointerUp(ev) {
  if (!downActive) return;
  downActive = false;
  // 位移超过阈值视为拖拽旋转，不触发点选
  if (Math.hypot(ev.clientX - downX, ev.clientY - downY) > 6) return;
  const s = pickSensor(ev);
  if (s) { focusSensor(s); return; }
  // 点击大脑表面 -> 脑区
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObject(brainMesh, false);
  if (hits.length) {
    const vi = hits[0].face.a;          // 顶点索引
    focusRegion(vreg[vi]);
  } else {
    clearFocus();
  }
}

function onPointerMove(ev) {
  const s = pickSensor(ev);
  renderer.domElement.style.cursor = s ? 'pointer' : 'grab';
}

// ---------- 控制按钮 ----------
function bindControls() {
  const bar = document.getElementById('controls');
  bar.querySelectorAll('[data-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.toggle;
      state[key] = !state[key];
      btn.classList.toggle('active', state[key]);
      applyState();
    });
  });
  bar.querySelector('[data-action="rotate"]').addEventListener('click', (ev) => {
    state.rotate = !state.rotate;
    controls.autoRotate = state.rotate;
    ev.currentTarget.classList.toggle('active', state.rotate);
  });
  // 初始为自动旋转展示态
  controls.autoRotate = state.rotate;
  bar.querySelector('[data-action="rotate"]').classList.toggle('active', state.rotate);
  bar.querySelector('[data-action="reset"]').addEventListener('click', () => {
    resetView();
    clearFocus();
  });
}

function resetView() {
  camera.position.copy(initCamPos);
  controls.target.set(0, 0, 0);
  controls.update();
}

function applyState() {
  sensorsGroup.visible = state.sensors;
  labelsContainer.style.display = state.labels ? '' : 'none';
  brainMesh.visible = state.brain;
  // brainInner.visible = state.brain;
}

// ---------- 标签投影 ----------
function updateLabels() {
  if (!state.labels) return;
  const w = canvasWrap.clientWidth, h = canvasWrap.clientHeight;
  const cam = camera.position;
  labelEls.forEach(({ el, mesh }) => {
    const p = mesh.position;
    const n = p.clone().normalize();
    const toCam = cam.clone().sub(p).normalize();
    if (n.dot(toCam) < 0.1) { el.style.display = 'none'; return; }
    const v = p.clone().project(camera);
    if (v.z > 1) { el.style.display = 'none'; return; }
    const x = (v.x * 0.5 + 0.5) * w;
    const y = (-v.y * 0.5 + 0.5) * h;
    el.style.display = 'block';
    el.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
  });
}

function onResize() {
  const w = canvasWrap.clientWidth, h = canvasWrap.clientHeight;
  if (!w || !h) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  updateLabels();
  renderer.render(scene, camera);
}

// 启动
try {
  if (!window.WebGLRenderingContext) throw new Error('当前浏览器不支持 WebGL');
  infoEl.innerHTML = defaultInfo();
  init().catch((err) => fail('初始化失败：' + (err && err.message ? err.message : err) +
    '。请使用支持 WebGL 的现代浏览器，并通过本地服务器或 GitHub Pages 访问（ES Module 不支持 file:// 直接打开）。'));
} catch (err) {
  fail('初始化失败：' + (err && err.message ? err.message : err));
}
