// Press photos (#52): a press photo is an image among your promo files, with its own who-can-see-it setting.
export const MAX_PHOTOS = 5;
const MAX_SIDE = 1800; // px on the long side

/** Shrinks an image in the browser (long side 1800 px, JPEG) so uploads stay small. Returns the original if it can't. */
export async function resizeImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.type === "image/svg+xml") return file;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
    const g = c.getContext("2d");
    if (!g) return file;
    g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); // transparent PNGs go white, not black
    g.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    const blob = await new Promise<Blob | null>(r => c.toBlob(r, "image/jpeg", 0.85));
    if (!blob || (k === 1 && blob.size >= file.size)) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch { return file; }
}
