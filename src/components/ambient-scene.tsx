"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { AmbientSymbol } from "@/components/ambient-symbol";
import { ambientIntensityPresets, type AmbientIntensity, type AmbientStyle } from "@/lib/ambient-presets";

// 固定分布避免水合闪动；仅生成当前强度需要的装饰，手机再减半。
const particles = Array.from({ length: 32 }, (_, index) => ({
  left: (index * 37 + 7) % 100,
  delay: -(index * 2.7),
  drift: (index % 2 ? -1 : 1) * (45 + index % 5 * 20),
}));

const particleProfiles = {
  petals: { size: 9, sizeStep: 3, duration: 24, drift: 1 },
  "golden-leaves": { size: 21, sizeStep: 3, duration: 12, drift: 1.4 },
  "paper-snow": { size: 15, sizeStep: 3, duration: 10, drift: .55 },
  "ink-feathers": { size: 20, sizeStep: 3, duration: 14, drift: 1.2 },
};

export function AmbientScene({ style, paused, intensity = "balanced" }: { style: AmbientStyle; paused: boolean; intensity?: AmbientIntensity }) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (style === "none") return;
    const update = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", update);
    update();
    return () => document.removeEventListener("visibilitychange", update);
  }, [style]);
  if (style === "none") return null;
  const density = ambientIntensityPresets.find((preset) => preset.value === intensity) || ambientIntensityPresets[1];
  const profile = particleProfiles[style];
  return <div key={style} className="ambient-scene" aria-hidden="true" data-ambient-effect={style} data-paused={paused || hidden}>
    {particles.slice(0, density.desktop).map((particle, index) => {
      const size = profile.size + index % 4 * profile.sizeStep;
      const duration = profile.duration + index % 5 * 1.8;
      // 错开首次出现的位置，打开首页时就能看到飘落物。
      const delay = style === "petals" ? particle.delay : -duration * ((index * 53 + 19) % 97) / 97;
      return <span key={index} className="ambient-particle" data-mobile-hidden={index >= density.mobile} style={{
        left: `${particle.left}%`, width: size, height: size,
        "--ambient-duration": `${duration}s`, "--ambient-delay": `${delay}s`, "--ambient-drift": `${particle.drift * profile.drift}px`,
      } as CSSProperties}>
        <AmbientSymbol style={style} />
      </span>;
    })}
  </div>;
}
