# Tech Text 中文主标题适配

## 来源与固定版本

- 用户指定演示：[React Bits Tech Text](https://www.reactbits.dev/text-animations/tech-text)。
- 已阅读完整上游 [TechText.tsx](https://raw.githubusercontent.com/DavidHDev/react-bits/main/src/ts-default/TextAnimations/TechText/TechText.tsx)（1017 行）和 [TechText.css](https://raw.githubusercontent.com/DavidHDev/react-bits/main/src/ts-default/TextAnimations/TechText/TechText.css)（13 行）。
- 本次读取时，TSX 文件最后变更 commit 为 [`14330e6963f6c5ddd773ee2af844d0630c22b958`](https://github.com/DavidHDev/react-bits/commit/14330e6963f6c5ddd773ee2af844d0630c22b958)。[固定 TSX 源码](https://github.com/DavidHDev/react-bits/blob/14330e6963f6c5ddd773ee2af844d0630c22b958/src/ts-default/TextAnimations/TechText/TechText.tsx)。
- 上游版权：Copyright (c) 2026 David Haz。许可为 [MIT + Commons Clause](https://github.com/DavidHDev/react-bits/blob/main/LICENSE.md)，本适配保留源文件头部署名并引用项目 `NOTICE.md` 中的完整许可；上游条款不被本项目主体许可证替代。

## 保留的核心效果

采用浏览器 Canvas 2D 和已有字体直接生成字形，不使用外部字体、WebGL、SVG 字库或新增依赖。每字缓存实心图与虚线图：`strokeText` 产生虚线描边后，用 `destination-out` 减去填充，得到真实空心虚线字形。鼠标附近的字由实心平滑转换成虚线轮廓，离开后恢复实心；不是整段入场淡入。

保留上游按需 rAF 与指数趋近的过渡方式。字形缓存创建时读取 alpha 像素，采样字形边缘作为两个微小扫描点的位置；动画帧只绘制缓存，不读取像素。最接近鼠标的字上有四个短定位角和一条很细的扫描光线；没有覆盖整段的标签、密集粒子或拖拽手柄。

## 面向本项目的改动

- **真实 DOM 标题**：根节点为 `span`，内部完整原文负责 SSR/SEO、无障碍、文字选择、布局和自动换行。Canvas 为 `aria-hidden` 的绝对定位叠层，没有重复的 `aria-label`。
- **中文多行布局**：读取浏览器 DOM Range 的逐字位置，跟随真实排版绘制，而非把长标题压成一行。继承外层字号、字重、行高、字距与对齐；`--font-display` 使用项目已打包的 `Noto Serif SC Variable`。中文、英文、混合标点及最多 120 个字素均可自然换行，不设固定高度或省略号。超过 120 个字素时仍显示全部 DOM 原文，只跳过增强层。
- **无动画时优先原文**：没有交互时保持原 DOM 可见；只有完整绘制出交互帧之后才暂时隐藏原文的视觉颜色。禁用 JS、没有 Canvas、字体尚未加载、触屏、减少动态效果、强制高对比或 `paused` 时均显示实际原文。
- **字体变化**：本地字体完成加载后重建字形缓存；字体加载期间立即回到原文。监听字体加载、内容尺寸、窗口尺寸和顶层主题变化。
- **轻量化**：移除上游可拖动字符、弹簧/点击踢动、长标签、度量辅助线、组装和打字入场、自动循环扫过整段等选项。保留核心鼠标虚线轮廓与少量技术定位效果。
- **生命周期**：`paused`、卸载、离屏或页面隐藏时取消 rAF；卸载断开 Resize/Intersection/MutationObserver，移除所有鼠标、媒体查询、字体、可见性与尺寸监听。字体 Promise 在组件失效后不会继续更新。

## API 与主标题接入

```tsx
import { TechText } from "@/components/effects/tech-text";

<h1 id="portal-heading">
  <TechText text={settings.headline} paused={ambientPaused} />
</h1>
```

`TechText({ text: string, paused?: boolean, className?: string })` 为命名导出。它不创建 `h1`，也不自行缩小字号；外层主标题可继续设置桌面 `clamp(34px, 3.2vw, 50px)`、手机 28–36px 的字号。高度完全由实际文字换行撑开。组件自身导入配套 CSS，无额外初始化步骤。

## 检查范围

已通过单文件 ESLint 和完整项目 `tsc --noEmit --incremental false`。本子任务未启动服务器、浏览器、部署或提交代码；实际页面的鼠标视觉核对由主任务结合最终标题布局完成。
