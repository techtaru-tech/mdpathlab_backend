import { initializeApp, type FirebaseApp } from "firebase/app";
import { getMessaging, getToken, isSupported, onMessage, type Messaging } from "firebase/messaging";

const env = import.meta.env;

const firebaseConfig = {
  apiKey: env["VITE_FIREBASE_API_KEY"],
  authDomain: env["VITE_FIREBASE_AUTH_DOMAIN"],
  projectId: env["VITE_FIREBASE_PROJECT_ID"],
  storageBucket: env["VITE_FIREBASE_STORAGE_BUCKET"],
  messagingSenderId: env["VITE_FIREBASE_MESSAGING_SENDER_ID"],
  appId: env["VITE_FIREBASE_APP_ID"],
};

const vapidKey: string | undefined = env["VITE_FIREBASE_VAPID_KEY"];

const isConfigured = Object.values(firebaseConfig).every(Boolean) && Boolean(vapidKey);

let app: FirebaseApp | null = null;
let messagingPromise: Promise<Messaging | null> | null = null;

async function getMessagingInstance(): Promise<Messaging | null> {
  if (typeof window === "undefined" || !isConfigured) return null;
  if (!(await isSupported())) return null; // Safari/older browsers, or non-HTTPS contexts

  if (!app) app = initializeApp(firebaseConfig);
  return getMessaging(app);
}

/**
 * Requests notification permission, registers the background service worker, and returns the FCM
 * registration token for this browser. Returns null on any unsupported/unconfigured/denied path
 * rather than throwing — callers treat "no push for this session" as a normal, silent outcome,
 * not an error worth surfacing to the user.
 */
export async function requestPushToken(): Promise<string | null> {
  if (!messagingPromise) messagingPromise = getMessagingInstance();
  const messaging = await messagingPromise;
  if (!messaging) return null;

  if (Notification.permission === "default") {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return null;
  }
  if (Notification.permission !== "granted") return null;

  // register() resolves as soon as a registration exists — often still "installing", not yet
  // "active". getToken()'s PushManager.subscribe() requires an ACTIVE worker, so without this
  // wait it intermittently (or, on a fresh registration, reliably) fails with "no active Service
  // Worker" even though permission and config are both fine.
  await navigator.serviceWorker.register("/firebase-messaging-sw.js");
  const registration = await navigator.serviceWorker.ready;

  if (!vapidKey) return null; // isConfigured already guarantees this, but narrows the type here too

  try {
    return await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
  } catch {
    return null;
  }
}

/**
 * A background service worker only receives a push when this browser has no focused, controlled
 * tab open — with one open (the common case right after a user just acted in it), Firebase routes
 * the message here instead, silently, unless something shows it. This shows the same native OS
 * notification the service worker would have, so "the tab is open" doesn't mean "no notification".
 * Safe to call repeatedly (e.g. once per page) — each call just adds another onMessage listener.
 */
export async function listenForForegroundPush() {
  const messaging = await getMessagingInstance();
  if (!messaging) return;
  onMessage(messaging, (payload) => {
    if (Notification.permission !== "granted") return;
    const title = payload.notification?.title ?? "MD Path Lab";
    const body = payload.notification?.body ?? "";
    new Notification(title, { body, icon: "/logo.png" });
  });
}
