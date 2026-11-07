# 原创动漫鼠标资源与实现参考

检索日期：2026-11-01。只参考实现方式，没有复制参考站的动漫人物或鼠标素材。

## 一手参考

| 来源 | 借鉴点 | 本项目取舍 |
| --- | --- | --- |
| [MDN cursor](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/cursor) | 原生 cursor 支持 PNG、显式热点和必须保留的系统后备值；Chromium/Firefox 通常限制在 128×128 内 | 使用 64×64 透明 PNG，热点 4 4，箭头回退 auto、可点击元素回退 pointer；64px 用来容纳角色，图片异常时仍能正常点击 |
| [ShuninYu/anime-cursor 原仓库](https://github.com/ShuninYu/anime-cursor) | 原生 CSS cursor 与按元素类型区分默认/可点击状态的方案 | 只采用浏览器原生指针，不引入该库、动画帧或鼠标跟随元素 |
| [Cursors-4U 的实现博客](https://www.cursors-4u.com/blog/we-made-animated-cursors-work-on-the-web-heres-how) | 讨论个人博客动漫鼠标的静态格式、CSS 动画与 DOM 跟随取舍 | 选择静态角色光标，不引入动画或第三方脚本，避免持续计算 |
| [Phosphor React 原仓库许可证](https://github.com/phosphor-icons/react/blob/master/LICENSE) | 项目已有 Cursor / HandPointing 图标及 MIT 许可 | 上层叠加标准白色箭头或左倾手型，保留可辨认的点击位置；完整许可随资源保存在 LICENSE.phosphor.txt |

## 资源与兼容

- 六枚角色是内置 imagegen 分别生成的原创视觉，没有指定既有动漫作品、角色或画师；没有下载第三方角色素材。
- 公共资源为 `public/cursors/{sakura,ocean,mint,lavender,amber,mono}.png` 及相应 `-pointer.png`，12 张共 37,525 字节，单图 2.8–3.4KB。
- 每张为 64×64 的带 alpha PNG。角色位于右侧 44×56 区域，左上角为 Phosphor 标准箭头/手型。Sharp 仅用于 alpha 裁边、缩小、图标合成与调色板压缩。
- CSS 使用原生 `cursor: url(...) 4 4, auto/pointer`；仅在 `(hover: hover) and (pointer: fine)` 下启用。文本、禁用控件保留系统语义，手机不绘制自定义指针。
- `default` 与六个原有设置键全部保留；后台继续通过已有设置 API 存储 `cursorStyle`，无需迁移。预览使用实际 PNG，未另增大图下载。
- 不包含 DOM 鼠标跟随、mousemove 监听、requestAnimationFrame、动态小人或鼠标动画。
- 旧的 12 张纯色 SVG 已删除。角色视觉随项目开源分发，Phosphor 图标部分继续遵守其 MIT 许可。

## 生成提示词

生成方式：内置 imagegen，六次独立生成，均设置 `transparent_background: true`。以下公共提示词后拼接对应角色提示词，形成实际使用的完整提示词。

公共提示词：

> Use case: stylized-concept. Asset: one original anime chibi character cutout for a tiny native web cursor. Truly transparent alpha background. Single centered front facing full-body character, big head 65% of height, extremely simplified clear silhouette, thick deep navy outline, flat crisp anime cel shading, very few large color areas, sweet expressive face. Reads clearly at 46 pixels tall. No scenery, ground, shadow, frame, text, extra objects floating around, cursor arrow, watermark, or copyrighted/franchise characters. Keep all limbs inside frame with generous transparent margins.

- **sakura**：Pink-haired cherry blossom girl, two large short rounded twin tails, white and rose kimono dress, big sakura flower hairclip at one side, little feet, hands held together.
- **ocean**：Blue-haired sailor girl, rounded white sailor cap with blue band, short blue bob haircut, navy and white sailor collar dress and blue neck bow, both hands at waist.
- **mint**：Mint-haired woodland elf girl, long sharply pointed ears extending sideways, leaf crown and green leaf shaped tunic, leaf-shaped cape creating a wide triangular silhouette, tiny brown boots.
- **lavender**：Little violet-haired witch girl, enormous dark purple pointed crooked witch hat with gold star on its band, simple lavender cape and dress, one small star tipped wand close to body.
- **amber**：Golden ginger-haired cat-eared anime girl, two tall distinct orange cat ears, short fluffy hair, amber dress and big white chest bow, one rounded curled cat tail beside body.
- **mono**：White-haired moon fox spirit chibi girl, very tall white fox ears with dark inner ears, charcoal short kimono with white sash, one large white fluffy fox tail curling close beside body, tiny silver crescent on forehead.

生成原图只用于制作，不作为客户端资源发布；最终 64px 文件才进入 public，避免原始大图增加页面负担。
