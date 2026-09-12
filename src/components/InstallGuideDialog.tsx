"use client";

import { useRef, type ReactNode } from "react";

/**
 * "How to install" button + popup. Once an app's snippet has reported its
 * first event the attribution page no longer needs the installation guide
 * inline, so it moves behind this button. The guide itself is rendered on the
 * server and passed in as children; this only owns open/close.
 */
export function InstallGuideDialog({ children, label = "How to install" }: { children: ReactNode; label?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className="btn btn-secondary" onClick={() => ref.current?.showModal()}>
        {label}
      </button>
      <dialog
        ref={ref}
        aria-label="How to install the snippet"
        className="card m-auto w-[calc(100%-2rem)] max-w-3xl p-0 backdrop:bg-black/40"
        onClick={(e) => {
          // A click on the backdrop lands on the <dialog> itself, not its content.
          if (e.target === ref.current) ref.current?.close();
        }}
      >
        <div className="flex items-center justify-between border-b border-stone-200 px-6 py-4">
          <h2 className="font-semibold">{label}</h2>
          <button type="button" className="btn btn-secondary" onClick={() => ref.current?.close()} aria-label="Close">
            Close
          </button>
        </div>
        <div className="max-h-[75vh] space-y-6 overflow-y-auto p-6">{children}</div>
      </dialog>
    </>
  );
}
