let locale = (function () {
  var tag = String(self.navigator.language || "")
    .toLowerCase()
    .replace(/_/g, "-");
  if (tag === "zh" || tag.indexOf("zh-") === 0) return "zh-TW";
  return "en";
})();

const FALLBACK = {
  en: { title: "Haunted Pet To-Do", body: "A task is waiting." },
  "zh-TW": { title: "鬧鬼寵物待辦", body: "有一項任務在等你。" },
};

self.addEventListener("message", (event) => {
  const next = event.data && event.data.locale;
  if (next === "en" || next === "zh-TW") locale = next;
});

self.addEventListener("push", (event) => {
  const fallback = FALLBACK[locale] || FALLBACK.en;
  let payload = {
    title: fallback.title,
    body: fallback.body,
    tag: "nag",
  };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    if (event.data) payload.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow("/"));
});
