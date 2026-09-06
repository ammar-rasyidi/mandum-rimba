"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export type SheetSnap = number | string | null;

export const SHEET_PEEK = 0.22;
export const SHEET_FULL = 0.86;

/** Full height stops at 86dvh so the top edge stays clear of the site header. */
const FULL_DVH = 86;

/**
 * How much of the sheet shows at peek — a FIXED height, not a fraction of the
 * viewport.
 *
 * What has to be visible is the drag handle and the title row, and that is
 * fixed content: 114px measured, on a 844px screen and on a 667px one alike.
 * Expressing it as 22dvh gave 186px on the tall phone (72px of it wasted map)
 * and 147px on the short one — most generous exactly where the screen could
 * least afford it. A fixed height gives every phone the same small peek and
 * hands the difference back to the map.
 *
 * Exported because the floating timelines sit just above it. That offset used
 * to be written out as "22dvh" in two other files, which would have quietly
 * detached from the sheet the moment this changed.
 */
export const SHEET_PEEK_PX = 105;

const isFormField = (el: EventTarget | null): el is HTMLElement =>
  el instanceof HTMLElement &&
  (el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT" ||
    el.isContentEditable);

/**
 * Persistent bottom sheet for the mobile map — the Google Maps pattern,
 * hand-rolled (no drawer library: global drag listeners are what broke
 * page inputs on iOS in the sibling project).
 *
 * - Dragging happens ONLY via the handle (pointer capture, no document
 *   listeners), so nothing else on the page is ever intercepted.
 * - At peek the body is tap-transparent: anything behind it stays
 *   tappable; only the handle is interactive.
 * - While a form field outside the sheet has focus (keyboard up), the
 *   sheet hides and returns on blur. Fields INSIDE the sheet (species /
 *   place search) don't trigger this.
 */
export default function MobilePanelSheet({
  snap,
  onSnapChange,
  title,
  children,
}: {
  snap: SheetSnap;
  onSnapChange: (snap: SheetSnap) => void;
  title: string;
  children: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [suppressed, setSuppressed] = useState(false);

  // live drag: offset from fully-open, in px (null = resting at a snap)
  const [dragOffset, setDragOffset] = useState<number | null>(null);
  const drag = useRef({ pointerId: 0, startY: 0, startOffset: 0, moved: false });

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const evaluate = () => {
      const active = document.activeElement;
      const typingOutside =
        isFormField(active) && !rootRef.current?.contains(active);
      if (typingOutside) {
        clearTimeout(timer);
        setSuppressed(true);
      } else {
        // small delay so hopping between fields doesn't flash the sheet
        timer = setTimeout(() => setSuppressed(false), 250);
      }
    };
    const vv = window.visualViewport;
    document.addEventListener("focusin", evaluate);
    document.addEventListener("focusout", evaluate);
    vv?.addEventListener("resize", evaluate);
    evaluate();
    return () => {
      document.removeEventListener("focusin", evaluate);
      document.removeEventListener("focusout", evaluate);
      vv?.removeEventListener("resize", evaluate);
      clearTimeout(timer);
    };
  }, []);

  const full = snap === SHEET_FULL;
  /** translateY between fully open (0) and peek, in px. */
  const maxOffset = () =>
    (FULL_DVH / 100) * window.innerHeight - SHEET_PEEK_PX;

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      pointerId: e.pointerId,
      startY: e.clientY,
      startOffset: full ? 0 : maxOffset(),
      moved: false,
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const dy = e.clientY - drag.current.startY;
    if (Math.abs(dy) > 6) drag.current.moved = true;
    const next = Math.min(
      Math.max(drag.current.startOffset + dy, 0),
      maxOffset(),
    );
    setDragOffset(next);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    const wasTap = !drag.current.moved;
    const settled = dragOffset;
    setDragOffset(null);
    if (wasTap) {
      onSnapChange(full ? SHEET_PEEK : SHEET_FULL);
    } else if (settled != null) {
      onSnapChange(settled < maxOffset() / 2 ? SHEET_FULL : SHEET_PEEK);
    }
  };

  const restingTransform = full
    ? "translateY(0)"
    : `translateY(calc(${FULL_DVH}dvh - ${SHEET_PEEK_PX}px))`;

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-label={title}
      className="glass fixed inset-x-0 bottom-0 z-40 flex flex-col rounded-t-[18px] shadow-[0_-6px_20px_rgba(0,0,0,0.3)]"
      // At PEEK the body is tap-transparent (pointer-events none): only
      // the handle below is interactive. While typing the sheet hides
      // entirely. Inline so nothing can out-specificity it.
      style={{
        height: `${FULL_DVH}dvh`,
        transform:
          dragOffset != null ? `translateY(${dragOffset}px)` : restingTransform,
        transition:
          dragOffset != null
            ? "none"
            : "transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)",
        ...(suppressed
          ? { visibility: "hidden" as const, pointerEvents: "none" as const }
          : !full
            ? { pointerEvents: "none" as const }
            : {}),
      }}
    >
      {/* Drag handle — drag to move, tap to toggle peek/full */}
      <button
        type="button"
        aria-label={title}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="flex w-full shrink-0 cursor-grab justify-center rounded-t-[18px] bg-[var(--overlay)] pb-1 pt-2.5 active:cursor-grabbing"
        style={{ pointerEvents: "auto", touchAction: "none" }}
      >
        <span className="h-1.5 w-12 rounded-full bg-[var(--glass-border)]" />
      </button>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {children}
      </div>
    </div>
  );
}
