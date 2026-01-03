// by 拜甘教成员-大长老
import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "血染钟楼辅助工具",
  description: "血染钟楼桌游辅助工具 - 帮助您更好地进行游戏",
};

// 按 Next.js 新规范单独导出 viewport，避免 metadata 中的 viewport 警告
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
