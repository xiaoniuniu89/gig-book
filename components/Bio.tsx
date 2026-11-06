// A formatted bio (R11): sanitised again here, whatever was stored. Old plain-text bios show as paragraphs.
import { bioToHtml } from "@/lib/richtext";

export function Bio({ bio, className }: { bio: string; className?: string }) {
  return <div className={"bio-html" + (className ? " " + className : "")} dangerouslySetInnerHTML={{ __html: bioToHtml(bio) }} />;
}
