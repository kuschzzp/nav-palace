# 默认管理员头像生成记录

- 生成日期：2026-11-01。
- 方式：内置 `image_gen`（builtin），一次生成，仅一张；没有调用 CLI/API fallback。
- 来源：按本项目要求生成的原创动漫视觉，无参考图、无指定动漫 IP、未下载第三方人物素材。
- 客户端资源：`public/images/admin-avatar.webp`，256×256，RGB，8,536 字节（约 8.3KiB），WebP quality 82。
- 原始 PNG：`docs/design/admin-avatar-source.png`，1254×1254，RGB；保留原始生成文件，未加入客户端 public 目录。
- 内置工具原始位置：`/Users/kusch/.codex/generated_images/01a1930b-7cb4-7793-8bb9-b6ce00b89b25/exec-1ddabe77-15b7-4a26-b9fa-e5417320268f.png`。项目运行不依赖该路径。
- 检视：已分别通过 view_image 检查原图与 256px WebP；为正面肩部以上人物，头发完整、深色短发、海蓝灰外衣、浅海蓝樱花背景、友好自然表情，无文字/水印/边框，适合圆形头像裁切。
- 后处理仅为 Sharp 等比缩至 256×256 并转换 WebP，没有改变人物或重绘内容；未创建临时目录、启动服务或浏览器。

## 最终完整提示词

```text
Use case: stylized-concept.
Asset type: default administrator avatar for an elegant anime-inspired personal website.
Primary request: One original anime portrait, youthful adult person with a neutral to mildly masculine appearance, short dark charcoal hair, friendly natural small smile, calm expressive eyes. Wearing a simple sea-blue gray outer jacket over a light shirt.
Scene/backdrop: soft pale sea-blue background with only a few very subtle blush cherry-blossom-colored accents, quiet and uncluttered.
Style/medium: clean polished anime illustration, refined line art, soft cel shading, tasteful restrained colors.
Composition/framing: square composition; centered front-facing head and shoulders, shoulders visible, complete hair with generous safe margin above and on both sides so a circular avatar crop never clips the hair. Face remains clearly readable at small sizes.
Lighting/mood: gentle daylight, approachable and natural.
Constraints: a single adult character, no recognizable existing IP or franchise character, no text, no letters, no watermark, no border, no frame, no multiple variants, no extra people.
```
