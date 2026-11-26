"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ScanBarcode } from "lucide-react";
import { Button } from "@/components/ui";
import { Spinner } from "@/components/ui/client";

type Controls = { stop: () => void };

/**
 * Camera barcode scanner (@zxing/browser). Starts only on a user gesture
 * (required by iOS Safari / PWA) and always stops the stream on unmount.
 */
export function BarcodeScanner({ onCode, paused }: { onCode: (code: string) => void; paused?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<Controls | null>(null);
  /** Incremented on every start/stop/unmount; a pending start whose session no longer matches is cancelled. */
  const sessionRef = useRef(0);
  const onCodeRef = useRef(onCode);
  const [state, setState] = useState<"idle" | "starting" | "running" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onCodeRef.current = onCode;
  }, [onCode]);

  const stop = useCallback(() => {
    sessionRef.current++;
    controlsRef.current?.stop();
    controlsRef.current = null;
    const v = videoRef.current;
    const stream = v?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((tr) => tr.stop());
    if (v) v.srcObject = null;
  }, []);

  useEffect(() => stop, [stop]);

  // While a lookup is in progress, stop the camera; user can rescan afterwards.
  // (also cancels a start that is still waiting for the permission prompt / camera).
  useEffect(() => {
    if (paused) stop();
  }, [paused, stop]);
  const [prevPaused, setPrevPaused] = useState(paused);
  if (paused !== prevPaused) {
    setPrevPaused(paused);
    if (paused && (state === "running" || state === "starting")) setState("idle");
  }

  const start = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setState("error");
      setError("Prohlížeč nepodporuje kameru (je potřeba HTTPS). Zadej EAN ručně.");
      return;
    }
    setState("starting");
    const session = ++sessionRef.current;
    const cancelled = () => session !== sessionRef.current;
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      if (cancelled()) return;
      const reader = new BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 150, delayBetweenScanSuccess: 800 });
      const video = videoRef.current!;
      video.setAttribute("playsinline", "true");
      video.muted = true;
      let done = false;
      const controls = await reader.decodeFromConstraints(
        { audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } },
        video,
        (result, _err, controls) => {
          if (!result || done) return;
          const text = result.getText();
          if (!/^\d{6,14}$/.test(text)) return;
          done = true;
          controls.stop();
          controlsRef.current = null;
          setState("idle");
          navigator.vibrate?.(40);
          onCodeRef.current(text);
        },
      );
      if (cancelled()) {
        // Closed / paused / unmounted while the permission prompt or camera start was pending:
        // release the camera immediately (iOS Safari keeps it on otherwise).
        controls.stop();
        const stream = video.srcObject as MediaStream | null;
        stream?.getTracks().forEach((tr) => tr.stop());
        video.srcObject = null;
        return;
      }
      controlsRef.current = controls;
      setState("running");
    } catch (e) {
      if (cancelled()) return;
      stop();
      setState("error");
      const name = e instanceof Error ? e.name : "";
      setError(
        name === "NotAllowedError"
          ? "Přístup ke kameře byl zamítnut. Povol ho v nastavení prohlížeče, nebo zadej EAN ručně."
          : name === "NotFoundError"
            ? "Kamera nebyla nalezena. Zadej EAN ručně."
            : "Kameru se nepodařilo spustit. Zadej EAN ručně.",
      );
    }
  };

  const active = state === "running" || state === "starting";

  return (
    <div className="flex flex-col gap-2">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-card">
        <video ref={videoRef} className={active ? "h-full w-full object-cover" : "hidden"} playsInline muted autoPlay />
        {active && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="h-1/3 w-3/4 rounded-xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
          </div>
        )}
        {state === "starting" && (
          <div className="absolute inset-0 grid place-items-center text-white">
            <Spinner className="h-6 w-6" />
          </div>
        )}
        {!active && (
          <button type="button" onClick={start} className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm font-medium text-fg-soft hover:text-fg">
            <ScanBarcode className="h-10 w-10" strokeWidth={1.25} />
            Spustit kameru
          </button>
        )}
      </div>
      {active && (
        <Button
          variant="ghost"
          size="sm"
          className="self-center"
          onClick={() => {
            stop();
            setState("idle");
          }}
        >
          Zastavit kameru
        </Button>
      )}
      {error && <p className="text-sm text-neg">{error}</p>}
    </div>
  );
}
