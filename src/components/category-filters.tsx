"use client";

import { categoryKey, categoryTone } from "@/lib/categories";
import type { Site } from "@/lib/types";
import "./category-filters.css";

export function CategoryBadge({ category, className = "" }: { category: string; className?: string }) {
  const key = categoryKey(category);
  return <span className={`category-badge ${className}`} data-tone={categoryTone(key)}>{key || "未分类"}</span>;
}

export function CategoryFilters({ sites, value, onChange, className = "" }: { sites: Site[]; value: string | null; onChange: (category: string | null) => void; className?: string }) {
  const categories = [...new Set(sites.map((site) => categoryKey(site.category)))];
  if (categories.length <= 1) return null;
  return <div className={`category-filters ${className}`} role="group" aria-label="按分类筛选">
    <button type="button" aria-pressed={value === null} onClick={() => onChange(null)} data-tone="neutral">全部<span>{sites.length}</span></button>
    {categories.map((category) => <button type="button" key={category} data-tone={categoryTone(category)} aria-pressed={value === category} onClick={() => onChange(category)}>{category || "未分类"}<span>{sites.filter((site) => categoryKey(site.category) === category).length}</span></button>)}
  </div>;
}
