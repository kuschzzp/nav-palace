"use client";

import { Airplane, Article, BookOpen, Brain, CalendarBlank, Camera, ChatCircle, CheckSquare, Cloud, Code, Coffee, Compass, Cube, Database, EnvelopeSimple, FilmSlate, Flower, FolderOpen, GameController, GithubLogo, GlobeHemisphereWest, Headphones, Heart, House, ImageSquare, Leaf, Lightbulb, Link, MapPin, Microphone, Monitor, Moon, Mountains, MusicNotes, Notebook, Palette, PenNib, Planet, Robot, RocketLaunch, ShoppingBag, Sparkle, Star, Sun, TerminalWindow, Toolbox, VideoCamera, Wrench, type Icon, type IconProps } from "@phosphor-icons/react";
import type { SiteIconName } from "@/lib/site-icons";

// 前后台共用映射，类型约束确保图标目录中的每个标识都有对应组件。
const icons: Record<SiteIconName, Icon> = {
  leaf: Leaf, bulb: Lightbulb, camera: Camera, globe: GlobeHemisphereWest, code: Code, book: BookOpen,
  article: Article, notebook: Notebook, pen: PenNib, palette: Palette, image: ImageSquare, music: MusicNotes,
  video: VideoCamera, microphone: Microphone, film: FilmSlate, game: GameController, headphones: Headphones,
  chat: ChatCircle, mail: EnvelopeSimple, calendar: CalendarBlank, tasks: CheckSquare, folder: FolderOpen,
  cloud: Cloud, database: Database, terminal: TerminalWindow, github: GithubLogo, robot: Robot, brain: Brain,
  link: Link, monitor: Monitor, toolbox: Toolbox, wrench: Wrench, house: House, heart: Heart, star: Star,
  sparkle: Sparkle, sun: Sun, moon: Moon, flower: Flower, cube: Cube, planet: Planet, mountains: Mountains,
  map: MapPin, compass: Compass, airplane: Airplane, shopping: ShoppingBag, coffee: Coffee, rocket: RocketLaunch,
};

export function SiteIcon({ name, size = 24, weight = "light", ...props }: Omit<IconProps, "name"> & { name: string }) {
  // 兼容旧配置中的未知图标；只查自身属性，避免将原型链属性误当作图标。
  const IconComponent = Object.hasOwn(icons, name) ? icons[name as SiteIconName] : GlobeHemisphereWest;
  return <IconComponent size={size} weight={weight} {...props} />;
}
