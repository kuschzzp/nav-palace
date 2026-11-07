"use client";

import Link from "next/link";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="error-page"><p>稍作停留</p><h1>这里暂时遇到了一点小问题。</h1><p>请稍后重试，或检查服务器配置。</p><div><button type="button" onClick={reset}>重新加载</button><Link href="/">回到首页</Link></div></main>;
}
