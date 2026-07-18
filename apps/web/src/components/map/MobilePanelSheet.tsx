"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Drawer as DrawerPrimitive } from "vaul";

export type SheetSnap = number | string | null;

export const SHEET_PEEK = 0.22;
/** Full stops at 86dvh so the sheet's top edge stays clear of the site
 *  header instead of sliding under it. */
export const SHEET_FULL = 0.86;

const isFormField = (el: EventTarget | null): el is HTMLElement =>
  el instanceof HTMLElement &&
  (el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT" ||
    el.isContentEditable);

/**
 * Persistent bottom sheet for the mobile map — the Google Maps pattern.
 * Non-modal (the map behind stays interactive), non-dismissible, two
 * snap points: peek (header visible) and full (scrollable panel). Drag
 * the handle or swipe the sheet to move between them.
 *
 * While a form field OUTSIDE the sheet has focus, the sheet hides
 * itself: the on-screen keyboard scrolls the focused input into the
 * lower half of the screen — exactly where the fixed sheet sits — which
 * would otherwise cover the field and steal its taps.
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
  const contentRef = useRef<HTMLDivElement>(null);
  const [suppressed, setSuppressed] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    // hide whenever the user is typing in a field OUTSIDE the sheet —
    // evaluated from the live activeElement so it also catches focus that
    // happened before mount, and re-checked when the on-screen keyboard
    // resizes the visual viewport
    const evaluate = () => {
      const active = document.activeElement;
      const typingOutside =
        isFormField(active) && !contentRef.current?.contains(active);
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

  return (
    <DrawerPrimitive.Root
      open
      modal={false}
      dismissible={false}
      snapPoints={[SHEET_PEEK, SHEET_FULL]}
      activeSnapPoint={snap}
      setActiveSnapPoint={onSnapChange}
    >
      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Content
          ref={contentRef}
          className="glass fixed inset-x-0 bottom-0 z-40 flex flex-col rounded-t-[18px] shadow-[0_-6px_20px_rgba(0,0,0,0.3)] outline-none"
          // Full viewport height: vaul's fraction snap points translate the
          // sheet by (1 - fraction) * viewport, so visible height only equals
          // fraction * viewport when the content itself is 100dvh tall.
          // Suppression is inline so nothing can out-specificity it.
          style={{
            height: "100dvh",
            ...(suppressed
              ? { visibility: "hidden" as const, pointerEvents: "none" as const }
              : {}),
          }}
        >
          <DrawerPrimitive.Title className="sr-only">
            {title}
          </DrawerPrimitive.Title>
          <DrawerPrimitive.Description className="sr-only">
            {title}
          </DrawerPrimitive.Description>
          {/* Drag handle — tap toggles peek/full */}
          <button
            type="button"
            onClick={() =>
              onSnapChange(snap === SHEET_FULL ? SHEET_PEEK : SHEET_FULL)
            }
            aria-label={title}
            className="flex w-full shrink-0 cursor-grab justify-center pb-1.5 pt-2.5"
          >
            <span className="h-1.5 w-12 rounded-full bg-[var(--glass-border)]" />
          </button>
          {/* pb offsets the (1 - SHEET_FULL) slice that sits below the fold */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[16dvh]">
            {children}
          </div>
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    </DrawerPrimitive.Root>
  );
}
