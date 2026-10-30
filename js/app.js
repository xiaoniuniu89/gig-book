import { splitPlaylists, decodeSong, songLink } from "./ireal.js";
import { irealShift, keyLabel, detectTonic } from "./theory.js";
import { chartHTML, esc } from "./chart.js";
import * as db from "./db.js";
import * as spotify from "./spotify.js";
import { Band } from "./band/engine.js";
import { defaultTempo, feelOf } from "./band/gen.js";

/* ---------------- state ---------------- */
const state = {
  setlists: [],          // [{id,name,spotify,items:[{id,raw,set,shift,versions}]}]
  library: [],           // [{id,name,songs:[raw]}]
  current: null,         // { kind: "set"|"lib", setId?, itemIdx?, plId?, songIdx?, song, item? }
  gig: null,             // { setId, order: [itemIdx], pos, source: "band" }
  follow: true,
};
const prefs = Object.assign({ mode: "trad", sc: true, tn: true, fn: true, choruses: 2, countIn: true, dock: "band", dockSize: "full", libShift: {}, mute: {} },
  (() => { try { return JSON.parse(localStorage.getItem("gigbook-prefs-v2") || "{}"); } catch (e) { return {}; } })());
const savePrefs = () => { try { localStorage.setItem("gigbook-prefs-v2", JSON.stringify(prefs)); } catch (e) {} };

const songCache = new Map();
const song = raw => { if (!songCache.has(raw)) songCache.set(raw, decodeSong(raw)); return songCache.get(raw); };
const meta = raw => { const f = raw.split("="); return { title: f[0].replace(/\s+\d+$/, ""), composer: (f[1] || "").split(" ").reverse().join(" "), style: f[3] || "", key: f[4] || "" }; };
const norm = s => s.toLowerCase().replace(/\(.*?\)|\[.*?\]/g, "").replace(/\s+-\s+.*$/, "").replace(/^the\s+|,\s*the$/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "set";

const $ = sel => document.querySelector(sel);
const view = $("#view"), crumb = $("#crumb");

async function saveSetlist(s) { await db.set("setlist:" + s.id, s); }
function setlistById(id) { return state.setlists.find(s => s.id === id); }
function shiftOf(cur) {
  if (cur.kind === "set") return cur.item.shift ?? irealShift(cur.song);
  const k = cur.song.title + "|" + cur.song.composer;
  return prefs.libShift[k] ?? irealShift(cur.song);
}
function setShift(cur, v) {
  if (cur.kind === "set") { cur.item.shift = v; saveSetlist(setlistById(cur.setId)); }
  else { const k = cur.song.title + "|" + cur.song.composer; if (v === null) delete prefs.libShift[k]; else prefs.libShift[k] = v; savePrefs(); }
}

/* ---------------- toast ---------------- */
let toastTimer = null;
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3500);
}

/* ---------------- home ---------------- */
function renderHome() {
  crumb.innerHTML = "";
  view.innerHTML = `
    <section class="intro">
      <span class="eyebrow">Your gigs</span>
      <h1>Gig Book</h1>
    </section>
    <div class="shelf">
      ${state.setlists.map(s => {
        const keys = [...new Set(s.items.slice(0, 8).map(it => keyLabel(song(it.raw), it.shift ?? irealShift(song(it.raw)))))].join("  ");
        return `<a class="book" href="#set/${s.id}">
          <span class="eyebrow">${s.items.length} tunes${s.spotify ? " · Spotify linked" : ""}</span>
          <span class="t">${esc(s.name)}</span>
          <span class="keys">${esc(keys)}</span>
        </a>`;
      }).join("")}
      <a class="book lib" href="#library">
        <span class="eyebrow">Library</span>
        <span class="t">${state.library.reduce((n, p) => n + p.songs.length, 0) || "No"} charts</span>
        <span class="m">${state.library.length ? esc(state.library.map(p => p.name).join(", ")) : "Import an iReal Pro playlist to start"}</span>
      </a>
    </div>
    <section class="panel import" aria-label="Import">
      <h2>Import from iReal Pro</h2>
      <p class="hint">In iReal Pro, share a playlist as HTML, then drop the file here or choose it. You can also paste an irealb:// link.</p>
      <div class="drop" id="drop">
        <label class="btn primary" for="imp-file">Choose file</label>
        <input class="file-in" id="imp-file" type="file" accept=".html,.htm,.txt">
        <span class="hint">or drop it anywhere on this box</span>
      </div>
      <textarea id="imp-text" rows="2" placeholder="irealb://…"></textarea>
      <div class="row-btns"><button class="btn" id="imp-go">Read link</button></div>
      <div id="imp-result"></div>
    </section>`;
  const handle = text => {
    const pls = splitPlaylists(text);
    const box = $("#imp-result");
    if (!pls.length) { box.innerHTML = `<p class="flag">No iReal Pro playlist found in that. Share the playlist from iReal Pro as HTML and try again.</p>`; return; }
    box.innerHTML = pls.map((p, i) => `
      <div class="imp-row">
        <div><b>${esc(p.name)}</b><span class="hint"> · ${p.songs.length} tune${p.songs.length === 1 ? "" : "s"}</span></div>
        <div class="row-btns">
          <button class="btn primary" data-imp="set" data-i="${i}">Make it a setlist</button>
          <button class="btn" data-imp="lib" data-i="${i}">Add to library</button>
        </div>
      </div>`).join("");
    box.querySelectorAll("[data-imp]").forEach(b => b.onclick = async () => {
      const p = pls[+b.dataset.i];
      if (b.dataset.imp === "lib") {
        const id = slug(p.name);
        const pl = { id, name: p.name, songs: p.songs };
        await db.set("library:" + id, pl);
        state.library = state.library.filter(x => x.id !== id).concat(pl);
        toast(`Added ${p.songs.length} charts to the library.`);
        renderHome();
      } else {
        let id = slug(p.name), n = 2;
        while (setlistById(id)) id = slug(p.name) + "-" + n++;
        const half = Math.ceil(p.songs.length / 2);
        const s = { id, name: p.name, spotify: null, items: p.songs.map((raw, k) => ({ id: "s" + (k + 1), raw, set: p.songs.length > 6 && k >= half ? 2 : 1, shift: null, versions: [] })) };
        await saveSetlist(s); state.setlists.push(s);
        location.hash = "#set/" + id;
      }
    });
  };
  $("#imp-file").onchange = e => { const f = e.target.files[0]; if (f) f.text().then(handle); };
  $("#imp-go").onclick = () => handle($("#imp-text").value);
  const drop = $(".import");
  drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", e => { e.preventDefault(); drop.classList.remove("over"); const f = e.dataTransfer.files[0]; if (f) f.text().then(handle); });
}

/* ---------------- library ---------------- */
let libQuery = "";
function renderLibrary() {
  crumb.innerHTML = `<a href="#home">Gig Book</a> / Library`;
  const all = [];
  state.library.forEach(p => p.songs.forEach((raw, i) => all.push({ p, i, raw, m: meta(raw) })));
  view.innerHTML = `
    <div class="set-head">
      <div><span class="eyebrow">Library</span><h1>${all.length} charts</h1></div>
    </div>
    <input id="lib-q" class="search" type="search" placeholder="Search by title, composer or style" value="${esc(libQuery)}" autocomplete="off">
    <div class="panel list" id="lib-list"></div>`;
  const draw = () => {
    const q = norm(libQuery);
    const hits = (q ? all.filter(x => norm(x.m.title + " " + x.m.composer + " " + x.m.style).includes(q)) : all).slice(0, 200);
    $("#lib-list").innerHTML = hits.length ? hits.map(x => `
      <a class="tune" href="#lib/${x.p.id}/${x.i}">
        <span class="name">${esc(x.m.title)}<span class="sub">${esc(x.m.composer)} · ${esc(x.m.style)}</span></span>
        <span class="k">${esc(x.m.key.replace("-", "–").replace("b", "♭").replace("#", "♯"))}</span>
      </a>`).join("") + (hits.length === 200 ? `<p class="hint pad">Showing the first 200. Narrow the search to see more.</p>` : "")
      : `<p class="hint pad">${all.length ? "Nothing matches that search." : "The library is empty. Import an iReal Pro playlist from the home page."}</p>`;
  };
  draw();
  const qi = $("#lib-q");
  qi.oninput = () => { libQuery = qi.value; draw(); };
  if (!matchMedia("(pointer: coarse)").matches) qi.focus();
}

/* ---------------- setlist ---------------- */
function renderSet(id) {
  const s = setlistById(id);
  if (!s) { location.hash = "#home"; return; }
  crumb.innerHTML = `<a href="#home">Gig Book</a> / ${esc(s.name)}`;
  const sets = [1, 2].map(n => s.items.map((it, i) => ({ it, i })).filter(x => (x.it.set || 1) === n));
  const mins = xs => Math.round(xs.reduce((t, x) => t + (feelOf(song(x.it.raw).style) === "ballad" ? 4 : 3.5), 0));
  view.innerHTML = `
    <div class="set-head">
      <div style="display:grid;gap:6px;min-width:0">
        <span class="eyebrow">Setlist</span>
        <h1>${esc(s.name)}</h1>
      </div>
      <div class="row-btns">
        <button class="btn primary" data-gig="all">Practice gig with the band</button>
        <button class="btn" data-gig="1">Set 1</button>
        <button class="btn" data-gig="2">Set 2</button>
        ${s.spotify ? `<button class="btn" id="play-pl">▶ Play the Spotify playlist</button>` : ""}
      </div>
    </div>
    <div class="sets">
      ${[1, 2].map(n => `
        <section class="set" aria-label="Set ${n}">
          <div class="set-title"><h2>Set ${n}</h2><span class="dur">${sets[n - 1].length} tunes · about ${mins(sets[n - 1])} min</span></div>
          ${sets[n - 1].map((x, pos) => {
            const sg = song(x.it.raw);
            return `<div class="tune">
              <span class="n">${pos + 1}</span>
              <a class="name" href="#song/${s.id}/${x.i}">${esc(sg.title)}<span class="sub">${esc(sg.composer)} · ${esc(sg.style)}</span></a>
              <span class="k">${keyLabel(sg, x.it.shift ?? irealShift(sg))}</span>
              <span class="tune-btns">
                <button class="btn small" data-up="${x.i}" title="Move up" aria-label="Move up">↑</button>
                <button class="btn small" data-move="${x.i}" title="Move to set ${n === 1 ? 2 : 1}">→ ${n === 1 ? 2 : 1}</button>
                <button class="btn small" data-del="${x.i}" title="Remove from setlist" aria-label="Remove">✕</button>
              </span>
            </div>`;
          }).join("") || `<p class="hint pad">Nothing in this set yet.</p>`}
        </section>`).join("")}
    </div>
    <section class="panel">
      <h2>Spotify playlist</h2>
      <p class="hint">Paste the playlist (or album) link. The chart follows whichever track is playing, so the order doesn't need to match.</p>
      <div class="inline-form">
        <input id="pl-link" type="url" placeholder="https://open.spotify.com/playlist/…" value="${s.spotify ? esc(spotify.webUrl(s.spotify)) : ""}">
        <button class="btn" id="pl-save">Save</button>
        ${s.spotify ? `<a class="btn" href="${spotify.webUrl(s.spotify)}" target="_blank" rel="noopener">Open in Spotify</a>` : ""}
      </div>
    </section>
    <section class="panel">
      <h2>Add tunes from the library</h2>
      <input id="add-q" class="search" type="search" placeholder="Search the library" autocomplete="off">
      <div id="add-list" class="list"></div>
    </section>
    <section class="danger-zone">
      <button class="btn small" id="del-set">Delete this setlist</button>
    </section>`;
  view.querySelectorAll("[data-gig]").forEach(b => b.onclick = () => startGig(s, b.dataset.gig));
  const pp = $("#play-pl"); if (pp) pp.onclick = () => playSpotify(s.spotify, true);
  view.querySelectorAll("[data-move]").forEach(b => b.onclick = async () => { const it = s.items[+b.dataset.move]; it.set = (it.set || 1) === 1 ? 2 : 1; await saveSetlist(s); renderSet(id); });
  view.querySelectorAll("[data-up]").forEach(b => b.onclick = async () => {
    const i = +b.dataset.up, it = s.items[i];
    const prev = s.items.slice(0, i).map((x, k) => ({ x, k })).filter(o => (o.x.set || 1) === (it.set || 1)).pop();
    if (!prev) return;
    s.items.splice(i, 1); s.items.splice(prev.k, 0, it); await saveSetlist(s); renderSet(id);
  });
  view.querySelectorAll("[data-del]").forEach(b => b.onclick = async () => {
    if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "Remove?"; return; }
    s.items.splice(+b.dataset.del, 1); await saveSetlist(s); renderSet(id);
  });
  $("#pl-save").onclick = async () => {
    const v = $("#pl-link").value.trim();
    const uri = v ? spotify.toUri(v) : null;
    if (v && !uri) { toast("That isn't a Spotify playlist, album or track link."); return; }
    s.spotify = uri; await saveSetlist(s); toast(uri ? "Playlist linked." : "Playlist removed."); renderSet(id);
  };
  const delSet = $("#del-set");
  delSet.onclick = async () => {
    if (delSet.dataset.armed !== "1") { delSet.dataset.armed = "1"; delSet.textContent = "Tap again to delete " + s.name; return; }
    await db.del("setlist:" + s.id); state.setlists = state.setlists.filter(x => x !== s); location.hash = "#home";
  };
  const all = [];
  state.library.forEach(p => p.songs.forEach(raw => all.push({ raw, m: meta(raw) })));
  const aq = $("#add-q");
  aq.oninput = () => {
    const q = norm(aq.value);
    const hits = q ? all.filter(x => norm(x.m.title + " " + x.m.composer).includes(q)).slice(0, 12) : [];
    $("#add-list").innerHTML = hits.map((x, k) => `
      <div class="tune t3">
        <span class="name">${esc(x.m.title)}<span class="sub">${esc(x.m.composer)} · ${esc(x.m.style)}</span></span>
        <span class="k">${esc(x.m.key)}</span>
        <span class="tune-btns"><button class="btn small" data-add="${k}">+ Set 1</button><button class="btn small" data-add2="${k}">+ Set 2</button></span>
      </div>`).join("") || (q ? `<p class="hint pad">${all.length ? "No match in the library." : "The library is empty."}</p>` : "");
    const add = async (k, n) => {
      const raw = hits[k].raw;
      s.items.push({ id: "s" + Date.now(), raw, set: n, shift: null, versions: [] });
      await saveSetlist(s); toast(`Added ${hits[k].m.title} to set ${n}.`); renderSet(id);
    };
    $("#add-list").querySelectorAll("[data-add]").forEach(b => b.onclick = () => add(+b.dataset.add, 1));
    $("#add-list").querySelectorAll("[data-add2]").forEach(b => b.onclick = () => add(+b.dataset.add2, 2));
  };
}

/* ---------------- song ---------------- */
function sectionRanges(sg) {
  const out = [];
  sg.bars.forEach((b, i) => { if (b.section) out.push({ label: b.section, from: i }); });
  out.forEach((r, k) => { r.to = (out[k + 1] ? out[k + 1].from : sg.bars.length) - 1; });
  return out;
}

function renderSong(cur) {
  state.current = cur;
  const sg = cur.song;
  const shift = shiftOf(cur);
  const s = cur.kind === "set" ? setlistById(cur.setId) : null;
  const list = s ? s.items : null;
  const prevHref = s ? (cur.itemIdx > 0 ? `#song/${s.id}/${cur.itemIdx - 1}` : "") : (cur.songIdx > 0 ? `#lib/${cur.plId}/${cur.songIdx - 1}` : "");
  const nextHref = s ? (cur.itemIdx < list.length - 1 ? `#song/${s.id}/${cur.itemIdx + 1}` : "") : (cur.songIdx < state.library.find(p => p.id === cur.plId).songs.length - 1 ? `#lib/${cur.plId}/${cur.songIdx + 1}` : "");
  crumb.innerHTML = s ? `<a href="#home">Gig Book</a> / <a href="#set/${s.id}">${esc(s.name)}</a> / ${esc(sg.title)}`
    : `<a href="#home">Gig Book</a> / <a href="#library">Library</a> / ${esc(sg.title)}`;
  const isLibOverride = cur.kind === "lib" ? (sg.title + "|" + sg.composer) in prefs.libShift : cur.item.shift !== null && cur.item.shift !== undefined;
  const gigLine = state.gig && state.gig.setId === cur.setId ? `<span class="pill">Practice gig · ${state.gig.pos + 1} of ${state.gig.order.length}</span>` : "";
  view.innerHTML = `
    <div class="song-head">
      <div class="song-title">
        <span class="eyebrow">${s ? `Set ${cur.item.set || 1} · ${cur.itemIdx + 1} of ${list.length}` : "Library"} ${gigLine}</span>
        <h1>${esc(sg.title)}</h1>
        <div class="meta">
          <span>${esc(sg.composer)}</span><span>·</span><span>${esc(sg.style)}</span><span>·</span>
          <span class="keybox" aria-label="Key">
            <button id="tr-down" aria-label="Transpose down a half step">−</button>
            <b id="keyname">${keyLabel(sg, shift)}</b>
            <button id="tr-up" aria-label="Transpose up a half step">+</button>
          </span>
          ${isLibOverride ? `<button class="btn small" id="tr-reset">Back to iReal key</button>` : ""}
        </div>
      </div>
      <div class="nav-pair">
        <a class="btn icon-btn" ${prevHref ? `href="${prevHref}"` : 'aria-disabled="true"'} aria-label="Previous tune">‹</a>
        <a class="btn icon-btn" ${nextHref ? `href="${nextHref}"` : 'aria-disabled="true"'} aria-label="Next tune">›</a>
      </div>
    </div>
    <div class="song-grid">
      <section class="panel" aria-label="Chord chart">
        <div class="panel-head">
          <span class="seg" role="group" aria-label="Approach">
            <button data-mode="trad" aria-pressed="${prefs.mode === "trad"}">Chord scales</button>
            <button data-mode="bh" aria-pressed="${prefs.mode === "bh"}">Barry Harris</button>
          </span>
          <div class="toggles">
            <label class="toggle"><input type="checkbox" id="opt-sc" ${prefs.sc ? "checked" : ""}> Scales</label>
            <label class="toggle"><input type="checkbox" id="opt-tn" ${prefs.tn ? "checked" : ""}> Chord tones</label>
            <label class="toggle"><input type="checkbox" id="opt-fn" ${prefs.fn ? "checked" : ""}> Harmony</label>
          </div>
        </div>
        <div id="chart-wrap">${chartHTML(sg, { shift, mode: prefs.mode, sc: prefs.sc, tn: prefs.tn, fn: prefs.fn })}</div>
        ${cur.item && cur.item.note ? `<p class="hint">${esc(cur.item.note)}</p>` : ""}
      </section>
      <aside class="side">
        <section class="panel" aria-label="Recordings">
          <div class="panel-head"><h2>Recordings</h2>${spotify.isLoggedIn() ? "" : `<button class="btn small" id="sp-login">Log in to Spotify</button>`}</div>
          <div id="versions"></div>
          <div class="inline-form">
            <input id="v-q" type="search" placeholder="Search Spotify" value="${esc(sg.title)}">
            <button class="btn" id="v-go">Find versions</button>
          </div>
          <div id="v-results" class="list"></div>
        </section>
        <section class="panel">
          <h2>iReal Pro</h2>
          <a class="btn" href="${esc(songLink(sg.raw))}">Open this chart in iReal Pro</a>
          ${cur.kind === "lib" ? `<div class="inline-form"><select id="add-to">${state.setlists.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join("")}<option value="__new">New setlist…</option></select><button class="btn" id="add-btn">Add to setlist</button></div>` : ""}
        </section>
      </aside>
    </div>`;

  // key
  const tr = d => { setShift(cur, (((shiftOf(cur) + d) % 12) + 18) % 12 - 6); renderSong(cur); if (band.playing && bandSong() === cur.song) restartBand(); };
  $("#tr-down").onclick = () => tr(-1);
  $("#tr-up").onclick = () => tr(1);
  const rs = $("#tr-reset"); if (rs) rs.onclick = () => { setShift(cur, null); renderSong(cur); };
  // chart options
  view.querySelectorAll("[data-mode]").forEach(b => b.onclick = () => { prefs.mode = b.dataset.mode; savePrefs(); renderSong(cur); });
  for (const k of ["sc", "tn", "fn"]) $("#opt-" + k).onchange = e => { prefs[k] = e.target.checked; savePrefs(); redrawChart(); };
  // recordings
  drawVersions(cur);
  const lg = $("#sp-login"); if (lg) lg.onclick = () => spotify.login();
  $("#v-go").onclick = () => findVersions(cur);
  $("#v-q").onkeydown = e => { if (e.key === "Enter") findVersions(cur); };
  // library: add to setlist
  const ab = $("#add-btn");
  if (ab) ab.onclick = async () => {
    let id = $("#add-to").value;
    if (id === "__new") {
      const name = "New setlist " + new Date().toLocaleDateString();
      id = slug(name) + "-" + Date.now().toString(36);
      const s2 = { id, name, spotify: null, items: [] };
      state.setlists.push(s2);
    }
    const target = setlistById(id);
    target.items.push({ id: "s" + Date.now(), raw: sg.raw, set: 1, shift: prefs.libShift[sg.title + "|" + sg.composer] ?? null, versions: [] });
    await saveSetlist(target);
    toast(`Added to ${target.name}.`);
  };
  updateBandPanel();
}

function redrawChart() {
  const cur = state.current; if (!cur) return;
  $("#chart-wrap").innerHTML = chartHTML(cur.song, { shift: shiftOf(cur), mode: prefs.mode, sc: prefs.sc, tn: prefs.tn, fn: prefs.fn });
  if (lastBar !== null) markBar(lastBar);
}

function versionsOf(cur) { return cur.kind === "set" ? (cur.item.versions = cur.item.versions || []) : []; }
function drawVersions(cur) {
  const box = $("#versions"); if (!box) return;
  const vs = versionsOf(cur);
  if (cur.kind !== "set") { box.innerHTML = `<p class="hint">Add this tune to a setlist to keep the versions you like.</p>`; return; }
  box.innerHTML = vs.length ? vs.map((v, k) => `
    <div class="ver">
      <button class="btn icon-btn small" data-vplay="${k}" aria-label="Play ${esc(v.name)}">▶</button>
      <span class="name">${esc(v.name)}<span class="sub">${esc(v.artists)}</span></span>
      <button class="btn small" data-vdel="${k}" aria-label="Remove">✕</button>
    </div>`).join("") : `<p class="hint">No saved versions yet. Search Spotify below.</p>`;
  box.querySelectorAll("[data-vplay]").forEach(b => b.onclick = () => playSpotify(vs[+b.dataset.vplay].uri, true));
  box.querySelectorAll("[data-vdel]").forEach(b => b.onclick = async () => { vs.splice(+b.dataset.vdel, 1); await saveSetlist(setlistById(cur.setId)); drawVersions(cur); });
}
async function findVersions(cur) {
  const out = $("#v-results");
  if (!spotify.isLoggedIn()) { out.innerHTML = `<p class="hint">Log in to Spotify to search. <button class="btn small" id="sp-login2">Log in</button></p>`; $("#sp-login2").onclick = () => spotify.login(); return; }
  const q = $("#v-q").value.trim() || cur.song.title;
  out.innerHTML = `<p class="hint">Searching…</p>`;
  try {
    const res = await spotify.searchTracks(`track:"${q.replace(/"/g, "")}"`, 25);
    const want = norm(q);
    const rows = res.filter(r => norm(r.name).includes(want) || want.includes(norm(r.name)));
    const shown = rows.length ? rows : res;
    out.innerHTML = shown.map((r, k) => `
      <div class="ver">
        <button class="btn icon-btn small" data-rplay="${k}" aria-label="Play">▶</button>
        <span class="name">${esc(r.artists)}<span class="sub">${esc(r.name)} · ${esc(r.album)}${r.year ? " · " + r.year : ""}</span></span>
        ${cur.kind === "set" ? `<button class="btn small" data-rsave="${k}">Save</button>` : ""}
      </div>`).join("") || `<p class="hint">No versions found.</p>`;
    out.querySelectorAll("[data-rplay]").forEach(b => b.onclick = () => playSpotify(shown[+b.dataset.rplay].uri, true));
    out.querySelectorAll("[data-rsave]").forEach(b => b.onclick = async () => {
      const r = shown[+b.dataset.rsave];
      const vs = versionsOf(cur);
      if (!vs.some(v => v.uri === r.uri)) vs.push({ uri: r.uri, name: r.name, artists: r.artists });
      await saveSetlist(setlistById(cur.setId)); drawVersions(cur); b.textContent = "Saved"; b.disabled = true;
    });
  } catch (e) {
    out.innerHTML = `<p class="flag">${esc(e.message)}</p>`;
    if (e.code === "login") { out.innerHTML += `<button class="btn small" id="sp-login3">Log in to Spotify</button>`; $("#sp-login3").onclick = () => spotify.login(); }
  }
}

/* ---------------- dock: Record (Spotify) + Band ---------------- */
const band = new Band();
let player = null;
let lastBar = null;
let bandFor = null; // the song the band is playing

function bandSong() { return bandFor; }
function markBar(idx) {
  lastBar = idx;
  document.querySelectorAll(".mbar.now").forEach(el => el.classList.remove("now"));
  if (idx === null || idx === undefined) return;
  const el = document.querySelector(`.mbar[data-bar="${idx}"]`);
  if (!el) return;
  el.classList.add("now");
  const r = el.getBoundingClientRect();
  const dock = $("#dock").getBoundingClientRect();
  if (r.top < 80 || r.bottom > dock.top - 10) el.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}

function setDockTab(tab) {
  prefs.dock = tab; savePrefs();
  $("#dock").dataset.tab = tab;
  document.querySelectorAll("[data-dock]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.dock === tab)));
}
function setDockSize(size) {
  prefs.dockSize = size; savePrefs();
  $("#dock").dataset.size = size;
  $("#dock-size").textContent = size === "hidden" ? "Show" : "Hide";
  document.body.dataset.docksize = size;
}

function updateBandPanel() {
  const cur = state.current;
  const t = $("#band-title");
  const sg = band.playing ? bandFor : cur && cur.song;
  t.textContent = sg ? sg.title : "Open a tune to play it with the band";
  $("#band-play").disabled = !sg;
  $("#band-play").textContent = band.playing ? "■ Stop" : "▶ Play";
  const tempoEl = $("#band-tempo");
  if (!band.playing && sg) tempoEl.value = tempoFor(sg);
  $("#tempo-val").textContent = tempoEl.value;
  const loopSel = $("#band-loop");
  if (cur && !band.playing) {
    loopSel.innerHTML = `<option value="">Whole tune</option>` + sectionRanges(cur.song).map((r, k) => `<option value="${r.from}-${r.to}">Loop ${esc(r.label)} (bars ${r.from + 1}–${r.to + 1})</option>`).join("");
  }
}
const tempoKey = sg => "tempo|" + sg.title + "|" + sg.composer;
function tempoFor(sg) { return prefs[tempoKey(sg)] || sg.tempo || defaultTempo(sg.style); }

async function startBand(cur, { fromGig = false } = {}) {
  if (!cur) return;
  if (player) player.pause();
  setDockTab("band");
  bandFor = cur.song;
  const loopV = fromGig ? "" : $("#band-loop").value;
  const loop = loopV ? loopV.split("-").map(Number) : null;
  try {
    await band.play({ song: cur.song, shift: shiftOf(cur), tempo: +$("#band-tempo").value || tempoFor(cur.song), choruses: fromGig ? (prefs.choruses || 2) : +$("#band-choruses").value, countIn: prefs.countIn, loop });
  } catch (e) { toast("The band couldn't start: " + e.message); }
  updateBandPanel();
}
function restartBand() { if (state.current) startBand(state.current); }

band.on(ev => {
  if (ev.type === "bar") {
    $("#band-status").textContent = ev.countIn ? "Count-in" : `Chorus ${ev.chorus || 1} · bar ${ev.idx + 1}`;
    if (state.current && state.current.song === bandFor) markBar(ev.countIn ? null : ev.idx);
  } else if (ev.type === "loading") { $("#band-status").textContent = "Loading the band…"; }
  else if (ev.type === "loaded") { $("#band-status").textContent = "Ready"; }
  else if (ev.type === "error") { $("#band-status").textContent = ev.message; }
  else if (ev.type === "end" || ev.type === "stop") {
    markBar(null); bandFor = null; $("#band-status").textContent = ev.type === "end" ? "Finished" : "Stopped"; updateBandPanel();
    if (ev.type === "end" && state.gig) advanceGig();
  } else if (ev.type === "play") { updateBandPanel(); }
});

/* practice gig */
function startGig(s, which) {
  const order = s.items.map((it, i) => ({ it, i })).filter(x => which === "all" || String(x.it.set || 1) === which).map(x => x.i);
  if (!order.length) { toast("That set is empty."); return; }
  state.gig = { setId: s.id, order, pos: 0 };
  band.init();
  gotoGigSong(true);
}
function gotoGigSong(play) {
  const g = state.gig;
  location.hash = `#song/${g.setId}/${g.order[g.pos]}`;
  if (play) setTimeout(() => startBand(state.current, { fromGig: true }), 50);
}
function advanceGig() {
  const g = state.gig;
  if (g.pos >= g.order.length - 1) { toast("That's the end of the set."); state.gig = null; return; }
  g.pos++;
  $("#band-status").textContent = "Next tune in 3…";
  setTimeout(() => { if (state.gig === g) gotoGigSong(true); }, 3000);
}

/* Spotify */
async function playSpotify(uri, play) {
  if (!uri) return;
  band.stop();
  setDockTab("record");
  if (prefs.dockSize === "hidden") setDockSize("full");
  try {
    if (!player) {
      player = new spotify.Player($("#sp-embed"));
      player.on(onSpotify);
    }
    await player.load(uri, { play, height: 152 });
    $("#rec-title").textContent = uri.startsWith("spotify:track") ? "Recording" : "Playlist";
  } catch (e) { toast(e.message); }
}
async function onSpotify(ev) {
  if (ev.type === "update" && !ev.paused && band.playing) band.stop();
  if (ev.type !== "started" || !state.follow) return;
  const uri = ev.uri;
  // find the tune: a saved version first, then by name
  for (const s of state.setlists) {
    const i = s.items.findIndex(it => (it.versions || []).some(v => v.uri === uri));
    if (i >= 0) { openFromSpotify(s, i); return; }
  }
  if (!spotify.isLoggedIn()) return;
  try {
    const t = await spotify.trackName(uri);
    const n = norm(t.name);
    const pool = state.current && state.current.kind === "set" ? [setlistById(state.current.setId)] : state.setlists;
    for (const s of pool.concat(state.setlists)) {
      const i = s.items.findIndex(it => { const m = norm(song(it.raw).title); return n === m || n.startsWith(m) || m.startsWith(n); });
      if (i >= 0) {
        const it = s.items[i];
        it.versions = it.versions || [];
        if (!it.versions.some(v => v.uri === uri)) { it.versions.push({ uri, name: t.name, artists: t.artists }); saveSetlist(s); }
        openFromSpotify(s, i); return;
      }
    }
    $("#rec-status").textContent = `Playing ${t.name}. Not in your setlists.`;
  } catch (e) { /* not logged in or offline: just don't follow */ }
}
function openFromSpotify(s, i) {
  const target = `#song/${s.id}/${i}`;
  $("#rec-status").textContent = "Following: " + song(s.items[i].raw).title;
  if (location.hash !== target) location.hash = target;
}

function wireDock() {
  document.querySelectorAll("[data-dock]").forEach(b => b.onclick = () => { setDockTab(b.dataset.dock); if (prefs.dockSize === "hidden") setDockSize("full"); });
  $("#dock-size").onclick = () => setDockSize(prefs.dockSize === "hidden" ? "full" : "hidden");
  $("#band-play").onclick = () => { if (band.playing) { state.gig = null; band.stop(); } else startBand(state.current); };
  const tempo = $("#band-tempo");
  tempo.oninput = () => { $("#tempo-val").textContent = tempo.value; if (band.playing) band.setTempo(+tempo.value); };
  tempo.onchange = () => { const sg = bandFor || (state.current && state.current.song); if (sg) { prefs[tempoKey(sg)] = +tempo.value; savePrefs(); } };
  const ch = $("#band-choruses"); ch.value = String(prefs.choruses); ch.onchange = () => { prefs.choruses = +ch.value; savePrefs(); };
  const ci = $("#band-countin"); ci.checked = prefs.countIn; ci.onchange = () => { prefs.countIn = ci.checked; savePrefs(); };
  for (const inst of ["piano", "bass", "drums"]) {
    const b = $("#mute-" + inst);
    const on = !!prefs.mute[inst];
    band.setMute(inst, on); b.setAttribute("aria-pressed", String(!on));
    b.onclick = () => { const m = !prefs.mute[inst]; prefs.mute[inst] = m; savePrefs(); band.setMute(inst, m); b.setAttribute("aria-pressed", String(!m)); };
  }
  const fl = $("#rec-follow"); fl.checked = state.follow; fl.onchange = () => { state.follow = fl.checked; };
  $("#rec-load").onclick = () => {
    const cur = state.current;
    const s = cur && cur.kind === "set" ? setlistById(cur.setId) : state.setlists.find(x => x.spotify);
    if (s && s.spotify) playSpotify(s.spotify, false); else toast("Link a Spotify playlist on the setlist page first.");
  };
  setDockTab(prefs.dock === "record" ? "record" : "band");
  setDockSize(prefs.dockSize === "hidden" ? "hidden" : "full");
  document.addEventListener("keydown", e => {
    if (e.target.closest("input, textarea, select")) return;
    if (e.code === "Space" && state.current) { e.preventDefault(); $("#band-play").click(); }
  });
}

/* ---------------- routing ---------------- */
function route() {
  const h = decodeURIComponent(location.hash.replace(/^#/, ""));
  const parts = h.split("/");
  if (parts[0] !== "song" && parts[0] !== "lib") { state.current = null; markBar(null); }
  if (parts[0] === "library") renderLibrary();
  else if (parts[0] === "set" && parts[1]) renderSet(parts[1]);
  else if (parts[0] === "song" && parts[2] !== undefined) {
    const s = setlistById(parts[1]); const item = s && s.items[+parts[2]];
    if (!item) { location.hash = "#home"; return; }
    renderSong({ kind: "set", setId: s.id, itemIdx: +parts[2], item, song: song(item.raw) });
  } else if (parts[0] === "lib" && parts[2] !== undefined) {
    const p = state.library.find(x => x.id === parts[1]); const raw = p && p.songs[+parts[2]];
    if (!raw) { location.hash = "#library"; return; }
    renderSong({ kind: "lib", plId: p.id, songIdx: +parts[2], song: song(raw) });
  } else renderHome();
  if (!(state.current && bandFor === state.current.song)) markBar(null);
  updateBandPanel();
  window.scrollTo(0, 0);
}

/* ---------------- start ---------------- */
async function start() {
  const err = await spotify.handleRedirect();
  if (err) toast(err);
  state.setlists = await db.all("setlist:");
  state.library = await db.all("library:");
  if (!localStorage.getItem("gigbook-seeded")) {
    try {
      const ids = await (await fetch("data/seeds.json")).json();
      for (const id of ids) {
        if (state.setlists.some(s => s.id === id)) continue;
        const s = await (await fetch(`data/setlists/${id}.json`)).json();
        await saveSetlist(s); state.setlists.push(s);
      }
      localStorage.setItem("gigbook-seeded", "1");
    } catch (e) { console.warn("seed failed", e); }
  }
  wireDock();
  window.addEventListener("hashchange", route);
  route();
}
start();
