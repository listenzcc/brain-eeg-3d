# 将 atlas CSV 网格转换为浏览器可快速加载的二进制
#
# 输入 (assets/):
#   vertices-all.csv : ,x,y,z,idx
#   cells-all.csv    : ,v0,v1,v2,idx (v* 为脑区内局部顶点索引, 已验证)
#   atlas_table.csv  : ,name,x,y,z,idx (仅取脑区名称; 质心点改用网格顶点均值)
#
# ★ 坐标系解码 (96 区回归验证, R2>0.95):
#   CSV 列标签有误导, 三列真实含义:
#     col1(标'x') = 上下(superior)   ~ 0.92 * table.z
#     col2(标'y') = 前后(anterior)   ~ 0.93 * table.y
#     col3(标'z') = 左右, 向左增大   ~ -0.99 * table.x + 89.4
#   即 col3 大 = 患者左侧。
#
# 输出 (assets/gen/):
#   brain_pos.bin        Float32LE  [nv*3]  three.js 空间坐标(已居中)
#   brain_idx.bin        Uint32LE   [nc*3]  全局三角形索引(局部索引已加块偏移)
#   brain_tri_region.bin Uint16LE   [nc]    每个三角形的脑区 idx
#   atlas.json           脑区表(name/idx/质点) + meta
#
# three.js 空间 (旋转映射, det=+1, 不镜像):
#   X = col3 (向左增大) => 正面视角(相机+Z)下患者左在观察者右, 如面对面
#   Y = col1 (上)
#   Z = col2 (前, 朝向相机)
#   顶点/质点均减去各轴包围盒中点。

import csv
import json
import os
from array import array
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.normpath(os.path.join(HERE, '..', 'assets'))
OUT = os.path.join(ASSETS, 'gen')
os.makedirs(OUT, exist_ok=True)

# ---------- 顶点 ----------
verts = []
v_region = []
with open(os.path.join(ASSETS, 'vertices-all.csv'), newline='') as f:
    r = csv.reader(f)
    next(r)
    for row in r:
        verts.append((float(row[1]), float(row[2]), float(row[3])))  # (col1,col2,col3)
        v_region.append(int(row[4]))
nv = len(verts)

# 脑区顶点块起始偏移(已验证连续分块)
offset = {}
prev = None
for i, k in enumerate(v_region):
    if k != prev:
        offset[k] = i
        prev = k

# 包围盒(col1,col2,col3)
col_bounds = [(min(v[a] for v in verts), max(v[a] for v in verts)) for a in range(3)]
center = tuple((b[0] + b[1]) / 2 for b in col_bounds)   # (c1, c2, c3)
half = tuple((b[1] - b[0]) / 2 for b in col_bounds)


def to_three(p):
    """(col1,col2,col3) atlas -> three.js 空间, 已居中"""
    return (p[2] - center[2], p[0] - center[0], p[1] - center[1])


# 写顶点 bin
pos = array('f')
for v in verts:
    pos.extend(to_three(v))
with open(os.path.join(OUT, 'brain_pos.bin'), 'wb') as f:
    pos.tofile(f)

# ---------- 三角形(局部索引 -> 全局) ----------
tri = array('I')
tri_region = array('H')
with open(os.path.join(ASSETS, 'cells-all.csv'), newline='') as f:
    r = csv.reader(f)
    next(r)
    for row in r:
        k = int(row[4])
        off = offset[k]
        a, b, c = int(row[1]) + off, int(row[2]) + off, int(row[3]) + off
        assert a < nv and b < nv and c < nv, 'bad triangle index'
        tri.extend((a, b, c))
        tri_region.append(k)
with open(os.path.join(OUT, 'brain_idx.bin'), 'wb') as f:
    tri.tofile(f)
with open(os.path.join(OUT, 'brain_tri_region.bin'), 'wb') as f:
    tri_region.tofile(f)

# 逐顶点脑区索引(供按区/按类高亮; 与 brain_pos 顶点序一致)
vreg = array('H', v_region)
with open(os.path.join(OUT, 'brain_vregion.bin'), 'wb') as f:
    vreg.tofile(f)

# ---------- 脑区表: 名称 + 网格顶点均值(作为可见质点) ----------
blocks = defaultdict(list)
for i, k in enumerate(v_region):
    blocks[k].append(i)
names = {}
with open(os.path.join(ASSETS, 'atlas_table.csv'), newline='') as f:
    r = csv.reader(f)
    next(r)
    for row in r:
        names[int(row[5])] = row[1]

regions = []
for k, b in sorted(blocks.items()):
    m = [sum(verts[i][a] for i in b) / len(b) for a in range(3)]
    p = to_three(tuple(m))
    regions.append({'name': names[k], 'idx': k, 'p': [round(v, 2) for v in p],
                    'nv': len(b)})

meta = {
    'nv': nv,
    'nc': len(tri) // 3,
    'n_regions': len(regions),
    # three 空间半轴: (左右, 上下, 前后)
    'half': [round(half[2], 2), round(half[0], 2), round(half[1], 2)],
}
with open(os.path.join(OUT, 'atlas.json'), 'w', encoding='utf-8') as f:
    json.dump({'meta': meta, 'regions': regions}, f, ensure_ascii=False)

print('vertices:', nv, ' triangles:', len(tri) // 3, ' regions:', len(regions))
print('col bounds:', [(round(a, 1), round(b, 1)) for a, b in col_bounds])
print('three half (lat,vert,ant):', meta['half'])
# 抽查: L 区应在 three +X, R 区在 -X
for k in (30, 31):
    r30 = next(x for x in regions if x['idx'] == k)
    print(f"region {k} {r30['name']}: three_p={r30['p']}")
print('written to', OUT)
