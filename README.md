# 脑电电极 × 大脑脑区 3D 可视化

基于 **Three.js** 的交互式 3D 网页，展示脑电图（EEG）**10-20 国际电极放置系统**的头皮电极与大脑实际脑区的对应关系。

> WorkBuddy · 1024 造物挑战 · 程序员节应用创作大赛 参赛作品

## 核心亮点

- **真实脑图谱网格**：大脑不是示意性椭球，而是由真实脑图谱（96 个脑区、约 11 万顶点）构建的皮层网格，按脑区类别顶点着色。
- **19 个头皮电极（传感器）**：覆盖 10-20 系统的标准电极（Fp1/Fp2、F7/F8、F3/F4/Fz、C3/C4/Cz、T7/T8、P7/P8、P3/P4/Pz、O1/O2），每个电极按方向投影到皮层表面最近点。
- **电极 ↔ 脑区联动**：
  - 点击电极 → 高亮其所属脑区分类（额叶 / 中央区 / 顶叶 / 颞叶 / 枕叶 / 扣带回 …），并在右侧面板显示位置说明、正下方脑区与功能。
  - 点击脑区图例 / 功能卡片 → 整体高亮该分类及其覆盖的全部电极。
  - 直接点击大脑表面 → 定位到具体的脑区结构并显示其名称与功能。
- **自由交互**：拖拽旋转、滚轮缩放、自动旋转、一键重置视角；电极、标签、脑模型可分别开关。
- **纯静态、自包含**：Three.js 已随仓库打包在 `vendor/`，脑图谱数据已预处理为二进制放在 `assets/gen/`，无需任何联网依赖，可直接部署到 GitHub Pages。

## 目录结构

```
.
├── index.html              # 页面入口（含 importmap）
├── css/style.css           # 暗色科技风样式（响应式）
├── js/
│   ├── main.js             # Three.js 场景、交互、高亮逻辑
│   └── data.js             # 脑区分类 + 10-20 电极方向数据
├── vendor/
│   ├── three.module.js     # Three.js r160（本地打包）
│   └── OrbitControls.js    # 轨道控制器
├── assets/
│   ├── *.csv               # 原始脑图谱数据（vertices / cells / atlas 表）
│   └── gen/                # 预处理后的二进制（已生成，浏览器直接加载）
│       ├── brain_pos.bin        # 顶点位置 float32 × 3
│       ├── brain_idx.bin        # 三角形索引 uint32 × 3
│       ├── brain_vregion.bin    # 逐顶点脑区索引 uint16
│       ├── brain_tri_region.bin # 逐三角形脑区索引 uint16
│       └── atlas.json           # 96 脑区名称 + 网格顶点均值质心
├── tools/
│   └── convert_atlas.py    # CSV → 二进制的预处理脚本（可重跑）
├── serve.py                # 本地预览服务器（自带正确 MIME 类型）
└── .nojekyll
```

> 说明：`assets/gen/` 已生成好，直接部署即可；如需重新生成，运行 `python tools/convert_atlas.py`（依赖仅标准库）。

## 本地预览

ES Module 需通过 HTTP 提供服务（直接用 `file://` 打开会因 CORS 无法加载模块）。

在项目根目录运行：

```bash
python serve.py          # 默认 8123 端口，可换端口：python serve.py 8000
# 浏览器访问 http://127.0.0.1:8123/
```

> 为什么不用 `python -m http.server`？部分 Python/系统环境会把 `.js` 按 `text/plain` 返回，
> 浏览器对 `<script type="module">` 做严格 MIME 检查会直接报错拒绝执行。
> `serve.py` 显式声明了 `.js/.mjs/.json/.bin` 的 Content-Type。GitHub Pages 不受此问题影响。

## 部署到 GitHub Pages

1. 将整个文件夹作为仓库内容推送到 GitHub（例如仓库名 `brain-eeg-3d`）。
2. 进入仓库 **Settings → Pages**（设置 → 页面）。
3. **Build and deployment → Source** 选择 **Deploy from a branch**。
4. **Branch** 选择 `main`（或你的默认分支），目录选择 **/ (root)**，点击 Save。
5. 等待约 1 分钟，GitHub 会给出可访问的 `https://<用户名>.github.io/<仓库名>/` 链接。

> 提示：站点为纯静态，无需构建步骤。所有资源均为相对路径，放在任意子目录也能正常加载。根目录的 `.nojekyll` 用于避免 GitHub Pages 的 Jekyll 处理干扰 `assets/` 等路径。

## 技术说明

- **坐标系**：二进制与 `js/data.js` 一致，采用 three.js 空间（已居中）：+X = 患者左侧（面对面视角里在屏幕右侧），+Y = 上，+Z = 前（额极方向）。
- **电极方向**：每个电极用球面角 `(theta, phi)` 定义单位方向，再在皮层网格上寻找最同向的顶点作为落点（带符号余弦最大化，避免反方向顶点干扰）。
- **脑区分类**：将 96 个 atlas 脑区归并为 11 个展示类别（额叶 / 中央区 / 顶叶 / 颞叶 / 枕叶 / 扣带回 / 岛叶 / 边缘皮下 / 小脑 / 脑干 / 其他），见 `js/data.js` 的 `CATEGORIES` 与 `regionCategory()`。

## 说明

电极方向为 10-20 系统的**示意性近似**（用于教学与科普演示，非临床定位精度）。
