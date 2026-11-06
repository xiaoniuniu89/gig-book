// Public press kit (R11): server-rendered, no sign-in. Reads through the public_profile functions with the anon key;
// promo files get short-lived signed URLs made here with the service key, which never leaves the server.
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { Bio } from "@/components/Bio";
import { Qr } from "@/components/Qr";
import { CONTACT_FIELDS, SLUG_RE } from "@/lib/data/types";
import { hrefFor } from "@/lib/contact";

export const dynamic = "force-dynamic";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EXPIRES = 600; // seconds

interface PubFile { storage_path: string; kind: "pdf" | "image" | "audio"; name: string }

interface Kit { display_name: string | null; bio: string | null; instruments: string[] | null; contact: Record<string, string> | null }

// A person's page, or a band's (R10): the address is unique across both.
async function load(slug: string) {
  if (!URL_ || !ANON || !SLUG_RE.test(slug)) return null;
  const sb = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  let p = ((await sb.rpc("public_profile", { p_slug: slug })).data as Kit[] | null)?.[0];
  let fn = "public_profile_files";
  type Musician = { user_id: string; name: string | null; plays: string[] | null; bio: string | null; instruments: string[] | null; contact: Record<string, string> | null };
  let musicians: Musician[] = [];
  if (!p) {
    const b = ((await sb.rpc("public_band", { p_slug: slug })).data as { name: string; bio: string | null; contact: Record<string, string> | null }[] | null)?.[0];
    if (!b) return null;
    p = { display_name: b.name, bio: b.bio, instruments: [], contact: b.contact };
    fn = "public_band_files";
    musicians = ((await sb.rpc("public_band_members", { p_slug: slug })).data as Musician[] | null) || [];
  }
  const files: (PubFile & { url: string })[] = [];
  if (SERVICE) {
    const list = await sb.rpc(fn, { p_slug: slug });
    const rows = (list.data || []) as PubFile[];
    const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
    const signed = await admin.storage.from("attachments").createSignedUrls(rows.map(r => r.storage_path), EXPIRES);
    rows.forEach((r, i) => { const u = signed.data?.[i]?.signedUrl; if (u) files.push({ ...r, url: u }); });
  }
  return { p, files, musicians };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const r = await load((await params).slug);
  return { title: r ? (r.p.display_name || "Press kit") + " · Press kit" : "Press kit", robots: { index: false } };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const r = await load((await params).slug);
  if (!r) notFound();
  const { p, files, musicians } = r;
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
      {p.bio && <section><h2>Bio</h2><Bio bio={p.bio} className="epk-bio" /></section>}
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
      {musicians.length > 0 && (
        <section>
          <h2>The musicians</h2>
          {musicians.map(m => {
            const c = m.contact || {}, tags = m.plays?.length ? m.plays : m.instruments || [];
            const links = CONTACT_FIELDS.filter(f => f.key !== "payment" && c[f.key]);
            return (
              <div className="epk-member" key={m.user_id}>
                <h3>{m.name || "Musician"}{tags.length > 0 && <span className="sub"> · {tags.join(", ")}</span>}</h3>
                {m.bio && <Bio bio={m.bio} className="epk-bio" />}
                {links.length > 0 && <dl className="epk-contact">{links.map(f => {
                  const href = hrefFor(f.key, c[f.key]);
                  return <div key={f.key}><dt>{f.label}</dt><dd>{href ? <a href={href} target="_blank" rel="noopener noreferrer">{c[f.key]}</a> : c[f.key]}</dd></div>;
                })}</dl>}
              </div>
            );
          })}
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
