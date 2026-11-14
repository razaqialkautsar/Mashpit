"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * Native <dialog>: focus trap, Esc and the backdrop come from the browser.
 * Sits as a bottom sheet on phones and a centred card from sm up.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      aria-label={title}
      className="m-0 mt-auto w-full max-w-none rounded-t-[24px] border border-b-0 border-line-strong bg-surface p-0 text-ink backdrop:bg-bg/75 backdrop:backdrop-blur-sm sm:m-auto sm:max-w-[420px] sm:rounded-[24px] sm:border-b"
    >
      <div className="max-h-[calc(100dvh-48px)] overflow-y-auto p-6 pb-[max(24px,env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-[22px] leading-none">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-full text-ink-2 hover:bg-surface-3 hover:text-ink">
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </dialog>
  );
}
