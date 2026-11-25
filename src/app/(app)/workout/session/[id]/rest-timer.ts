"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const KEY = "aio.workout.rest.v1";
export type RestState = { endAt: number; total: number; label: string; workoutId: string } | null;

function load(): RestState {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as RestState) : null;
  } catch {
    return null;
  }
}
function save(s: RestState) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {}
}

/* ── Alarm: vibrate + beep + notification ── */

let audioCtx: AudioContext | null = null;

/** Call from a user gesture (e.g. completing a set) so audio can play later on iOS. */
export function primeAlerts() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!audioCtx && Ctx) audioCtx = new Ctx();
    if (audioCtx?.state === "suspended") void audioCtx.resume();
  } catch {}
  try {
    if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission();
  } catch {}
}

function beep() {
  const ctx = audioCtx;
  if (!ctx) return;
  try {
    const t0 = ctx.currentTime;
    [0, 0.18, 0.36].forEach((offset, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = i === 2 ? 1320 : 880;
      gain.gain.setValueAtTime(0.0001, t0 + offset);
      gain.gain.exponentialRampToValueAtTime(0.35, t0 + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + offset + 0.15);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + offset);
      osc.stop(t0 + offset + 0.16);
    });
  } catch {}
}

function notify(label: string) {
  try {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const opts: NotificationOptions = { body: label ? `Další série: ${label}` : "Můžeš pokračovat.", tag: "aio-rest", icon: "/icon-192.png" };
    const fallback = () => {
      if (document.visibilityState !== "visible") new Notification("Pauza skončila", opts);
    };
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .getRegistration()
        .then((reg) => (reg ? navigator.serviceWorker.ready.then((r) => r.showNotification("Pauza skončila", opts)) : fallback()))
        .catch(fallback);
    } else fallback();
  } catch {}
}

function alarm(label: string) {
  try {
    navigator.vibrate?.([250, 120, 250, 120, 400]);
  } catch {}
  beep();
  notify(label);
}

/** Rest timer that survives reloads / app switching (end timestamp in localStorage). */
export function useRestTimer(workoutId: string) {
  const [rest, setRest] = useState<RestState>(() => {
    const s = load();
    // stale timer from another workout or long expired → ignore
    if (!s || s.workoutId !== workoutId || s.endAt < Date.now() - 5000) return null;
    return s;
  });
  const [now, setNow] = useState(() => Date.now());
  const firedFor = useRef<number | null>(null);

  useEffect(() => {
    if (!rest) return;
    const tick = () => {
      const n = Date.now();
      setNow(n);
      if (n >= rest.endAt && firedFor.current !== rest.endAt) {
        firedFor.current = rest.endAt;
        alarm(rest.label);
        setTimeout(() => {
          setRest((cur) => {
            if (cur && cur.endAt === rest.endAt) {
              save(null);
              return null;
            }
            return cur;
          });
        }, 2500);
      }
    };
    tick();
    const id = setInterval(tick, 250);
    const onVis = () => tick();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [rest]);

  const startRest = useCallback(
    (seconds: number, label: string) => {
      const s = { endAt: Date.now() + seconds * 1000, total: seconds, label, workoutId };
      save(s);
      setNow(Date.now());
      setRest(s);
    },
    [workoutId],
  );
  const adjust = useCallback((delta: number) => {
    setRest((cur) => {
      if (!cur) return cur;
      const endAt = Math.max(Date.now() + 1000, cur.endAt + delta * 1000);
      const s = { ...cur, endAt, total: Math.max(cur.total + delta, 1) };
      save(s);
      return s;
    });
  }, []);
  const skip = useCallback(() => {
    save(null);
    setRest(null);
  }, []);

  const remaining = rest ? Math.max(0, Math.ceil((rest.endAt - now) / 1000)) : 0;
  return { rest, remaining, startRest, adjust, skip };
}
