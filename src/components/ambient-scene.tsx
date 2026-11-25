"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { AmbientSymbol } from "@/components/ambient-symbol";
import { ambientIntensityPresets, type AmbientIntensity, type AmbientStyle } from "@/lib/ambient-presets";

// 固定分布避免水合闪动；仅生成当前强度需要的装饰，手机再减半。
const particles = Array.from({ length: 32 }, (_, index) => ({
  index,
  left: (index * 37 + 7) % 100,
  delay: -(index * 2.7),
  drift: (index % 2 ? -1 : 1) * (45 + index % 5 * 20),
  // 近景只使用少量粒子，其余分到远景和中景；总数仍由后台强度控制。
  depth: [3, 11, 24].includes(index) ? "near" : index % 3 === 0 ? "far" : "middle",
}));
const depthLayers = ["far", "middle", "near"] as const;

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
  const visibleParticles = particles.slice(0, density.desktop);
  return <div key={style} className="ambient-scene" aria-hidden="true" data-ambient-effect={style} data-paused={paused || hidden}>
    {depthLayers.map((depth) => (
      <span key={depth} className="ambient-depth-layer" data-depth={depth}>
        {visibleParticles.filter((particle) => particle.depth === depth).map(({ index, left, delay: petalDelay, drift }) => {
          const size = profile.size + index % 4 * profile.sizeStep;
          const duration = profile.duration + index % 5 * 1.8;
          // 错开起始位置，让飘落物从首屏就开始出现。
          const delay = style === "petals" ? petalDelay : -duration * ((index * 53 + 19) % 97) / 97;
          const nearFromRight = index === 11;
          return <span key={index} className="ambient-particle" data-mobile-hidden={index >= density.mobile} data-tone={index % 3} style={{
            left: `var(--ambient-layer-left, ${left}%)`,
            width: `var(--ambient-layer-size, ${size}px)`,
            height: `var(--ambient-layer-size, ${size}px)`,
            "--ambient-size": `${size}px`,
            // 近景沿屏幕边缘飘落，尽量远离正文。
            "--ambient-near-left": nearFromRight ? "94%" : "3%",
            "--ambient-near-drift": nearFromRight ? "65px" : "-65px",
            "--ambient-duration": `${duration}s`,
            "--ambient-delay": `${delay}s`,
            "--ambient-drift": `${drift * profile.drift}px`,
          } as CSSProperties}>
            <AmbientSymbol style={style} />
          </span>;
        })}
      </span>
    ))}
  </div>;
}
