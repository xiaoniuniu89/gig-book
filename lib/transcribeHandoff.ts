// Opens something in the Transcribe tool from anywhere in the app. Kept in memory, so a link never holds a signed file URL.
export type TranscribeSource = { kind: "youtube"; id: string } | { kind: "file"; name: string; url: string };

let pending: TranscribeSource | null = null;
let listener: (() => void) | null = null;

export const sendToTranscribe = (s: TranscribeSource) => { pending = s; listener?.(); };
export const takeTranscribe = () => { const p = pending; pending = null; return p; };
export const onTranscribe = (f: () => void) => { listener = f; return () => { listener = null; }; };
