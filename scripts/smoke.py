"""Smoke test for Gig Book. Run against `npm run start` with no Spotify secret set.

Usage: python3 scripts/smoke.py path/to/iReal-library.html [base-url] [screenshot-dir]
Needs Python Playwright with Chromium installed.
"""
import sys, os, json, tempfile
from playwright.sync_api import sync_playwright

if len(sys.argv) < 2:
    sys.exit("usage: python3 scripts/smoke.py <iReal export with Autumn Leaves> [base-url] [screenshot-dir]")
LIB = sys.argv[1]
BASE = sys.argv[2] if len(sys.argv) > 2 else "http://localhost:3000"
OUT = (sys.argv[3] if len(sys.argv) > 3 else tempfile.mkdtemp(prefix="gigbook-smoke-")).rstrip("/") + "/"
os.makedirs(OUT, exist_ok=True)
results = []
def ok(name, cond, detail=""):
    results.append((name, bool(cond), detail)); print(("PASS " if cond else "FAIL ") + name + (" :: " + str(detail) if detail else ""), flush=True)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1280, "height": 900})
    page = ctx.new_page()
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))

    # 1. home with seed
    page.goto(BASE + "/")
    book = page.locator("a.book", has_text="Billie Holiday Short Setlist")
    book.wait_for(timeout=15000)
    ok("home shows seed setlist", book.count() == 1, book.inner_text().replace("\n", " | "))
    page.screenshot(path=OUT + "home.png", full_page=True)

    # 2. import library
    page.set_input_files("#imp-file", LIB)
    page.locator("#imp-result .imp-row").first.wait_for(timeout=15000)
    ok("import finds playlist", True, page.locator("#imp-result .imp-row").first.inner_text().replace("\n", " "))
    page.locator("button[data-imp=lib]").first.click()
    page.wait_for_function("() => document.querySelector('#toast') && !document.querySelector('#toast').hidden", timeout=15000)
    ok("import toast", True, page.locator("#toast").inner_text())
    lib_book = page.locator("a.book.lib .t").inner_text()
    ok("library count on home", "1460" in lib_book, lib_book)

    page.click("text=Library")
    page.wait_for_url("**/library")
    page.locator("#lib-q").fill("Autumn Leaves")
    hit = page.locator("#lib-list a.tune", has_text="Autumn Leaves")
    hit.first.wait_for(timeout=10000)
    ok("library search finds Autumn Leaves", hit.count() >= 1, f"{page.locator('#lib-list a.tune').count()} hit(s): " + hit.first.inner_text().replace("\n", " "))
    hit.first.click()
    page.wait_for_selector("#chart-wrap .mbar", timeout=10000)
    ok("library song renders chart", page.locator("#chart-wrap .mbar").count() > 0, page.locator("h1").inner_text() + " key " + page.locator("#keyname").inner_text())

    # 3. Billie Holiday songs
    page.goto(BASE + "/")
    page.locator("a.book", has_text="Billie Holiday").click()
    page.wait_for_selector(".sets .tune")
    ok("setlist page lists tunes", page.locator(".sets .tune").count() == 16, page.locator(".set-title .dur").all_inner_texts())
    page.screenshot(path=OUT + "setlist.png", full_page=True)
    expected = {"But Not For Me": "A♭", "Moonglow": "C", "There Is No Greater Love": "F"}
    for title, key in expected.items():
        page.goto(BASE + "/")
        page.locator("a.book", has_text="Billie Holiday").click()
        page.locator(".sets a.name", has_text=title).first.click()
        page.wait_for_selector("#chart-wrap .mbar", timeout=10000)
        k = page.locator("#keyname").inner_text()
        counts = page.evaluate("""() => ({bars: document.querySelectorAll('#chart-wrap .mbar').length,
           scaleBrackets: document.querySelectorAll('#chart-wrap .scb.line, #chart-wrap .scb.s').length,
           harmony: document.querySelectorAll('#chart-wrap .fnb.s').length,
           tones: document.querySelectorAll('#chart-wrap .tn span').length,
           firstScale: (document.querySelector('#chart-wrap .scb.s')||{}).textContent,
           firstFn: (document.querySelector('#chart-wrap .fnb.s')||{}).textContent,
           firstChord: (document.querySelector('#chart-wrap .ch')||{}).textContent})""")
        good = k == key and counts["bars"] > 0 and counts["scaleBrackets"] > 0 and counts["harmony"] > 0 and counts["tones"] > 0
        ok(f"{title} chart in {key}", good, f"key={k} {json.dumps(counts, ensure_ascii=False)}")
        if title == "But Not For Me":
            page.screenshot(path=OUT + "song.png", full_page=False)
            # Barry Harris mode toggles overlays
            page.click("button[data-mode=bh]")
            page.wait_for_function("() => document.querySelector('#chart-wrap .fam')")
            ok("Barry Harris mode shows dominant families", page.locator("#chart-wrap .fam").count() > 0, page.locator("#chart-wrap .fam").first.inner_text())
            page.click("button[data-mode=trad]")
            # transpose up and back
            page.click("#tr-up"); page.wait_for_function("() => document.querySelector('#keyname').textContent === 'A'")
            ok("transpose up gives A", True)
            page.click("#tr-reset"); page.wait_for_function("() => document.querySelector('#keyname').textContent === 'A♭'")
            ok("back to iReal key", True)

    # 4. Play with the band (on There Is No Greater Love, currently open)
    page.click("#band-play")
    try:
        page.wait_for_selector(".mbar.now", timeout=45000)
        hl = page.evaluate("() => [...document.querySelectorAll('.mbar.now')].map(e => e.dataset.bar)")
        ok("band playback highlights a bar", len(hl) == 1, f"highlighted data-bar={hl}; status='{page.locator('#band-status').inner_text()}'; button='{page.locator('#band-play').inner_text()}'")
        page.wait_for_timeout(2500)
        hl2 = page.evaluate("() => [...document.querySelectorAll('.mbar.now')].map(e => e.dataset.bar)")
        ok("highlight advances", hl2 != hl, f"later data-bar={hl2}; status='{page.locator('#band-status').inner_text()}'")
        page.screenshot(path=OUT + "playing.png", full_page=False)
        # navigate away and back: audio keeps playing (dock persists in layout)
        page.click("a.brand"); page.wait_for_url(BASE + "/")
        page.wait_for_timeout(800)
        ok("band keeps playing across navigation", page.locator("#band-play").inner_text().startswith("■"), page.locator("#band-status").inner_text())
        page.go_back()
        page.wait_for_selector(".mbar.now", timeout=8000)
        ok("highlight resumes when back on the song", True)
        page.click("#band-play")
        page.wait_for_function("() => document.querySelector('#band-play').textContent.includes('Play')")
        ok("stop", page.locator(".mbar.now").count() == 0, page.locator("#band-status").inner_text())
    except Exception as e:
        ok("band playback highlights a bar", False, f"{e}; status='{page.locator('#band-status').inner_text()}'")

    # 5. Spotify routes without a secret
    r1 = page.request.get(BASE + "/api/spotify/search?q=autumn")
    r2 = page.request.get(BASE + "/api/spotify/track/4iV5W9uYEdYUVa79Axb7Rh")
    ok("search route 503 without secret", r1.status == 503, f"{r1.status} {r1.text()}")
    ok("track route 503 without secret", r2.status == 503, f"{r2.status} {r2.text()}")
    # UI message
    page.locator("#v-go").click()
    page.wait_for_selector("#v-results .flag", timeout=10000)
    ok("UI says Spotify search isn't set up", "isn't set up yet" in page.locator("#v-results .flag").inner_text(), page.locator("#v-results .flag").inner_text())

    # 6. persistence after reload
    page.goto(BASE + "/library")
    page.wait_for_selector("#lib-list a.tune")
    ok("library persists after reload", "1460" in page.locator("h1").inner_text(), page.locator("h1").inner_text())

    # dark mode screenshot of a song
    dctx = b.new_context(viewport={"width": 390, "height": 844}, color_scheme="dark")
    dp = dctx.new_page()
    dp.goto(BASE + "/"); dp.locator("a.book", has_text="Billie Holiday").click(); dp.locator(".sets a.name", has_text="Moonglow").first.click()
    dp.wait_for_selector("#chart-wrap .mbar"); dp.screenshot(path=OUT + "mobile-dark.png", full_page=False)
    sw = dp.evaluate("() => document.documentElement.scrollWidth")
    ok("no horizontal scroll at 390px", sw <= 390, f"scrollWidth={sw}")

    # the 503s are the Spotify routes tested above; fonts.googleapis.com may be unreachable in sandboxes
    real_errors = [e for e in errors if "favicon" not in e and "ERR_TUNNEL_CONNECTION_FAILED" not in e and "503" not in e]
    ok("no console errors", not real_errors, real_errors[:5])
    b.close()

fails = [r for r in results if not r[1]]
print(f"\n{len(results) - len(fails)}/{len(results)} checks passed")
sys.exit(1 if fails else 0)
