// Settings that follow your account (theme, text size…). Unknown keys are kept as they are, so a newer app's settings survive an older one.

export type ThemeChoice = "light" | "dark" | "system";
export type TextSize = "normal" | "large" | "larger";
export type PlayerChoice = "youtube" | "spotify";

export interface Settings {
  theme: ThemeChoice;
  textSize: TextSize;
  /** What plays recordings in the Listen tab. */
  player: PlayerChoice;
  /** Calm mode: no decorative motion, softer colours, fewer buttons, quiet notifications. */
  calm: boolean;
  /** Older all-in-one switch for "someone added me"; the default for the three below (default on). */
  emailAdded: boolean;
  /** Email me when someone adds me to a setlist, a gig's lineup or a band (each defaults to emailAdded). */
  emailSetlist: boolean;
  emailGig: boolean;
  emailBand: boolean;
  /** Email me when someone replies to my note (default off). */
  emailReplies: boolean;
  /** Show the note before AI reads your own work (default on). */
  aiNotes: boolean;
  [key: string]: unknown;
}

export const THEMES: { value: ThemeChoice; label: string }[] = [{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }, { value: "system", label: "Match my device" }];
export const TEXT_SIZES: { value: TextSize; label: string }[] = [{ value: "normal", label: "Normal" }, { value: "large", label: "Large" }, { value: "larger", label: "Larger" }];

export const PLAYERS: { value: PlayerChoice; label: string }[] = [{ value: "youtube", label: "YouTube" }, { value: "spotify", label: "Spotify" }];

export const DEFAULT_SETTINGS: Settings = { theme: "light", textSize: "normal", player: "youtube", calm: false, emailAdded: true, emailSetlist: true, emailGig: true, emailBand: true, emailReplies: false, aiNotes: true };
export const CALM_KEY = "gigbook-calm"; // "1" when calm mode is on; the pre-paint script reads it
export const THEME_KEY = "gigbook-theme-v2"; // v2: the Real Book look starts everyone on light. Holds light, dark or system; the layout's pre-paint script reads it.
export const TEXT_KEY = "gigbook-text"; // same idea for the text size
export const SETTINGS_KEY = "gigbook-settings"; // signed out: the whole object lives here

/** Fill in missing or invalid values, keeping every other key. */
export function normalizeSettings(raw: unknown): Settings {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const theme = THEMES.some(t => t.value === o.theme) ? o.theme as ThemeChoice : DEFAULT_SETTINGS.theme;
  const textSize = TEXT_SIZES.some(t => t.value === o.textSize) ? o.textSize as TextSize : DEFAULT_SETTINGS.textSize;
  const player = PLAYERS.some(t => t.value === o.player) ? o.player as PlayerChoice : DEFAULT_SETTINGS.player;
  const added = o.emailAdded !== false;
  const each = (k: string) => typeof o[k] === "boolean" ? o[k] as boolean : added;
  return { ...o, theme, textSize, player, calm: o.calm === true, emailAdded: added, emailSetlist: each("emailSetlist"), emailGig: each("emailGig"), emailBand: each("emailBand"), emailReplies: o.emailReplies === true, aiNotes: o.aiNotes !== false };
}

export const prefersDark = () => typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
export const resolveTheme = (t: ThemeChoice): "light" | "dark" => t === "system" ? (prefersDark() ? "dark" : "light") : t;

/** Put the settings on the page and into the local mirror the pre-paint script reads. */
export function applySettings(s: Settings) {
  const root = document.documentElement;
  root.dataset.theme = resolveTheme(s.theme);
  root.dataset.text = s.textSize;
  if (s.calm) root.dataset.calm = "1"; else delete root.dataset.calm;
  try { localStorage.setItem(THEME_KEY, s.theme); localStorage.setItem(TEXT_KEY, s.textSize); localStorage.setItem(CALM_KEY, s.calm ? "1" : ""); } catch { /* private mode */ }
}

/** This browser's settings. Before the settings page existed only the theme was saved, as "light" or "dark". */
export function loadLocalSettings(): Settings {
  try {
    const j = localStorage.getItem(SETTINGS_KEY);
    const saved = j ? JSON.parse(j) : {};
    // the mirror keys are what's showing on this device (also while signed in), so they win
    const calm = localStorage.getItem(CALM_KEY);
    return normalizeSettings({ ...saved, theme: localStorage.getItem(THEME_KEY) ?? saved.theme, textSize: localStorage.getItem(TEXT_KEY) ?? saved.textSize, calm: calm === null ? saved.calm : calm === "1" });
  } catch { return { ...DEFAULT_SETTINGS }; }
}
export function saveLocalSettings(s: Settings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* private mode */ }
}

/** Runs in the page head before first paint (the landing page at / stays light). Reads the same keys as above. */
export const PREPAINT =
  "try{var d=document.documentElement,t=localStorage.getItem('gigbook-theme-v2'),x=localStorage.getItem('gigbook-text');" +
  "if(location.pathname!=='/'&&(t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches)))d.dataset.theme='dark';" +
  "if(x==='large'||x==='larger')d.dataset.text=x;" +
  "if(localStorage.getItem('gigbook-calm')==='1')d.dataset.calm='1'}catch(e){}";
