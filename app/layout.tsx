// by 拜甘教成员-大长老
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { NativeDialogShim } from "@/src/components/NativeDialogShim";
import { GameProvider } from "@/src/contexts/GameContext";
import { ThemeProvider } from "@/src/contexts/ThemeContext";
import { AudioProvider } from "@/src/hooks/useAudio";

export const metadata: Metadata = {
  title: "血染钟楼辅助工具",
  description: "血染钟楼桌游辅助工具 - 帮助您更好地进行游戏",
  icons: {
    icon: "/favicon.ico",
  },
};

// 按 Next.js 新规范单独导出 viewport，避免 metadata 中的 viewport 警告
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        {/* 主题预热：在首帧之前把上次选择的主题类挂到 <html>，避免亮/暗主题闪切。
            默认经典；仅当 localStorage 明确存过 "modern" 时才挂现代。
            与 src/contexts/ThemeContext.tsx 的 THEME_STORAGE_KEY 保持一致。 */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("clocktower_theme");document.documentElement.classList.add(t==="modern"?"theme-modern":"theme-classic");}catch(e){document.documentElement.classList.add("theme-classic");}})();`,
          }}
        />
      </head>
      <body className="antialiased">
        <ThemeProvider>
          <AudioProvider>
            <GameProvider>
              <NativeDialogShim />
              {children}
            </GameProvider>
          </AudioProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
