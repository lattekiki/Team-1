import { api } from "./api.ts";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function pushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export async function ensureServiceWorker() {
  if (!pushSupported()) return null;
  return navigator.serviceWorker.register("/sw.js");
}

export async function enablePush(): Promise<"granted" | "denied" | "disabled" | "unsupported"> {
  if (!pushSupported()) return "unsupported";
  const cfg = await api<{ enabled: boolean; publicKey: string | null }>("/push/vapid-public-key");
  if (!cfg.enabled || !cfg.publicKey) return "disabled";

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";

  const reg = await ensureServiceWorker();
  if (!reg) return "unsupported";
  await navigator.serviceWorker.ready;

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(cfg.publicKey),
    });
  }
  const json = sub.toJSON();
  await api("/me/push-subscription", {
    body: { endpoint: json.endpoint, keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth } },
  });
  return "granted";
}

export async function disablePush() {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    const endpoint = sub.endpoint;
    await sub.unsubscribe().catch(() => {});
    await api("/me/push-subscription", { method: "DELETE", body: { endpoint } }).catch(() => {});
  }
}
