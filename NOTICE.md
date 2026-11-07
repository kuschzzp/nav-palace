# 来源与许可说明

Nav Palace 的项目代码按仓库中的 [Apache License 2.0](LICENSE) 提供。

## 当前主题插画与字体

`public/images/ink/` 中的宣纸、朱砂松枝、梅枝山石、二十张独立水墨封面、印章头像及落英，通过内置 OpenAI 图像生成工具为本项目制作。原 PNG 与完整提示词保存在 `docs/design/ink-assets/`；运行时使用优化 WebP。它们不包含指定动漫角色、第三方品牌或真实管理员肖像。

`public/images/logos/` 中的十款独立水墨 Logo 通过内置 OpenAI 图像生成工具为本项目制作，原始 PNG 与完整提示词归档于 `docs/design/logo-assets/`。运行时为保留透明通道的 256×256 WebP，不包含文字或第三方品牌标志。

本地书法字体 Ma Shan Zheng 来自 Google Fonts 官方分发，按 SIL Open Font License 1.1 提供，完整许可为 `public/fonts/OFL-MaShanZheng.txt`。原始完整 WOFF2 留存，运行时按 Unicode 字符范围拆分为 `public/fonts/calligraphy/` 中的小文件，保留原字库完整字符覆盖及轮廓；原作者与上游来源见 https://github.com/googlefonts/mashanzheng 。Noto Sans SC / Noto Serif SC 由相应 Fontsource 包分发并保留其许可证。

`public/images/optimized/` 是上述项目插画的机械缩放及压缩派生图，不改变作品内容；清单与生成脚本分别位于 `src/lib/generated/image-assets.json` 和 `scripts/optimize-images.mjs`。

## 图标

Phosphor 图标部分遵循 MIT 许可，不由项目代码的 Apache-2.0 许可替代；在此保留完整文本：

```text
MIT License

Copyright (c) 2020 Phosphor Icons

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## 字体

本项目通过 Fontsource 自托管 Noto Sans SC Variable 和 Noto Serif SC Variable，不依赖运行时 Google Fonts 请求。这两款字体按 SIL Open Font License 1.1 提供；字体本身的权利与项目代码许可分别适用。

- [Noto Sans SC / Fontsource](https://fontsource.org/fonts/noto-sans-sc)
- [Noto Serif SC / Fontsource](https://fontsource.org/fonts/noto-serif-sc)
- [SIL Open Font License 1.1](https://openfontlicense.org/open-font-license-official-text/)

安装后可在对应 `@fontsource-variable/noto-sans-sc` 和 `@fontsource-variable/noto-serif-sc` 包中的 `LICENSE` 文件查看字体版权声明及完整许可。重新分发字体时，应保留其原始版权和许可文本。

下列版权与许可文本来自上述两个 Fontsource 包的 `LICENSE`，两者相同：

```text
Google Inc.

This Font Software is licensed under the SIL Open Font License, Version 1.1.
This license is copied below, and is also available with a FAQ at:
http://scripts.sil.org/OFL


-----------------------------------------------------------
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.
```

## 第三方代码

本项目导航卡片的三维翻转，以及标题和内容的入场节奏，参考 [React Bits Flip Card](https://www.reactbits.dev/micro/flip-card)、[Split Text](https://www.reactbits.dev/text-animations/split-text) 和 [Animated Content](https://www.reactbits.dev/animations/animated-content) 的交互思路。上述卡片和入场组件为本项目独立实现，未复制这些组件的 React Bits 源码。

Next.js、React、Tailwind CSS、Better Auth、Drizzle ORM、better-sqlite3、Radix UI、Phosphor Icons、Fontsource 及其他依赖按各自随包附带的许可证提供。直接和间接依赖的精确版本以 `package-lock.json` 为准，各包许可证不会被本项目的 Apache-2.0 许可替代。

SQLite 核心为公有领域软件；better-sqlite3 的封装代码遵循其自身许可。


## React Bits 动态效果

`src/components/effects/specular-buttons.tsx/.css` 根据 [Specular Button](https://www.reactbits.dev/components/specular-button) 的双瓣追光思路适配为朱砂按钮，使用共享管理器与 CSS；旧 Gradient Waves 和 Tech Text 实现已删除。保留以下上游许可，不由项目主体许可证替代。

React Bits 相关代码遵循其自身 MIT + Commons Clause 条款，不由项目的 Apache-2.0 替代；本项目作为网站应用集成使用。完整许可如下，来源：[React Bits LICENSE.md](https://github.com/DavidHDev/react-bits/blob/main/LICENSE.md)。

```text
MIT + Commons Clause License Condition v1.0

Copyright (c) 2026 David Haz

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, and distribute the Software **as part of an application, website, or product**, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

## Commons Clause Restriction

You may use this Software, including for any commercial purpose, **so long as you do not sell, sublicense, or redistribute the components themselves-whether alone, in a bundle, or as a ported version.**

The same restriction covers the React Bits tools (Background Studio, Texture Lab, Shape Magic, Center Stage, Sound Lab and any tools added later) and the sounds in the sound library. **You may not sell, sublicense, or redistribute the tools or the sounds themselves, or offer the tools or a substantially similar copy of them as a hosted service-whether alone, in a bundle, or as a ported version.**

What you make with the tools is yours to use. You can use exported code, images, videos, and audio files in any personal or commercial application, website, or product, including paid ones. **You may not sell or redistribute the exports on their own, either individually or as the product itself, such as a sound, texture, background, or template pack.**

## No Warranty

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
