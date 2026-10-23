import { useEffect, useRef, useState } from 'preact/hooks';
import { type Detection, createDetector } from './detector';

const SCAN_INTERVAL_MS = 150;
const REPEAT_COOLDOWN_MS = 2500;

/** Live camera view that reports each barcode or QR code it reads (repeats are throttled). */
export function Scanner({ onDetect, paused = false }: { onDetect: (d: Detection) => void; paused?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const onDetectRef = useRef(onDetect);
  onDetectRef.current = onDetect;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const lastSeen = new Map<string, number>();

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Camera access needs HTTPS (or localhost).');
        }
        const [detector, media] = await Promise.all([
          createDetector(),
          navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false,
          }),
        ]);
        stream = media;
        if (stopped) return;
        const video = videoRef.current!;
        video.srcObject = media;
        await video.play();
        setReady(true);

        const tick = async () => {
          if (stopped) return;
          if (!pausedRef.current && video.readyState >= 2) {
            try {
              const hits = await detector.detect(video);
              const t = Date.now();
              for (const hit of hits) {
                if ((lastSeen.get(hit.rawValue) ?? 0) + REPEAT_COOLDOWN_MS > t) continue;
                lastSeen.set(hit.rawValue, t);
                if (navigator.vibrate) navigator.vibrate(40);
                onDetectRef.current(hit);
              }
            } catch (err) {
              console.warn('detect failed', err);
            }
          }
          timer = setTimeout(tick, SCAN_INTERVAL_MS);
        };
        void tick();
      } catch (err) {
        const name = (err as { name?: string }).name;
        setError(
          name === 'NotAllowedError'
            ? 'Camera permission was denied. Allow camera access for this site and try again.'
            : err instanceof Error
              ? err.message
              : String(err),
        );
      }
    })();

    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div class="scanner">
      <video ref={videoRef} playsInline muted />
      {!ready && !error && <div class="scanner-msg">Starting camera…</div>}
      {error && <div class="scanner-msg scanner-error">{error}</div>}
      {ready && <div class="scanner-guide" />}
    </div>
  );
}
