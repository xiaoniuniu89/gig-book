import { NextResponse, type NextRequest } from "next/server";
import { isVideoId } from "@/lib/youtube/ids";

export const dynamic = "force-dynamic";

const API = "https://www.googleapis.com/youtube/v3/";
interface Snippet { title?: string; channelTitle?: string; thumbnails?: Record<string, { url?: string }> }

// The API returns titles with HTML entities in them
const decode = (s: string) => s.replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
  const t = e.toLowerCase();
  if (t[0] === "#") { const n = t[1] === "x" ? parseInt(t.slice(2), 16) : parseInt(t.slice(1), 10); return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ""; }
  return ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" } as Record<string, string>)[t] ?? "";
});
const video = (id: string, sn: Snippet) => ({
  id, title: decode(sn.title || ""), channel: decode(sn.channelTitle || ""),
  thumb: sn.thumbnails?.medium?.url || sn.thumbnails?.default?.url || "",
});

// GET /api/youtube/search?q=...&pageToken=...  ->  { videos: [{ id, title, channel, thumb }], next?: string }   (search.list: 100 quota units)
// GET /api/youtube/search?id=VIDEOID           ->  { videos: [one] } or 404 if it's gone or can't be embedded (videos.list: 1 unit)
export async function GET(req: NextRequest) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return NextResponse.json({ error: "YouTube search isn't set up yet." }, { status: 503 });
  const p = req.nextUrl.searchParams;
  const id = (p.get("id") || "").trim();
  const q = (p.get("q") || "").trim().slice(0, 200);
  if (!id && !q) return NextResponse.json({ error: "Missing q." }, { status: 400 });
  const params = new URLSearchParams({ key });
  let url: string;
  if (id) {
    if (!isVideoId(id)) return NextResponse.json({ error: "That isn't a YouTube video id." }, { status: 400 });
    url = API + "videos?" + new URLSearchParams({ key, part: "snippet,status", id });
  } else {
    params.set("part", "snippet"); params.set("type", "video"); params.set("videoEmbeddable", "true");
    params.set("videoCategoryId", "10"); params.set("maxResults", "10"); params.set("q", q);
    const page = (p.get("pageToken") || "").slice(0, 100);
    if (/^[A-Za-z0-9_-]+$/.test(page)) params.set("pageToken", page);
    url = API + "search?" + params;
  }
  let res: Response;
  try { res = await fetch(url, { cache: "no-store" }); } catch { return NextResponse.json({ error: "Couldn't reach YouTube." }, { status: 502 }); }
  if (!res.ok) {
    const quota = res.status === 403;
    return NextResponse.json({ error: quota ? "YouTube search is used up for today. Saved recordings still play." : "YouTube search failed (" + res.status + ")." }, { status: quota ? 429 : 502 });
  }
  const d = await res.json() as { nextPageToken?: string; items?: { id: string | { videoId?: string }; snippet?: Snippet; status?: { embeddable?: boolean } }[] };
  const items = d.items || [];
  const videos = id
    ? items.filter(i => i.status?.embeddable !== false).map(i => video(String(i.id), i.snippet || {}))
    : items.flatMap(i => typeof i.id === "object" && i.id.videoId ? [video(i.id.videoId, i.snippet || {})] : []);
  if (id && !videos.length) return NextResponse.json({ error: "That video isn't available to play here." }, { status: 404 });
  return NextResponse.json({ videos, next: d.nextPageToken }, { headers: { "Cache-Control": "private, max-age=300" } });
}
