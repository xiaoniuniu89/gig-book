// What the in-app Spotify player can do on each device/browser. One table shared by the hint in the player and the "What works where" dialog.
export type PlaybackLevel = "full" | "preview" | "unknown";
export type PlaybackRow = {
  id: string;
  label: string; // the row heading in the table
  you: string; // "You're on ___"
  level: PlaybackLevel;
  result: string; // what the in-app player does
  tip: string; // what to do about it
  hint: string; // one short line for the player
};

export const PLAYBACK_ROWS: PlaybackRow[] = [
  { id: "chromium", label: "Chrome, Edge, Opera or Arc on a computer", you: "Chrome, Edge, Opera or Arc on a computer", level: "full",
    result: "Whole tracks if you're signed in at open.spotify.com in this browser (may need Premium).",
    tip: "Sign in at open.spotify.com, then reload this page.",
    hint: "Whole tracks play if you're signed in at open.spotify.com in this browser. Otherwise you'll hear 30-second previews." },
  { id: "firefox", label: "Firefox on a computer", you: "Firefox on a computer", level: "full",
    result: "Whole tracks if you're signed in at open.spotify.com in this browser (may need Premium).",
    tip: "Sign in at open.spotify.com, then reload this page.",
    hint: "Whole tracks play if you're signed in at open.spotify.com in this browser. Otherwise you'll hear 30-second previews." },
  { id: "safari", label: "Safari on a Mac", you: "Safari on a Mac", level: "preview",
    result: "30-second previews.",
    tip: "Use Open in Spotify, or switch to Chrome, Edge or Firefox.",
    hint: "Safari plays 30-second previews. Use Open in Spotify for whole tracks." },
  { id: "brave", label: "Brave", you: "Brave", level: "preview",
    result: "30-second previews.",
    tip: "Turn Shields off for this site, or use Open in Spotify.",
    hint: "Brave plays 30-second previews unless Shields are off for this site. Or use Open in Spotify for whole tracks." },
  { id: "ios", label: "iPhone or iPad (any browser)", you: "an iPhone or iPad", level: "preview",
    result: "30-second previews.",
    tip: "Use Open in Spotify (the app).",
    hint: "iPhones and iPads play 30-second previews here. Use Open in Spotify for whole tracks." },
  { id: "android", label: "Chrome on Android", you: "Chrome on Android", level: "unknown",
    result: "May be 30-second previews.",
    tip: "Use Open in Spotify (the app).",
    hint: "On Android this may only play 30-second previews. Use Open in Spotify for whole tracks." },
  { id: "other", label: "Anything else", you: "a browser we haven't checked", level: "unknown",
    result: "Unknown.",
    tip: "Use Open in Spotify. A free Spotify account is enough.",
    hint: "Not sure what this browser can play. Use Open in Spotify for whole tracks." },
];

const byId = (id: string) => PLAYBACK_ROWS.find(r => r.id === id) as PlaybackRow;

// Used before we've looked at the device (server render, first paint).
export const GENERAL_HINT = "You'll hear whole tracks if you're signed in at open.spotify.com in this browser, otherwise 30-second previews. Use Open in Spotify for whole tracks.";

// extra.brave: navigator.brave exists. extra.touchMac: Mac user agent with navigator.maxTouchPoints > 1 (an iPad asking for the desktop site).
export function playbackSupport(ua: string, extra: { brave?: boolean; touchMac?: boolean } = {}): PlaybackRow {
  if (/iPhone|iPad|iPod/.test(ua) || (extra.touchMac && /Macintosh/.test(ua))) return byId("ios");
  if (extra.brave) return byId("brave");
  if (/Android/.test(ua)) return byId(/Chrome\//.test(ua) && !/Firefox|EdgA|OPR|SamsungBrowser/.test(ua) ? "android" : "other");
  if (/Firefox\//.test(ua)) return byId("firefox");
  if (/Chrome\/|Chromium\/|Edg\/|OPR\//.test(ua)) return byId("chromium");
  if (/Safari\//.test(ua) && /Macintosh/.test(ua)) return byId("safari");
  return byId("other");
}
