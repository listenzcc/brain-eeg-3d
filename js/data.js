// 数据层：脑区分类、10-20 国际系统电极(传感器)方向与脑区映射
//
// 坐标系（与 assets/gen 二进制一致，three.js 空间，已居中）：
//   +X = 患者左侧（面对面视角里在屏幕右侧），-X = 右侧
//   +Y = 上，+Z = 前(额极/Nasion 方向)，-Z = 后(枕部/Inion)
//
// 电极方向用球面角定义：
//   theta = 极角(自 +Y 顶向下量)，0°=头顶，90°=赤道(耳侧水平面)
//   phi   = 方位角(自 +Z 前向后，朝 +X 左侧为正)，范围 [-180°,180°]
//   单位方向： x = sin(theta)·sin(phi),  y = cos(theta),  z = sin(theta)·cos(phi)
// 说明：坐标为 10-20 系统的示意性近似，用于教学演示，非临床定位精度。

// ---------- 脑区分类（覆盖 96 个 atlas 脑区 + 传感器归类） ----------
export const CATEGORIES = {
  frontal: {
    id: 'frontal', name: '额叶', nameEn: 'Frontal Lobe', color: '#ff6f91',
    func: '主管自主运动计划、决策、语言表达（左半球额下回 Broca 区），并参与情绪与性格调控。'
  },
  central: {
    id: 'central', name: '中央区', nameEn: 'Central (Motor / Sensory)', color: '#ffd166',
    func: '以中央沟为界，含初级运动皮层（中央前回）与初级体感皮层（中央后回），调控对侧肢体的运动与触觉。'
  },
  parietal: {
    id: 'parietal', name: '顶叶', nameEn: 'Parietal Lobe', color: '#4dabf7',
    func: '负责空间定向、触觉与本体感觉整合，以及注意力分配与多感官信息汇合。'
  },
  temporal: {
    id: 'temporal', name: '颞叶', nameEn: 'Temporal Lobe', color: '#2ecc9b',
    func: '处理听觉信息、语言理解（颞上回 Wernicke 区），并参与长时记忆的形成与提取。'
  },
  occipital: {
    id: 'occipital', name: '枕叶', nameEn: 'Occipital Lobe', color: '#b197fc',
    func: '容纳初级视觉皮层，处理颜色、形状、运动与空间频率等视觉信息。'
  },
  cingulate: {
    id: 'cingulate', name: '扣带回', nameEn: 'Cingulate Cortex', color: '#f7a35c',
    func: '位于半球内侧，参与情绪调节、冲突监控与默认模式网络，是边缘系统的重要组成。'
  },
  insula: {
    id: 'insula', name: '岛叶', nameEn: 'Insular Cortex', color: '#c792ea',
    func: '深埋于外侧裂内，参与内脏感觉、痛觉与自我意识、情绪处理。'
  },
  limbic: {
    id: 'limbic', name: '边缘 / 皮下', nameEn: 'Limbic / Subcortical', color: '#8d99ae',
    func: '含海马、杏仁核、丘脑等，主管记忆、情绪与自主功能的中枢中继。'
  },
  cerebellum: {
    id: 'cerebellum', name: '小脑', nameEn: 'Cerebellum', color: '#36c5b0',
    func: '协调运动、维持平衡与肌张力，并参与运动学习与部分认知功能。'
  },
  brainstem: {
    id: 'brainstem', name: '脑干', nameEn: 'Brainstem', color: '#e0a458',
    func: '连接大脑与脊髓，调控呼吸、心跳等基本生命体征与睡眠-觉醒。'
  },
  other: {
    id: 'other', name: '其他', nameEn: 'Other', color: '#5b6b8c',
    func: '未被归入上述主类的少量脑区。'
  }
};

// 由 atlas 脑区英文名映射到分类 id
export function regionCategory(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('cerebellum') || n.includes('vermis')) return 'cerebellum';
  if (n.includes('brain-stem') || n.includes('brainstem')) return 'brainstem';
  if (n.includes('insula')) return 'insula';
  if (n.includes('cingulate') || n.includes('isthmus') || n.includes('subcallosal')) return 'cingulate';
  // 中央沟两侧的运动-感觉皮层带（含辅助运动区 SMA / 旁中央小叶）
  if (n.includes('precentral') || n.includes('postcentral') || n.includes('paracentral') ||
      n.includes('juxtapositional') || n.includes('supplementary motor'))
    return 'central';
  if (anyKey(n, ['hippocamp', 'amygdala', 'parahippocamp', 'thalamus', 'caudate',
                 'putamen', 'pallidum', 'accumbens', 'ventraldc', 'fornix', 'entorhinal']))
    return 'limbic';
  if (n.includes('cuneal') || anyKey(n, ['occipital', 'cuneus', 'lingual', 'calcarine']))
    return 'occipital';
  if (n.includes('precuneous') || n.includes('precuneus')) return 'parietal';
  if (n.includes('planum polare') || n.includes('fusiform')) return 'temporal';
  if (anyKey(n, ['temporal', 'heschl', 'bankssts', 'transverse'])) return 'temporal';
  if (anyKey(n, ['parietal', 'supramarginal', 'angular'])) return 'parietal';
  if (anyKey(n, ['frontal', 'orbital', 'rectus', 'opercul', 'rostral', 'caudal']))
    return 'frontal';
  return 'other';
}

function anyKey(n, keys) { return keys.some((k) => n.includes(k)); }

// ---------- 64 导（扩展 10-10 系统）电极布局 ----------
// 现代命名 T7/T8/T9/T10、P7/P8… 对应传统 T3/T4/T5/T6…。
// 下列为常见 64 导脑电帽的 10-10 命名集合；theta/phi 由命名规则推算（见 layoutFor），
// 再在皮层网格上找最同向顶点落点，保证解剖对应。坐标为教学示意，非临床精度。
const ELECTRODE_NAMES = [
  'Fp1', 'Fp2',                                                  // 额极
  'AF7', 'AF3', 'AFz', 'AF4', 'AF8',                             // 前额
  'F7', 'F5', 'F3', 'F1', 'Fz', 'F2', 'F4', 'F6', 'F8', 'F9', 'F10',
  'FT7', 'FC5', 'FC3', 'FC1', 'FCz', 'FC2', 'FC4', 'FC6', 'FT8', // 额中央
  'T7', 'C5', 'C3', 'C1', 'Cz', 'C2', 'C4', 'C6', 'T8',          // 中央
  'TP7', 'CP5', 'CP3', 'CP1', 'CPz', 'CP2', 'CP4', 'CP6', 'TP8', // 中央顶
  'P7', 'P5', 'P3', 'P1', 'Pz', 'P2', 'P4', 'P6', 'P8',          // 顶叶
  'PO7', 'PO3', 'POz', 'PO4', 'PO8',                             // 顶枕
  'O1', 'Oz', 'O2',                                              // 枕叶
  'T9', 'T10'                                                    // 颞极
];

// 各前缀对应的矢状弧长 a（0=前额极Nasion … 180=枕极Inion），单位度
const BASE_A = { Fp: 6, AF: 22, F: 40, FT: 60, FC: 54, C: 72, T: 86, TP: 100, CP: 94, P: 116, PO: 134, O: 150 };
// 由中线向外的纬度角幅值 b（按 lateral rank 0..5）
const LAT_B = [0, 20, 38, 54, 70, 82];
// 电极命名前缀 -> 脑区分类（用于高亮分组与说明）
const CAT_OF = {
  Fp: 'frontal', AF: 'frontal', F: 'frontal',
  FC: 'central', C: 'central',
  FT: 'temporal', T: 'temporal',
  TP: 'parietal', CP: 'parietal', P: 'parietal', PO: 'parietal',
  O: 'occipital'
};
// 电极命名前缀 -> 中文脑区词
const REGION_WORD = {
  Fp: '额极', AF: '前额', F: '额叶', FC: '额中央', FT: '额颞', T: '颞叶',
  TP: '颞顶', C: '中央(运动/体感)', CP: '中央顶', P: '顶叶', PO: '顶枕', O: '枕叶'
};

function prefixOf(name) {
  for (const p of ['Fp', 'AF', 'FT', 'FC', 'TP', 'CP', 'PO', 'F', 'C', 'P', 'T', 'O']) {
    if (name.startsWith(p)) return p;
  }
  return 'F';
}

// 由 10-10 命名推算 (theta, phi, 分类, 侧别, 脑区词)
// 思路：电极方向 = 矢状弧长 a(前后) 与纬度角 b(左右) 的合成。
//   方向向量 = ( sin(b)·side,  cos(b)·sin(a),  cos(b)·cos(a) )
//   再反算成 (theta, phi) 交给 dirFromSpherical 落点，保证前方电极在前、后方电极在后。
function layoutFor(name) {
  const prefix = prefixOf(name);
  const rest = name.slice(prefix.length);
  const isZ = (rest === 'z' || rest === 'Z');
  const num = isZ ? 0 : parseInt(rest, 10);
  const side = isZ ? 0 : (num % 2 === 1 ? 1 : -1);        // +1 患者左(+X)，-1 右
  const rank = isZ ? 0 : Math.min(Math.ceil(num / 2), 5);  // 0(中线)..5(最外)
  // T9/T10 为颞极，偏前于 T7/T8
  const a = (name === 'T9' || name === 'T10') ? 62 : (BASE_A[prefix] || 40);
  const b = LAT_B[rank];
  const aR = a * Math.PI / 180, bR = b * Math.PI / 180;
  const cosb = Math.cos(bR);
  const X = Math.sin(bR) * side;          // 左右（+X = 患者左）
  const Y = cosb * Math.sin(aR);          // 上下
  const Z = cosb * Math.cos(aR);          // 前后（+Z = 前）
  const theta = Math.acos(Math.max(-1, Math.min(1, Y))) * 180 / Math.PI;
  const phi = Math.atan2(X, Z) * 180 / Math.PI;   // phi=0 朝前(+Z)
  const cat = CAT_OF[prefix] || 'frontal';
  const sideWord = isZ ? '中线' : (side > 0 ? '左侧' : '右侧');
  const regionWord = REGION_WORD[prefix] || '脑区';
  return { theta, phi, cat, sideWord, regionWord };
}

export const SENSORS = ELECTRODE_NAMES.map((name) => {
  const L = layoutFor(name);
  return {
    name,
    theta: L.theta,
    phi: L.phi,
    cat: L.cat,
    label: name,
    note: `${L.sideWord}${L.regionWord}区，扩展 10-10 系统 ${name} 导联。`
  };
});

// 由球面角得到单位方向向量 [x,y,z]
export function dirFromSpherical(thetaDeg, phiDeg) {
  const t = thetaDeg * Math.PI / 180;
  const p = phiDeg * Math.PI / 180;
  const st = Math.sin(t);
  return [st * Math.sin(p), Math.cos(t), st * Math.cos(p)];
}

// 电极中文侧别
export function sensorSide(name) {
  if (name.endsWith('z')) return '中线';
  return name.slice(-1) % 2 === 1 ? '左侧' : '右侧';
}
