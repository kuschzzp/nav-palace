import Link from "next/link";

export default function NotFound() {
  return <main className="error-page"><p>404</p><h1>这个入口，暂时没有抵达的地方。</h1><Link href="/">回到首页</Link></main>;
}
