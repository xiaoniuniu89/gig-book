// A QR code as inline SVG (no dependencies; see lib/qr.ts). Renders nothing when the text is too long to encode.
import { qrPath } from "@/lib/qr";

export function Qr({ text, label }: { text: string; label: string }) {
  const q = qrPath(text);
  if (!q) return null;
  return (
    <svg className="qr" viewBox={`0 0 ${q.size} ${q.size}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={q.size} height={q.size} fill="#fff" />
      <path d={q.d} fill="#000" />
    </svg>
  );
}
