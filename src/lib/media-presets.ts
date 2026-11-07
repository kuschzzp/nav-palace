export type ImagePreset = { label: string; image: string };

// 水墨封面为独立插画，新增网站可直接复用，不与首页排版或站点数量绑定。
export const coverPresets: ImagePreset[] = [
  { label: "文墨手记", image: "/images/ink/writing.webp" },
  { label: "银杏一签", image: "/images/ink/choice.webp" },
  { label: "尺素来信", image: "/images/ink/mail.webp" },
  { label: "书山问学", image: "/images/ink/knowledge.webp" },
  { label: "百工器物", image: "/images/ink/tools.webp" },
  { label: "山水行旅", image: "/images/ink/landscape.webp" },
  { label: "清茶闲叙", image: "/images/ink/tea.webp" },
  { label: "云帆远航", image: "/images/ink/sailing.webp" },
  { label: "星河观象", image: "/images/ink/astronomy.webp" },
  { label: "竹影听雨", image: "/images/ink/rain.webp" },
  // 备用封面只扩充图库，已保存网站的图片地址保持独立配置。
  { label: "琴声雅集", image: "/images/ink/guqin.webp" },
  { label: "纹枰对弈", image: "/images/ink/go.webp" },
  { label: "锦鲤游墨", image: "/images/ink/koi.webp" },
  { label: "鹤舞云间", image: "/images/ink/crane.webp" },
  { label: "荷风清韵", image: "/images/ink/lotus.webp" },
  { label: "炉香静思", image: "/images/ink/incense.webp" },
  { label: "灯火长明", image: "/images/ink/lantern.webp" },
  { label: "镜里拾光", image: "/images/ink/camera.webp" },
  { label: "秋叶藏诗", image: "/images/ink/maple.webp" },
  { label: "云梦小筑", image: "/images/ink/pavilion.webp" },
];

// 空地址保留默认山形；新增 Logo 只提供候选素材，不覆盖用户已保存的标志。
export const logoPresets: ImagePreset[] = [
  { label: "默认山形标志", image: "" },
  { label: "山月入印", image: "/images/logos/mountain-moon.webp" },
  { label: "松风有信", image: "/images/logos/pine.webp" },
  { label: "竹影清韵", image: "/images/logos/bamboo.webp" },
  { label: "云鹤舒翼", image: "/images/logos/crane.webp" },
  { label: "莲心一瓣", image: "/images/logos/lotus.webp" },
  { label: "游鱼知乐", image: "/images/logos/koi.webp" },
  { label: "云帆向远", image: "/images/logos/sail.webp" },
  { label: "清风折扇", image: "/images/logos/fan.webp" },
  { label: "一盏闲茶", image: "/images/logos/tea.webp" },
  { label: "云起有时", image: "/images/logos/cloud.webp" },
];
