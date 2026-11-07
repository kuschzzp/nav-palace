import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// 先合并条件类名，再解决 Tailwind 同类样式冲突，方便组件使用方覆盖默认样式。
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
