// Background push handler. Deliberately does NOT use firebase-messaging-compat.js's
// `onBackgroundMessage()` — confirmed via chrome://gcm-internals that Chrome's push layer does
// receive the message (a real "Data msg received" event), but the compat SDK's internal payload
// parsing silently drops it with no error and no notification whenever both `notification` and
// `data` are present in the same message (which is exactly what firebase-admin's
// sendEachForMulticast sends). Handling the raw `push` event ourselves removes that black box —
// this is the standard workaround for that known inconsistency.
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    // Not JSON — nothing sensible to show.
    return;
  }

  const notification = payload.notification ?? {};
  const title = notification.title ?? "MD Path Lab";
  const body = notification.body ?? "";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/logo.png",
      data: payload.data ?? {},
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow("/"));
});
