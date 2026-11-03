"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./Icon";
import { useApp } from "./AppProvider";
import { itemUuid } from "@/lib/data/supabase";
import type { AppNotification } from "@/lib/data/types";

const POLL_MS = 60_000;

const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1) return "now";
  if (m < 60) return m + "m";
  if (m < 1440) return Math.round(m / 60) + "h";
  return Math.round(m / 1440) + "d";
};

// Notifications bell (R7.1). Accounts only; polls on focus and every minute.
export function Bell() {
  const { store, account, ensureSetlist, toast, settings } = useApp();
  const router = useRouter();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const live = store.kind === "supabase" && !!account;

  const load = useCallback(async () => {
    try { setItems(await store.listNotifications()); } catch { /* offline: keep what we have */ }
  }, [store]);

  useEffect(() => {
    if (!live) { setItems([]); return; }
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, POLL_MS);
    const onVis = () => { if (!document.hidden) load(); };
    window.addEventListener("focus", onVis);
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(t); window.removeEventListener("focus", onVis); document.removeEventListener("visibilitychange", onVis); };
  }, [live, load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!live) return null;
  const unread = items.filter(n => !n.read).length;

  const markRead = (ids?: string[]) => {
    setItems(p => p.map(n => !ids || ids.includes(n.id) ? { ...n, read: true } : n));
    store.markNotificationsRead(ids).catch(e => { toast(e instanceof Error ? e.message : "Couldn't mark read."); load(); });
  };

  const go = async (n: AppNotification) => {
    if (!n.read) markRead([n.id]);
    setOpen(false);
    if (n.bandId) { router.push("/bands/" + encodeURIComponent(n.bandId)); return; }
    if (!n.setlistId) return;
    let path = "/set/" + encodeURIComponent(n.setlistId);
    if (n.itemId) {
      const s = await ensureSetlist(n.setlistId);
      const i = s ? s.items.findIndex(it => itemUuid(s.id, it.id) === n.itemId) : -1;
      if (i >= 0) path += "/" + i;
    }
    router.push(path);
  };

  const text = (n: AppNotification) => {
    if (n.kind === "added_to_band") return <>{n.actorName} added you to the band <b>{n.bandName}</b></>;
    if (n.kind === "note_in_band") return <>{n.actorName} added a note in <b>{n.bandName}</b></>;
    const sl = <b>{n.setlistName}</b>;
    if (n.kind === "added_to_setlist") return <>{n.actorName} added you to {sl}</>;
    if (n.kind === "reply_to_note") return <>{n.actorName} replied to your note in {sl}</>;
    return <>{n.actorName} added a note in {sl}</>;
  };

  return (
    <span className="acct-wrap">
      <button className="btn small icon-btn bell" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} aria-expanded={open}
        onClick={() => { setOpen(o => !o); if (!open) load(); }}>
        <Icon name="bell" size={18} />
        {unread > 0 && (settings.calm ? <span className="player-dot" aria-hidden="true" /> : <span className="bell-count">{unread > 99 ? "99+" : unread}</span>)}
      </button>
      {open && <>
        <div className="bell-scrim" onClick={() => setOpen(false)} />
        <div className="card auth-panel bell-panel" role="dialog" aria-label="Notifications">
          <div className="bell-head">
            <b>Notifications</b>
            <span>
              <button className="btn small" disabled={!unread} onClick={() => markRead()}>Mark all read</button>{" "}
              <button className="btn small bell-close" onClick={() => setOpen(false)}>Close</button>
            </span>
          </div>
          {items.length === 0 ? <p className="muted">Nothing yet.</p> : (
            <ul className="bell-list">
              {items.map(n => (
                <li key={n.id}>
                  <button className={"bell-item" + (n.read ? "" : " unread")} onClick={() => go(n)}>
                    <span>{text(n)}</span>
                    <small>{ago(n.createdAt)}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </>}
    </span>
  );
}
