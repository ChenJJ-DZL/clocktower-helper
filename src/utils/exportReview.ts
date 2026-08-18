/**
 * 复盘长图导出工具
 *
 * 使用 html2canvas 将对局复盘内容捕获为 PNG 图片并下载。
 * 处理 Retina 高分屏清晰度（scale: 2）和跨域图片容错。
 */
import type { Seat, LogEntry, WinResult } from "../../app/data";

export interface ExportReviewOptions {
  /** 要捕获的 DOM 元素 */
  targetElement: HTMLElement;
  /** 剧本名称 */
  scriptName?: string;
  /** 胜利结果 */
  winResult?: WinResult;
  /** 缩放比例（Retina 用 2） */
  scale?: number;
}

/**
 * 导出复盘长图为 PNG
 */
export async function exportReviewAsImage(
  options: ExportReviewOptions
): Promise<void> {
  const { targetElement, scriptName, winResult, scale = 2 } = options;

  // 动态导入 html2canvas（避免 SSR 问题）
  const html2canvas = (await import("html2canvas")).default;

  try {
    const canvas = await html2canvas(targetElement, {
      scale,
      backgroundColor: "#0f172a", // slate-900
      useCORS: true,
      allowTaint: true,
      logging: false,
      windowWidth: targetElement.scrollWidth,
      windowHeight: targetElement.scrollHeight,
    });

    // 添加水印和时间戳
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const timestamp = new Date().toLocaleString("zh-CN");
      const watermark = `血染钟楼说书人 · ${timestamp}`;
      ctx.save();
      ctx.font = `${14 * scale}px sans-serif`;
      ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
      ctx.textAlign = "right";
      ctx.fillText(watermark, canvas.width - 20 * scale, canvas.height - 15 * scale);
      ctx.restore();
    }

    // 下载
    const link = document.createElement("a");
    const resultTag = winResult === "good" ? "善良胜" : winResult === "evil" ? "邪恶胜" : "";
    const filename = `复盘_${scriptName || "对局"}_${resultTag}_${new Date().toISOString().slice(0, 10)}.png`;
    link.download = filename;
    link.href = canvas.toDataURL("image/png");
    link.click();
  } catch (error) {
    console.error("[ExportReview] 导出失败:", error);
    throw error;
  }
}
