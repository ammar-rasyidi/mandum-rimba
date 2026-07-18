"use client";

import { useEffect, useState } from "react";

/** Matches the map UI's `max-[720px]` phone styles. Starts false
 *  (SSR-safe) and settles after mount. */
const BREAKPOINT = 720;

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${BREAKPOINT}px)`);
    const onChange = () => setIsMobile(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
