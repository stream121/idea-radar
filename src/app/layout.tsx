import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "灵感雷达 · 产品人工作台",
  description:
    "从 Reddit 真实抱怨里自动识别产品机会，AI 生成方向建议，边刷边做调研。",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
