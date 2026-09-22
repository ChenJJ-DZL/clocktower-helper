"use client";

import { useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import { GenericAlertModal } from "../components/modals/GenericAlertModal";
import { GenericConfirmModal } from "../components/modals/GenericConfirmModal";

type DialogState =
  | { kind: "alert"; title?: string; message: string }
  | {
      kind: "confirm";
      title?: string;
      message: string;
      confirmLabel?: string;
      cancelLabel?: string;
      onConfirm: () => void;
      onCancel?: () => void;
    }
  | null;

let hostRoot: Root | null = null;
let hostContainer: HTMLDivElement | null = null;
let installed = false;

/**
 * ⭐⭐ 2026-09-21 修复（P0）· 「第一次弹窗静默失效」
 * ------------------------------------------------------------------
 * 旧实现把弹窗状态存在 `DialogHost` 的 `useState` 里，并把 `setDialog`
 * **通过 `useEffect` 赋给模块级变量** `renderDialog`：
 *
 *   function ensureHost() {
 *     ...
 *     hostRoot.render(<DialogHost />);   // React 18 异步调度
 *   }
 *   export function showConfirm(o) {
 *     ensureHost();       // ⚠️ 只是「安排」一次渲染
 *     renderDialog(o);    // ⚠️ 此刻 renderDialog 仍是初始值 () => {} → 丢弃
 *   }
 *
 * ⇒ 页面生命周期内**第一次** `showAlert`/`showConfirm`（含被 shim 接管的
 *   `window.alert`）**必然丢消息**；第二次起才正常。
 *   表现形式统一为「点一次没反应，再点一次才有」——曾把洗脑师门禁卡死。
 *
 * 新实现改用**模块级 store + `useSyncExternalStore`**：
 *   ① `setDialog` 直接写模块级状态，**不再依赖任何 effect 时序**；
 *   ② `DialogHost` 首次挂载时读到的就是已写入的值（`getSnapshot`），
 *      因此**调用顺序（ensureHost 前后）完全不影响**。
 * ⚠️ `renderDialog` 这个「经 effect 中转」的间接层已彻底删除，禁止恢复。
 */
let dialogState: DialogState = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): DialogState {
  return dialogState;
}

/** SSR / 首帧占位：弹窗只在客户端可能非空 */
function getServerSnapshot(): DialogState {
  return null;
}

function setDialog(next: DialogState): void {
  dialogState = next;
  for (const listener of listeners) listener();
}

function DialogHost() {
  const dialog = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (!dialog) return null;

  if (dialog.kind === "alert") {
    return (
      <GenericAlertModal
        title={dialog.title}
        message={dialog.message}
        onClose={() => setDialog(null)}
      />
    );
  }

  return (
    <GenericConfirmModal
      title={dialog.title}
      message={dialog.message}
      confirmLabel={dialog.confirmLabel}
      cancelLabel={dialog.cancelLabel}
      onConfirm={() => {
        dialog.onConfirm();
        setDialog(null);
      }}
      onCancel={() => {
        dialog.onCancel?.();
        setDialog(null);
      }}
    />
  );
}

function ensureHost() {
  if (hostRoot && hostContainer?.isConnected) return;
  hostContainer = document.createElement("div");
  document.body.appendChild(hostContainer);
  hostRoot = createRoot(hostContainer);
  hostRoot.render(<DialogHost />);
}

export function showAlert(message: string, title?: string) {
  ensureHost();
  // ⭐ 直接落 store：mount 前调用也不会丢（DialogHost 挂载时即读到本值）
  setDialog({ kind: "alert", title, message });
}

export function showConfirm(options: {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel?: () => void;
}) {
  ensureHost();
  setDialog({ kind: "confirm", ...options });
}

export function installNativeDialogShim() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const originalAlert = window.alert;
  window.alert = (message?: unknown) => {
    showAlert(String(message ?? ""));
  };
  // 保留原始引用，便于未来按需恢复。
  (window as any).__ctOriginalAlert = originalAlert;
}
