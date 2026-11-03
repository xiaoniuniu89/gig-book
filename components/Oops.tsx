// Error pages in the Gigle style: a hand-lettered shout, a typewritten line, the way out, and a stick-figure musician.
import Link from "next/link";

const ART = {
  404: { src: "/art/oops-sax.png", alt: "A confused sax player", w: 285, h: 500, title: "Oops..... 404" },
  403: { src: "/art/stop-hand.svg", alt: "A hand signalling stop", w: 400, h: 391, title: "STOP!!!!" },
  500: { src: "/art/angry-guitar.svg", alt: "A guitarist smashing his guitar", w: 400, h: 308, title: "Oops....." },
} as const;

export function Oops({ code, lines, links, children }: {
  code: keyof typeof ART;
  lines: string[];
  links?: { href: string; label: string }[];
  children?: React.ReactNode;
}) {
  const a = ART[code];
  return (
    <section className="oops">
      <div className="oops-txt">
        <h1>{a.title}</h1>
        {lines.map(l => <p key={l} className="type">{l}</p>)}
        <div className="row-btns">
          {(links ?? [{ href: "/", label: "Home" }]).map((l, i) => <Link key={l.href} className={"btn" + (i === 0 ? " primary" : "")} href={l.href}>{l.label}</Link>)}
          {children}
        </div>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element -- small static line art */}
      <img className="oops-art" src={a.src} alt={a.alt} width={a.w} height={a.h} />
    </section>
  );
}
