export const pointerStyleNames = ["system", "cinnabar-brush", "paper-kite", "plum-sprig"] as const;
export type PointerStyle = (typeof pointerStyleNames)[number];

export const pointerPresets = [
  { value: "system", label: "系统默认", description: "使用系统指针" },
  { value: "cinnabar-brush", label: "朱砂笔尖", description: "点落朱砂墨迹", image: "/cursors/cinnabar-brush.svg" },
  { value: "paper-kite", label: "折纸飞鸢", description: "撒开金白纸屑", image: "/cursors/paper-kite.svg" },
  { value: "plum-sprig", label: "落梅花签", description: "抖落回旋花瓣", image: "/cursors/plum-sprig.svg" },
] as const;
