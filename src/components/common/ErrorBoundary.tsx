"use client";

import React, { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("🚨 [ErrorBoundary caught uncaught error]:", error, errorInfo);
    this.setState({ errorInfo });
    // 保存错误日志至 sessionStorage 方便移动端调试
    if (typeof window !== "undefined") {
      try {
        const errorLog = {
          message: error?.message || "Unknown error",
          stack: error?.stack || "",
          componentStack: errorInfo?.componentStack || "",
          timestamp: new Date().toISOString(),
          url: window.location.href,
        };
        sessionStorage.setItem("last_app_error", JSON.stringify(errorLog));
      } catch {}
    }
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    } else if (typeof window !== "undefined") {
      // 默认安全恢复：回到剧本选择页
      try {
        window.location.reload();
      } catch {}
    }
  };

  private handleCopyError = () => {
    if (typeof window === "undefined" || !navigator.clipboard) return;
    const errorDetails = `Error: ${this.state.error?.message}\nStack: ${this.state.error?.stack}\nComponent: ${this.state.errorInfo?.componentStack}`;
    navigator.clipboard.writeText(errorDetails).then(
      () => alert("错误信息已复制到剪贴板"),
      () => alert("复制失败，请截图保存")
    );
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full min-h-[300px] flex items-center justify-center p-6 bg-slate-950 text-slate-100">
          <div className="max-w-md w-full bg-slate-900/95 border border-red-500/50 rounded-2xl p-6 shadow-2xl backdrop-blur-md flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center text-3xl mb-4 animate-pulse">
              ⚠️
            </div>

            <h2 className="text-xl font-bold text-red-400 mb-2">
              {this.props.fallbackTitle || "界面渲染遇到问题"}
            </h2>

            <p className="text-sm text-slate-300 mb-4 leading-relaxed">
              为了避免画面彻底白屏，已自动拦截此异常。你可以尝试一键恢复或刷新页面。
            </p>

            {this.state.error && (
              <div className="w-full text-left bg-black/60 border border-red-900/40 rounded-lg p-3 mb-5 overflow-hidden text-xs font-mono text-red-300/90 max-h-32 overflow-y-auto">
                <div className="font-bold text-red-200">
                  {this.state.error.name}: {this.state.error.message}
                </div>
                {this.state.error.stack && (
                  <div className="text-slate-500 text-[10px] mt-1 whitespace-pre-wrap">
                    {this.state.error.stack.split("\n").slice(0, 3).join("\n")}
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-row gap-3 w-full">
              <button
                type="button"
                onClick={this.handleReset}
                className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white font-bold text-sm shadow-lg transition-all active:scale-95"
              >
                🔄 一键恢复
              </button>
              <button
                type="button"
                onClick={this.handleCopyError}
                className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-semibold border border-slate-700 transition-all"
              >
                📋 复制报错
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
