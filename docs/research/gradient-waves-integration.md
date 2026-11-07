# Gradient Waves 集成记录

## 来源与归属

- 官方效果页：<https://www.reactbits.dev/backgrounds/gradient-waves>
- 上游仓库：<https://github.com/DavidHDev/react-bits>
- 检查日期：2026-11-01。
- 采用版本：`4dc7b5b7772e1217c8fb8d2a7aa074302180e5b4`（上游 main，提交日期 2026-10-31）。
- TypeScript 源码：<https://github.com/DavidHDev/react-bits/blob/4dc7b5b7772e1217c8fb8d2a7aa074302180e5b4/src/ts-default/Backgrounds/GradientWaves/GradientWaves.tsx>
- CSS 源码：<https://github.com/DavidHDev/react-bits/blob/4dc7b5b7772e1217c8fb8d2a7aa074302180e5b4/src/ts-default/Backgrounds/GradientWaves/GradientWaves.css>
- 原始 TSX SHA-256：`7c8e13a0b3e379464d6c3e54bf43e06c486d6f8beb8803ab3eae6005baa13317`。
- 原作者：David Haz，`Copyright (c) 2026 David Haz`。
- 许可：**MIT + Commons Clause License Condition v1.0**，并非无附加条件的 MIT。许可原文见 <https://github.com/DavidHDev/react-bits/blob/4dc7b5b7772e1217c8fb8d2a7aa074302180e5b4/LICENSE.md>。本地归属及许可全文由仓库 NOTICE/第三方许可记录统一收录。

本次只在导航站产品中集成该背景，不提供 React Bits 组件包、模板包或独立效果售卖。

## 本地接口

```tsx
import { GradientWaves } from "@/components/effects/gradient-waves";

<GradientWaves paused={false} className="portal-wave-background" />
```

命名导出 `GradientWaves`，参数只有 `paused?: boolean`（默认 `false`）与 `className?: string`。组件内自动引入 CSS，无运行时新依赖。根元素默认占满父容器，调用方负责父级高度、固定或绝对定位、背景与正文层级。首页和跳转遮罩均可复用。

根元素 `aria-hidden="true"`、`pointer-events: none`；鼠标光照和空白区域点击波动通过被动全局事件监听实现，不阻止链接、按钮、滚动或表单交互。

## 相对上游的适配

1. **保留真实水面。** 顶点与片元 shader 原样保留，包括高度场导数、raymarch、法线、光照、雾、波峰和四个点击波包；保留原版射线/地面交点计算。CSS 渐变仅承担 WebGL 不可用时的静态回退。
2. **收紧公开参数。** 上游通用配色、镜头与质量参数改为适合本产品的固定配置，避免把底层调参带入站点后台。
3. **海蓝与雾蓝。** 地平线 `#b9cfe3`，主体 `#497a91`，波峰 `#d8c7d8`，底色 `#d9e5eb`；启用原版浅色光照模式。波峰仅少量泛灰樱粉，不叠加全屏粉色滤镜。
4. **缓慢且克制。** 流速 `0.16`、振幅 `2.3`、浮雕 `0.82`、光泽 `0.22`、颗粒 `0.025`；视差强度 `0.16`、鼠标光照强度 `0.24`。点击波峰增益从 `2.8` 降为 `1.5`，最多保留四个 3.2 秒波包。关闭原版 2.6 秒入场，避免短暂跳转遮罩还没显现便结束。
5. **降低绘制负载。** 所有设备采用上游 low 档 56 步。桌面限制 DPR ≤ 1.25、30 fps、约 140 万绘制像素；手机/粗指针设备限制 DPR ≤ 1、24 fps、约 60 万像素；同时尊重 GPU 最大渲染尺寸。实际 DPR 可能因像素预算进一步降低。WebGL 使用 low-power、关闭抗锯齿/深度/模板，只用一个三角形覆盖一个 canvas。
6. **完全停帧。** 页面不可见、容器离屏或 `paused` 时立即取消 rAF，恢复后不补播累计时间。动态监听 `prefers-reduced-motion`，开启后只绘制一帧完整静态水面，不保留持续循环；调整大小后按需重绘一帧。
7. **可靠回退和恢复。** 不支持 WebGL2、shader 编译/链接/资源申请失败时保留静态珠光渐变；上下文丢失立即隐藏画布，恢复后重建 GL 资源并按当前暂停/动态偏好恢复。首帧成功前不显示未绘制画布。
8. **完整释放。** 卸载时断开 IntersectionObserver/ResizeObserver，移除鼠标、窗口大小、页面可见性、媒体查询和上下文事件，取消 rAF，删除 program/buffer/VAO，主动释放 GL context 并移除 canvas。
9. **可检查状态。** 根 DOM 的 `data-renderer="webgl2|fallback"` 与 `data-motion="running|paused|reduced|hidden"` 用于验证，不向产品用户展示。静态 fallback 默认标记为 paused；hidden 包含后台标签页、离屏及零尺寸容器。

## 验证边界

本任务执行源码与类型/静态检查，不自行启动临时服务、浏览器、部署或提交。实际 GPU 渲染、配色与短时遮罩视觉效果需由主任务在集成后验证。
