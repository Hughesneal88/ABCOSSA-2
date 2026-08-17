import { useEffect, useState, useRef, useCallback } from "react";

interface UseSessionTimeoutOptions {
  /** Inactivity timeout in milliseconds (default: 15 minutes) */
  inactivityTimeoutMs?: number;
  /** Warning threshold before timeout in milliseconds (default: 1 minute) */
  warningThresholdMs?: number;
  /** Maximum hard session duration in milliseconds (default: 8 hours) */
  maxSessionLifetimeMs?: number;
  /** Callback triggered when session times out */
  onTimeout: () => void;
  /** Whether the user is currently authenticated */
  isAuthenticated: boolean;
}

export function useSessionTimeout({
  inactivityTimeoutMs = 15 * 60 * 1000, // 15 minutes
  warningThresholdMs = 60 * 1000,       // 1 minute warning
  maxSessionLifetimeMs = 8 * 60 * 60 * 1000, // 8 hours max
  onTimeout,
  isAuthenticated,
}: UseSessionTimeoutOptions) {
  const [showWarning, setShowWarning] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(Math.floor(inactivityTimeoutMs / 1000));
  const lastActivityRef = useRef<number>(Date.now());
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const sessionStartTimeRef = useRef<number>(Date.now());

  const resetActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (showWarning) {
      setShowWarning(false);
    }
  }, [showWarning]);

  const handleSignOut = useCallback(() => {
    setShowWarning(false);
    onTimeout();
  }, [onTimeout]);

  // Track user activity events
  useEffect(() => {
    if (!isAuthenticated) return;

    // Track session start
    const savedStart = localStorage.getItem("abcossa_admin_session_start");
    if (savedStart) {
      sessionStartTimeRef.current = parseInt(savedStart, 10);
    } else {
      const now = Date.now();
      sessionStartTimeRef.current = now;
      localStorage.setItem("abcossa_admin_session_start", now.toString());
    }

    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    let throttleTimeout: NodeJS.Timeout | null = null;

    const handleUserActivity = () => {
      if (!throttleTimeout) {
        throttleTimeout = setTimeout(() => {
          resetActivity();
          throttleTimeout = null;
        }, 1000);
      }
    };

    events.forEach((evt) => window.addEventListener(evt, handleUserActivity, { passive: true }));

    // Periodic check for inactivity and max session duration
    const checkInterval = setInterval(() => {
      const now = Date.now();
      const inactiveTime = now - lastActivityRef.current;
      const totalSessionTime = now - sessionStartTimeRef.current;

      // 1. Check max session lifetime (8 hours hard expiry)
      if (totalSessionTime >= maxSessionLifetimeMs) {
        clearInterval(checkInterval);
        handleSignOut();
        return;
      }

      // 2. Check inactivity timeout
      const timeUntilTimeout = inactivityTimeoutMs - inactiveTime;
      const remainingSecs = Math.max(0, Math.floor(timeUntilTimeout / 1000));
      setSecondsRemaining(remainingSecs);

      if (timeUntilTimeout <= 0) {
        clearInterval(checkInterval);
        handleSignOut();
      } else if (timeUntilTimeout <= warningThresholdMs) {
        setShowWarning(true);
      } else {
        setShowWarning(false);
      }
    }, 1000);

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, handleUserActivity));
      clearInterval(checkInterval);
      if (throttleTimeout) clearTimeout(throttleTimeout);
    };
  }, [isAuthenticated, inactivityTimeoutMs, warningThresholdMs, maxSessionLifetimeMs, resetActivity, handleSignOut]);

  const extendSession = () => {
    resetActivity();
  };

  return {
    showWarning,
    secondsRemaining,
    extendSession,
  };
}
