# 后台主操作 Specular 动效适配记录

## 官方来源与目标

- [React Bits SpecularButton 展示](https://www.reactbits.dev/components/specular-button?radius=36&intensity=1.2&shineFade=45)
- [官方 TypeScript 源码](https://raw.githubusercontent.com/DavidHDev/react-bits/main/src/ts-default/Components/SpecularButton/SpecularButton.tsx)
- [官方 CSS 源码](https://raw.githubusercontent.com/DavidHDev/react-bits/main/src/ts-default/Components/SpecularButton/SpecularButton.css)

已阅读完整 TSX 与 CSS。参考特征是沿圆角边界移动的两瓣反光、较弱的反向光瓣，以及玻璃内部的光池。仅借鉴双瓣追光行为；不采用演示页的圆角、颜色、尺寸和玻璃底色。

## 实现与差异

官方为每个实例建立 WebGL2 画布、观察器和事件监听。本项目有素材、图标和主题选择网格，改为一个后台布局管理器、共享事件委托和最多一个按需 RAF；不增加 WebGL 或 canvas，也不在 pointermove 中更新 React 状态。

边缘使用圆角遮罩与双瓣 conic-gradient，内反射使用独立 radial-gradient。鼠标投射到圆角矩形的最近边界，接近按钮中心时混合至静态光源，防止突跳。渐变在 CSS 角度域计算，未复刻官方着色器的等周长亮斑宽度、SDF 细节与邻近 250px 范围响应；本实现仅追踪当前实际指向的按钮。增强后反向光瓣约为主瓣 62% 亮度，不自动循环旋转。

## 最终范围（按用户纠正）

仅在后台布局挂载管理器和样式，且只接管 `button[data-specular-action="true"]`：添加网站、保存站点设置、更新密码、保存网站。调用方显式标记，不扫描普通按钮或链接。Radix 弹窗通过同一属性接入。

CSS 叠加 `::before` 的 1.5px 双瓣边缘高光和 `::after` 内反射，默认透明；不设置背景色、文字色、圆角、尺寸、间距或焦点。按本轮用户要求，悬停／键盘聚焦时增加 2px 上浮与海蓝阴影，按下回落；斜向高光只进入时扫过一次（680ms），之后保留更清楚的鼠标光池，不循环扫过。原按钮继续采用 admin.css 的 #386b7c 底色、#2b5969 悬停色、9px 圆角、43px 最小高度和 10px 18px 间距。首页导航恢复原透明底与下划线；菜单、分类、状态标签、图标选择及其他动作不接入。

## 性能与可访问性

仅正在交互的一个控件进入 RAF，光源稳定后停止；没有常驻循环或每按钮监听。ResizeObserver 只观察当前控件。页面隐藏、控件隐藏/卸载/禁用时取消追踪。减少动态效果、触屏和强制高对比时隐藏装饰层；上浮、按下位移与扫光仅在精确指针且未请求减少动效时启用，原按钮与键盘焦点保持可用。装饰层 pointer-events:none，不截获操作；卸载清除监听、观察器、RAF 与运行时属性。
