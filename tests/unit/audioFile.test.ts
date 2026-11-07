import { describe, expect, it } from "vitest";
import { APPLE_LOSSLESS, checkAudio, isAppleLossless } from "@/lib/audioFile";

const bytes = (format: string) => new TextEncoder().encode("ftypM4A moov".padEnd(40, ".") + "stsd" + "\0".repeat(12) + format + "\0".repeat(20));

describe("Apple Lossless check", () => {
  it("spots alac in the sample description, not AAC or stray bytes", () => {
    expect(isAppleLossless(bytes("alac"))).toBe(true);
    expect(isAppleLossless(bytes("mp4a"))).toBe(false);
    expect(isAppleLossless(new TextEncoder().encode("audio data with alac in the middle"))).toBe(false);
  });
  it("refuses an alac .m4a with a plain message and leaves other files alone", async () => {
    await expect(checkAudio(new File([bytes("alac")], "take.m4a", { type: "audio/x-m4a" }))).rejects.toThrow(APPLE_LOSSLESS);
    await expect(checkAudio(new File([bytes("mp4a")], "take.m4a", { type: "audio/x-m4a" }))).resolves.toBeUndefined();
    await expect(checkAudio(new File([bytes("alac")], "take.mp3", { type: "audio/mpeg" }))).resolves.toBeUndefined();
  });
});
