"use client";
// The bio editor (Tiptap, StarterKit with its Link): formatting shows as formatting, no markup symbols.
// Loaded on demand from PressKit so other pages don't pay for it. What comes out is always run through sanitizeBio.
import { useState } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { bioToHtml, safeHref, sanitizeBio } from "@/lib/richtext";

export default function RichBio({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit.configure({
      heading: { levels: [3] },
      link: { openOnClick: false, autolink: false, isAllowedUri: u => !!safeHref(u), HTMLAttributes: { rel: "noopener noreferrer nofollow", target: null } },
      blockquote: false, code: false, codeBlock: false, horizontalRule: false, strike: false, underline: false,
    })],
    content: bioToHtml(value),
    editorProps: {
      attributes: { class: "bio-edit bio-html", role: "textbox", "aria-multiline": "true", "aria-label": "Bio" },
      transformPastedHTML: html => sanitizeBio(html),
    },
    onUpdate: ({ editor: e }) => onChange(sanitizeBio(e.getHTML())),
  });
  const st = useEditorState({
    editor,
    selector: ({ editor: e }) => !e ? null : {
      bold: e.isActive("bold"), italic: e.isActive("italic"), h: e.isActive("heading"), ul: e.isActive("bulletList"), ol: e.isActive("orderedList"),
      link: e.isActive("link"), undo: e.can().undo(), redo: e.can().redo(),
    },
  });
  if (!editor || !st) return <p className="hint" role="status">Loading the editor…</p>;
  const btn = (label: string, on: boolean, run: () => void, text: string, disabled = false) => (
    <button className="btn small" type="button" aria-label={label} title={label} aria-pressed={on} disabled={disabled} onClick={run}>{text}</button>
  );
  const applyLink = () => {
    const href = safeHref((url || "").trim().match(/^[a-z][a-z0-9+.-]*:/i) ? url!.trim() : "https://" + (url || "").trim());
    if (url !== null && url.trim() === "") editor.chain().focus().unsetLink().run();
    else if (href) editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    else return;
    setUrl(null);
  };
  return (
    <div className="bio-box">
      <div className="bio-bar" role="toolbar" aria-label="Format the bio">
        {btn("Bold", st.bold, () => editor.chain().focus().toggleBold().run(), "B")}
        {btn("Italic", st.italic, () => editor.chain().focus().toggleItalic().run(), "I")}
        {btn("Heading", st.h, () => editor.chain().focus().toggleHeading({ level: 3 }).run(), "Heading")}
        {btn("Bulleted list", st.ul, () => editor.chain().focus().toggleBulletList().run(), "• List")}
        {btn("Numbered list", st.ol, () => editor.chain().focus().toggleOrderedList().run(), "1. List")}
        {btn("Link", st.link, () => setUrl(editor.getAttributes("link").href || ""), "Link")}
        {btn("Undo", false, () => editor.chain().focus().undo().run(), "Undo", !st.undo)}
        {btn("Redo", false, () => editor.chain().focus().redo().run(), "Redo", !st.redo)}
      </div>
      {url !== null && (
        <div className="acct-row">
          <input type="url" aria-label="Link address" placeholder="https://… or an email address link" value={url} autoFocus onChange={e => setUrl(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); applyLink(); } if (e.key === "Escape") setUrl(null); }} />
          <button className="btn small primary" type="button" onClick={applyLink}>Set link</button>
          <button className="btn small" type="button" onClick={() => setUrl(null)}>Cancel</button>
          <span className="hint">https: or mailto: only. Leave empty to remove a link.</span>
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
