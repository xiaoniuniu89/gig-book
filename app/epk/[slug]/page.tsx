// Public press kit (R11): server-rendered, no sign-in. Reads through the public_profile functions with the anon key;
// promo files get short-lived signed URLs made here with the service key, which never leaves the server.
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { Qr } from "@/components/Qr";
import { CONTACT_FIELDS, SLUG_RE } from "@/lib/data/types";

export const dynamic = "force-dynamic";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EXPIRES = 600; // seconds

interface PubFile { storage_path: string; kind: "pdf" | "image" | "audio"; name: string }

/** A link for a contact value, or null when it isn't safe to link (only http(s), tel and mailto). */
function hrefFor(key: string, v: string): string | null {
  if (key === "phone") return "tel:" + v.replace(/[^\d+]/g, "");
  if (key === "email") return "mailto:" + v;
  if (key === "whatsapp") { const d = v.replace(/\D/g, ""); return d ? "https://wa.me/" + d : null; }
  const u = /^https?:\/\//i.test(v) ? v : "https://" + v;
  try { return ["http:", "https:"].includes(new URL(u).protocol) ? u : null; } catch { return null; }
}

async function load(slug: string) {
  if (!URL_ || !ANON || !SLUG_RE.test(slug)) return null;
  const sb = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data } = await sb.rpc("public_profile", { p_slug: slug });
  const p = (data as { display_name: string | null; bio: string | null; instruments: string[] | null; contact: Record<string, string> | null }[] | null)?.[0];
  if (!p) return null;
  const files: (PubFile & { url: string })[] = [];
  if (SERVICE) {
    const list = await sb.rpc("public_profile_files", { p_slug: slug });
    const rows = (list.data || []) as PubFile[];
    const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
    const signed = await admin.storage.from("attachments").createSignedUrls(rows.map(r => r.storage_path), EXPIRES);
    rows.forEach((r, i) => { const u = signed.data?.[i]?.signedUrl; if (u) files.push({ ...r, url: u }); });
  }
  return { p, files };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const r = await load((await params).slug);
  return { title: r ? (r.p.display_name || "Press kit") + " · Press kit" : "Press kit", robots: { index: false } };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const r = await load((await params).slug);
  if (!r) notFound();
  const { p, files } = r;
  const contact = p.contact || {};
  const rows = CONTACT_FIELDS.filter(f => f.key !== "payment" && contact[f.key]);
  const pay = contact.payment;
  const payHref = pay ? hrefFor("payment", pay) : null;
  return (
    <article className="epk">
      <header>
        <h1>{p.display_name || "Press kit"}</h1>
        {!!p.instruments?.length && <div className="tags">{p.instruments.map(t => <span className="tag" key={t}>{t}</span>)}</div>}
      </header>
      {p.bio && <section><h2>Bio</h2><p className="epk-bio">{p.bio}</p></section>}
      {rows.length > 0 && (
        <section>
          <h2>Contact</h2>
          <dl className="epk-contact">
            {rows.map(f => {
              const href = hrefFor(f.key, contact[f.key]);
              return <div key={f.key}><dt>{f.label}</dt><dd>{href ? <a href={href} target="_blank" rel="noopener noreferrer">{contact[f.key]}</a> : contact[f.key]}</dd></div>;
            })}
          </dl>
        </section>
      )}
      {pay && (
        <section>
          <h2>Pay</h2>
          <div className="qr-box">
            <Qr text={pay} label="QR code for the payment link" />
            {payHref && <a href={payHref} target="_blank" rel="noopener noreferrer">{pay}</a>}
          </div>
        </section>
      )}
      {files.length > 0 && (
        <section>
          <h2>Press kit</h2>
          <div className="epk-files">
            {files.map(f => f.kind === "image"
              // eslint-disable-next-line @next/next/no-img-element -- a signed URL, not a static asset
              ? <img key={f.storage_path} src={f.url} alt={f.name} />
              : f.kind === "audio"
                ? <div key={f.storage_path}><span>{f.name}</span><audio controls preload="none" src={f.url} /></div>
                : <a key={f.storage_path} className="btn" href={f.url} target="_blank" rel="noopener noreferrer">{f.name}</a>)}
          </div>
        </section>
      )}
    </article>
  );
}
