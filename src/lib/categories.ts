// 分类只用固定调色板；用户输入作为文字显示，不拼接为 CSS 或样式值。
export function categoryKey(category: string): string { return category.trim(); }

export function categoryTone(category: string): string {
  const key = categoryKey(category);
  if (!key) return "neutral";
  let hash = 0;
  for (const letter of key) hash = (hash * 31 + letter.codePointAt(0)!) >>> 0;
  return ["blue", "rose", "green", "violet", "amber", "teal"][hash % 6];
}
