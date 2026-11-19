"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // PWA bersifat opsional; kegagalan pendaftaran tidak memengaruhi aplikasi.
    });
  }, []);
  return null;
}
