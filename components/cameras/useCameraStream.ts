"use client";
import { useEffect, useRef, useState } from "react";
import type HlsType from "hls.js";

type Status = "idle" | "connecting" | "live" | "no-signal";

// Единый хук просмотра одной камеры: сначала пробует WebRTC (сигналинг —
// через наш прокси, само видео после ICE идёт напрямую браузер↔агент, в наш
// туннель не попадая — см. отчёт по фиче), при неудаче — HLS через тот же
// прокси (уже реальный проброс байт через туннель, тяжелее, но работает
// в обход NAT/ICE всегда).
//
// ВНИМАНИЕ: формат сигналинга go2rtc (application/sdp тело туда и обратно) —
// по документации на момент написания, не проверено на реальном устройстве.
export function useCameraStream(cameraId: string, quality: "main" | "sub", active: boolean) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<Status>("idle");

  useEffect(() => {
    if (!active) {
      setStatus("idle");
      return;
    }

    let cancelled = false;
    let currentPc: RTCPeerConnection | null = null;
    let currentHls: HlsType | null = null;
    setStatus("connecting");

    // Возвращает установленный RTCPeerConnection при успехе, иначе null —
    // не мутирует внешнее состояние сама, вызывающий код решает, что делать.
    async function tryWebRTC(): Promise<RTCPeerConnection | null> {
      const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
      pc.addTransceiver("video", { direction: "recvonly" });
      pc.addTransceiver("audio", { direction: "recvonly" });
      pc.ontrack = (ev) => {
        if (videoRef.current && ev.streams[0]) videoRef.current.srcObject = ev.streams[0];
      };
      const connected = new Promise<boolean>((resolve) => {
        const t = setTimeout(() => resolve(false), 6000);
        pc.onconnectionstatechange = () => {
          if (pc.connectionState === "connected") {
            clearTimeout(t);
            resolve(true);
          } else if (pc.connectionState === "failed" || pc.connectionState === "closed") {
            clearTimeout(t);
            resolve(false);
          }
        };
      });

      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        const res = await fetch(`/api/cameras/${cameraId}/stream/webrtc?quality=${quality}`, {
          method: "POST",
          headers: { "Content-Type": "application/sdp" },
          body: offer.sdp,
        });
        if (!res.ok) {
          pc.close();
          return null;
        }
        const answerSdp = await res.text();
        if (cancelled) {
          pc.close();
          return null;
        }
        await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
      } catch {
        pc.close();
        return null;
      }
      const ok = await connected;
      if (!ok) {
        pc.close();
        return null;
      }
      return pc;
    }

    // Важно: успех — это не «Hls.isSupported()», а реально загрузившийся
    // плейлист. Раньше статус уходил в "live" сразу после attachMedia(), не
    // дожидаясь ответа сети — если m3u8 не поднялся (камера правда лежит),
    // плитка молча чернела вместо честного «нет сигнала» (см. отчёт по фиче).
    async function tryHls(): Promise<HlsType | "native" | null> {
      const video = videoRef.current;
      if (!video) return null;
      const src = `/api/cameras/${cameraId}/stream/stream.m3u8?quality=${quality}`;

      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        return new Promise((resolve) => {
          const t = setTimeout(() => resolve(null), 6000);
          const onError = () => {
            clearTimeout(t);
            video.removeEventListener("error", onError);
            video.removeEventListener("loadedmetadata", onLoaded);
            resolve(null);
          };
          const onLoaded = () => {
            clearTimeout(t);
            video.removeEventListener("error", onError);
            video.removeEventListener("loadedmetadata", onLoaded);
            resolve("native");
          };
          video.addEventListener("error", onError, { once: true });
          video.addEventListener("loadedmetadata", onLoaded, { once: true });
          video.src = src;
        });
      }

      const { default: Hls } = await import("hls.js");
      if (cancelled || !Hls.isSupported()) return null;
      const hls = new Hls();
      return new Promise((resolve) => {
        const fail = () => {
          clearTimeout(t);
          hls.destroy();
          resolve(null);
        };
        const t = setTimeout(fail, 6000);
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) fail();
        });
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          clearTimeout(t);
          resolve(hls);
        });
        hls.loadSource(src);
        hls.attachMedia(video);
      });
    }

    (async () => {
      const pc = await tryWebRTC();
      if (cancelled) {
        pc?.close();
        return;
      }
      if (pc) {
        currentPc = pc;
        setStatus("live");
        return;
      }
      const hls = await tryHls();
      if (cancelled) {
        if (hls && hls !== "native") hls.destroy();
        return;
      }
      if (hls && hls !== "native") currentHls = hls;
      setStatus(hls ? "live" : "no-signal");
    })();

    return () => {
      cancelled = true;
      currentPc?.close();
      currentHls?.destroy();
    };
  }, [cameraId, quality, active]);

  return { status, videoRef };
}
