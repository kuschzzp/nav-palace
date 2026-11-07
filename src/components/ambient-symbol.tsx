import { Feather, Leaf, Snowflake } from "@phosphor-icons/react";
import { getImageSources } from "@/lib/image-sources";
import type { AmbientStyle } from "@/lib/ambient-presets";

// 首页和后台复用同一套飘落物。新增图案沿用项目的矢量图标。
export function AmbientSymbol({ style }: { style: Exclude<AmbientStyle, "none"> }) {
  switch (style) {
    case "golden-leaves": return <Leaf className="ambient-symbol" weight="duotone" aria-hidden="true" />;
    case "paper-snow": return <Snowflake className="ambient-symbol" weight="bold" aria-hidden="true" />;
    case "ink-feathers": return <Feather className="ambient-symbol" weight="duotone" aria-hidden="true" />;
    case "petals": return (
      // eslint-disable-next-line @next/next/no-img-element
      <img className="ambient-symbol" src={getImageSources("/images/ink/petal.webp").src} alt="" width={24} height={24} />
    );
  }
}
