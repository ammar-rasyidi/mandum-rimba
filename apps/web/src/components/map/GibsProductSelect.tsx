"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { gibsProductStart, type GibsProduct } from "@/lib/gibs";

const Chevron = ({ open }: { open: boolean }) => (
  <svg
    width="11"
    height="11"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden
    className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
  >
    <path
      d="M6 9l6 6 6-6"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * Picker for a NASA Worldview / GIBS product.
 *
 * A native <select> can only render one line of plain text per option, which
 * forced the exact GIBS layer name (the thing that makes the layer verifiable
 * against Worldview) to sit truncated in a 308 px panel, with the platform and
 * archive span pushed outside the control entirely. This shows both lines per
 * option and marks the current one.
 *
 * The list expands INLINE rather than as an absolutely-positioned popup: this
 * control lives inside the layer panel's scroll container (and, on phones, the
 * bottom sheet), where an absolute dropdown would be clipped by the overflow.
 */
export default function GibsProductSelect({
  products,
  value,
  onChange,
}: {
  products: GibsProduct[];
  value: string;
  onChange: (productId: string) => void;
}) {
  const t = useTranslations("map");
  const [open, setOpen] = useState(false);
  // which option the keyboard is on; -1 until the list is opened from the key
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = products.find((p) => p.id === value) ?? products[0];

  // click anywhere outside closes, matching PlaceSearch / SpeciesSearch
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const pick = (id: string) => {
    onChange(id);
    setOpen(false);
    setActive(-1);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const cur = active >= 0 ? active : products.indexOf(selected);
    switch (e.key) {
      case "ArrowDown":
      case "ArrowUp": {
        e.preventDefault();
        if (!open) {
          setOpen(true);
          setActive(cur);
          return;
        }
        const next = e.key === "ArrowDown" ? cur + 1 : cur - 1;
        setActive((next + products.length) % products.length);
        return;
      }
      case "Home":
      case "End":
        if (!open) return;
        e.preventDefault();
        setActive(e.key === "Home" ? 0 : products.length - 1);
        return;
      case "Enter":
      case " ":
        e.preventDefault();
        if (!open) setOpen(true);
        else pick(products[cur].id);
        return;
      case "Escape":
        if (!open) return;
        e.preventDefault();
        setOpen(false);
        setActive(-1);
        return;
      case "Tab":
        setOpen(false);
        return;
    }
  };

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={
          open && active >= 0 ? `${listId}-${active}` : undefined
        }
        aria-label={t("karhutlaProduct")}
        title={selected.id}
        onClick={() => {
          setOpen((o) => !o);
          setActive(-1);
        }}
        onKeyDown={onKeyDown}
        className="flex w-full cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--glass-border)] bg-[var(--glass-highlight)] px-[0.45rem] py-[0.3rem] text-left transition-colors hover:border-[var(--text-dim)] focus:border-accent focus:outline-none"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono text-[0.68rem] text-foreground">
            {selected.id}
          </span>
          <span className="block truncate text-[0.66rem] text-muted">
            {selected.platform} ·{" "}
            {t("karhutlaArchive", { start: gibsProductStart(selected.id) })}
          </span>
        </span>
        <Chevron open={open} />
      </button>

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={t("karhutlaProduct")}
          className="mt-1 max-h-[240px] list-none overflow-y-auto rounded-lg border border-[var(--glass-border)] bg-[var(--overlay)] p-1 [scrollbar-width:thin]"
        >
          {products.map((prod, i) => {
            const isSelected = prod.id === value;
            return (
              <li key={prod.id}>
                <button
                  type="button"
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => pick(prod.id)}
                  onMouseEnter={() => setActive(i)}
                  className={`block w-full cursor-pointer appearance-none rounded-md border-0 px-2 py-1.5 text-left transition-colors ${
                    i === active
                      ? "bg-[var(--accent-dim)]"
                      : "bg-transparent"
                  }`}
                >
                  {/* the tick sits in its own gutter: inlined into the name it
                      would wrap onto a line of its own, the identifiers being
                      long enough to break */}
                  <span className="flex gap-1">
                    <span
                      aria-hidden
                      className="w-[0.6rem] shrink-0 text-[0.68rem] leading-snug text-accent"
                    >
                      {isSelected ? "✓" : ""}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block font-mono text-[0.68rem] leading-snug [overflow-wrap:anywhere] ${
                          isSelected ? "text-accent" : "text-foreground"
                        }`}
                      >
                        {prod.id}
                      </span>
                      <span className="mt-px block text-[0.66rem] leading-snug text-muted">
                        {prod.platform} ·{" "}
                        {t("karhutlaArchive", { start: prod.start })}
                      </span>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
