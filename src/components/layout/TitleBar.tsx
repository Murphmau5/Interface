import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, X } from "lucide-react";

const isTauriRuntime = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

function MaximizeGlyph({ restored }: { restored: boolean }) {
  if (restored) {
    return (
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden focusable="false">
        <rect x="0.5" y="2.5" width="7" height="7" fill="none" stroke="currentColor" />
        <path d="M2.5 2.5V0.5H9.5V7.5H7.5" fill="none" stroke="currentColor" />
      </svg>
    );
  }

  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden focusable="false">
      <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" />
    </svg>
  );
}

export function TitleBar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!isTauriRuntime) return;
    const appWindow = getCurrentWindow();
    let disposed = false;
    let stopListening: (() => void) | undefined;

    const sync = () => {
      void appWindow
        .isMaximized()
        .then((value) => {
          if (!disposed) setMaximized(value);
        })
        .catch(() => undefined);
    };

    sync();
    void appWindow
      .onResized(sync)
      .then((unlisten) => {
        if (disposed) unlisten();
        else stopListening = unlisten;
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      stopListening?.();
    };
  }, []);

  const minimize = () => {
    if (!isTauriRuntime) return;
    void getCurrentWindow().minimize().catch(() => undefined);
  };

  const toggleMaximize = () => {
    if (!isTauriRuntime) return;
    void getCurrentWindow()
      .toggleMaximize()
      .catch(() => undefined);
  };

  const close = () => {
    if (!isTauriRuntime) return;
    void getCurrentWindow().close().catch(() => undefined);
  };

  return (
    <header className="titlebar" data-tauri-drag-region="deep">
      <div className="titlebar-brand">
        <span className="titlebar-mark" aria-hidden />
        <span className="titlebar-title">界序 INTERFACE</span>
      </div>

      <div className="titlebar-actions">
        <button type="button" className="titlebar-button" aria-label="最小化" onClick={minimize}>
          <Minus size={14} strokeWidth={1.6} aria-hidden />
        </button>
        <button
          type="button"
          className="titlebar-button"
          aria-label={maximized ? "还原" : "最大化"}
          onClick={toggleMaximize}
        >
          <MaximizeGlyph restored={maximized} />
        </button>
        <button
          type="button"
          className="titlebar-button titlebar-button-close"
          aria-label="关闭"
          onClick={close}
        >
          <X size={14} strokeWidth={1.6} aria-hidden />
        </button>
      </div>
    </header>
  );
}
