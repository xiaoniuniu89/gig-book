"use client";
// "Transcribe": opens this recording in the slow-down and loop tool.
import { useRouter } from "next/navigation";
import { Icon } from "./Icon";
import { sendToTranscribe, type TranscribeSource } from "@/lib/transcribeHandoff";

export function TranscribeButton({ source, before }: { source: TranscribeSource; before?: () => void }) {
  const router = useRouter();
  return <button className="btn small" type="button" onClick={() => { before?.(); sendToTranscribe(source); router.push("/tools/transcribe"); }}><Icon name="tools" size={16} /> Transcribe</button>;
}
