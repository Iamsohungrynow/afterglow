"use client";

import { useEffect, useState } from "react";

/** Unix seconds, ticking once per second. Starts undefined to avoid SSR/client mismatch. */
export function useNow() {
  const [now, setNow] = useState<number>();
  useEffect(() => {
    const tick = () => setNow(Math.floor(Date.now() / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}
