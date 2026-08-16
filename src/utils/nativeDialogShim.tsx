"use client";

import { useEffect, useState } from "react";
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
let renderDialog: (state: DialogState) => void = () => {};
let installed = false;

function ensureHost() {
  if (hostRoot && hostContainer?.isConnected) return;
  hostContainer = document.createElement("div");
  document.body.appendChild(hostContainer);
  hostRoot = createRoot(hostContainer);
  hostRoot.render(<DialogHost />);
}

function DialogHost() {
  const [dialog, setDialog] = useState<DialogState>(null);

  useEffect(() => {
    renderDialog = setDialog;
    return () => {
      renderDialog = () => {};
    };
  }, []);

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

export function showAlert(message: string, title?: string) {
  ensureHost();
  renderDialog({ kind: "alert", title, message });
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
  renderDialog({ kind: "confirm", ...options });
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
