"use client";

import { useEffect, useState } from "react";

// Registers the service worker and shows a small banner while offline.
export default function Pwa() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!offline) return null;
  return (
    <div className="offline-bar">
      📴 מצב לא מקוון — אפשר לצפות בשירים ובמילים. הוספה ועריכה דורשות חיבור.
    </div>
  );
}
