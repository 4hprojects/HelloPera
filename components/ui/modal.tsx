'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

/**
 * A trigger button plus a native <dialog>.
 *
 * showModal() gives focus trapping, Escape-to-close and an inert page behind
 * it for free. The body is only mounted while open, so every open starts from
 * the entry's current values and a clean form state — no stale errors from the
 * last attempt, no draft surviving a cancel.
 */
export function EditModal({
  triggerLabel,
  title,
  description,
  children,
}: {
  triggerLabel: string;
  title: string;
  description?: string;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const close = () => setOpen(false);

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        {triggerLabel}
      </Button>
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        onClose={close}
        onClick={(e) => {
          // A click on the backdrop lands on the <dialog> element itself.
          if (e.target === ref.current) close();
        }}
        className="m-auto max-h-[90dvh] w-[min(32rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-border bg-surface p-0 text-text shadow-xl backdrop:bg-black/50"
      >
        {open ? (
          <div className="p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 id={titleId} className="hp-h2">
                  {title}
                </h2>
                {description ? (
                  <p className="hp-small mt-1 text-text-muted">{description}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="-mr-2 -mt-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-xl text-text-muted hover:bg-tint-ink"
              >
                ×
              </button>
            </div>
            {children(close)}
          </div>
        ) : null}
      </dialog>
    </>
  );
}

/** Closes the modal once an action reports success. */
export function useCloseOnSuccess(success: string | undefined, close: () => void) {
  useEffect(() => {
    if (success) close();
    // `close` is a fresh closure each render; only the success edge matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [success]);
}
