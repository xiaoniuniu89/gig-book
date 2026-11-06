// Line icons: 24px grid, 2px stroke, round caps, drawn in currentColor. Decorative; the button carries the label.
const PATHS = {
  plus: "M12 5v14M5 12h14",
  play: "M7 4l13 8-13 8V4z",
  flag: "M5 21V4h12l-2 4 2 4H5",
  up: "M12 19V5M6 11l6-6 6 6",
  down: "M12 5v14M6 13l6 6 6-6",
  lock: "M6 11h12v9H6v-9zM8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  share: "M12 15V4M8 8l4-4 4 4M5 13v7h14v-7",
  user: "M12 4a4 4 0 1 0 0 8a4 4 0 1 0 0-8zM4 20c0-4 4-6 8-6s8 2 8 6",
  close:"M6 6l12 12M18 6L6 18",
  music: "M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0a3 3 0 1 1 6 0zM20 16a3 3 0 1 1-6 0a3 3 0 1 1 6 0z",
  import: "M12 4v11M7 10l5 5 5-5M5 20h14",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  edit: "M4 20h4L19 9l-4-4L4 16v4zM13 7l4 4",
  copy: "M9 9h11v11H9V9zM5 15H4V4h11v1",
  sun: "M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8z",
  moon: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z",
  bell: "M6 16v-5a6 6 0 0 1 12 0v5l2 2H4l2-2zM10 20a2 2 0 0 0 4 0",
  settings: "M4 7h9M17 7h3M4 17h3M11 17h9M15 4v6M9 14v6",
  logout:"M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10",
  chat: "M4 5h16v11H9l-5 4V5z",
  help: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17v.01",
  info: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 11v6M12 7.5v.01",
  youtube: "M3 8a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V8zM10 9.5v5l4.5-2.5-4.5-2.5z",
  spotify: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM7 9.5c3.5-1 7-.7 10 1M7.5 12.7c3-.8 6-.5 8.5 1M8 15.7c2.4-.6 4.6-.4 6.5.8",
  upload: "M12 20V9M7 14l5-5 5 5M5 4h14",
  search: "M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14zM16 16l4 4",
  sparkle: "M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6zM19 3v4M17 5h4",
  drum: "M4 10c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 10v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6M7 4l4 4M17 4l-4 4",
  calendar: "M4 6h16v14H4V6zM4 10h16M8 3v4M16 3v4",
  tools:"M8 21h8l-2.5-17h-3L8 21zM12 16l4-8M6 21h12",
} as const;
export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} />
    </svg>
  );
}
