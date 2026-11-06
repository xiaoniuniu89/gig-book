// iCalendar (.ics) text for the gig feed (R17). Pure, so it's easy to test.
export interface FeedGig {
  id: string; title: string; gig_date: string; start_time: string | null; venue: string; address: string;
  updated_at: string; setlists: string[]; lineup: string[];
}

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
const ymd = (s: string) => s.replace(/-/g, "");
const utc = (date: string, h = 0, m = 0, days = 0) => new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10) + days, h, m));

/** "20:00", "8pm", "8:30 pm" -> [h, m]; anything else -> null (the gig becomes all-day). */
export function parseTime(t: string | null): [number, number] | null {
  const m = /^\s*(\d{1,2})(?:[:.](\d{2}))?\s*([ap])\.?m\.?\s*$|^\s*(\d{1,2})[:.](\d{2})\s*$/i.exec(t || "");
  if (!m) return null;
  let h: number, min: number;
  if (m[3]) {
    h = +m[1]; min = m[2] ? +m[2] : 0;
    if (h < 1 || h > 12) return null;
    h = h % 12 + (m[3].toLowerCase() === "p" ? 12 : 0);
  } else { h = +m[4]; min = +m[5]; }
  return h > 23 || min > 59 ? null : [h, min];
}

// Lines over 75 octets are folded with a CRLF and a space
function fold(line: string): string {
  const out: string[] = []; let cur = "", bytes = 0;
  for (const ch of line) {
    const n = Buffer.byteLength(ch);
    if (bytes + n > (out.length ? 74 : 75)) { out.push(cur); cur = ""; bytes = 0; }
    cur += ch; bytes += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export function buildIcs(gigs: FeedGig[], origin: string, now = new Date()): string {
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Niu Real Book//Gigs//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:Niu Real Book gigs", "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H"];
  for (const g of gigs) {
    const t = parseTime(g.start_time);
    L.push("BEGIN:VEVENT", `UID:gig-${g.id}@niurealbook.com`, `DTSTAMP:${stamp(now)}`, `LAST-MODIFIED:${stamp(new Date(g.updated_at))}`);
    if (t) {
      // Floating local time (no zone): the same clock time wherever you are. Two hours long.
      L.push(`DTSTART:${stamp(utc(g.gig_date, t[0], t[1])).replace(/Z$/, "")}`, `DTEND:${stamp(utc(g.gig_date, t[0] + 2, t[1])).replace(/Z$/, "")}`);
    } else {
      L.push(`DTSTART;VALUE=DATE:${ymd(g.gig_date)}`, `DTEND;VALUE=DATE:${stamp(utc(g.gig_date, 0, 0, 1)).slice(0, 8)}`);
    }
    L.push(`SUMMARY:${esc(g.title)}`);
    const loc = [g.venue, g.address].filter(Boolean).join(", ");
    if (loc) L.push(`LOCATION:${esc(loc)}`);
    const url = `${origin}/gigs/${g.id}`;
    const desc = [g.setlists.length ? "Setlists: " + g.setlists.join(", ") : "", g.lineup.length ? "Lineup: " + g.lineup.join(", ") : "", url].filter(Boolean).join("\n");
    L.push(`DESCRIPTION:${esc(desc)}`, `URL:${url}`, "END:VEVENT");
  }
  L.push("END:VCALENDAR");
  return L.map(fold).join("\r\n") + "\r\n";
}
