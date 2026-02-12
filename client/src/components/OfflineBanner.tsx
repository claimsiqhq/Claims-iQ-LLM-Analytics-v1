import React, { useState, useEffect } from "react";

export const OfflineBanner: React.FC = () => {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div
      className="fixed top-14 left-0 right-0 z-[100] bg-amber-500 text-amber-950 py-2 px-4 text-center text-sm font-medium"
      role="alert"
    >
      You're offline. Some features may not work until you're back online.
    </div>
  );
};
