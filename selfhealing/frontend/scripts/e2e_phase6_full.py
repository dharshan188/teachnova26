"""BuildHub Phase 6 browser E2E — full flow + §36 console/network validation.

Covers like/unlike + refresh persistence, comment CRUD + refresh persistence,
cross-user authorization (UI affordances AND direct unauthorized API mutations),
project/post/profile regression, guest (anonymous) read-only browse, and mobile
(375px) overflow.

Expected-network policy: only /api/auth/me → 401 (unauthenticated) is allowed.
Any other 4xx/5xx from the app (via page network) is a failure.
"""

import re
import time

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
passed = 0
failed = 0
problems = []


def check(name, cond, extra=""):
    global passed, failed
    if cond:
        passed += 1
        print(f"  ok  {name}")
    else:
        failed += 1
        print(f"FAIL  {name} {extra}")
        problems.append(name)


def stamp():
    return int(time.time() * 1000)


def creds(label):
    s = stamp()
    return {
        "name": f"E2E {label}",
        "username": f"e2{label.lower()}{s}"[-20:],
        "email": f"e2{label.lower()}{s}@example.com",
        "password": "e2e-password-1",
    }


def watch(page, ctx_label):
    """Collect unexpected console errors and unexpected API 4xx/5xx."""
    hits = {"errors": [], "http": []}

    def on_console(msg):
        if msg.type == "error":
            hits["errors"].append(msg.text)

    def on_pageerror(err):
        hits["errors"].append(str(err))

    def on_response(resp):
        url = resp.url
        if "/api/" not in url:
            return
        status = resp.status
        if status >= 400:
            if url.endswith("/api/auth/me") and status == 401:
                return  # expected: unauthenticated session probe
            hits["http"].append(f"{status} {url}")

    page.on("console", on_console)
    page.on("pageerror", on_pageerror)
    page.on("response", on_response)

    def summary():
        real_errors = [e for e in hits["errors"] if not e.startswith(
            "Download the React DevTools"
        ) and "401 (Unauthorized)" not in e]
        if real_errors or hits["http"]:
            problems.append(f"[{ctx_label}] console/HTTP issues: {real_errors} {hits['http']}")
        return len(real_errors) == 0 and len(hits["http"]) == 0

    return summary


def register(page, c):
    page.goto(f"{BASE}/signup")
    page.get_by_label("Name", exact=True).fill(c["name"])
    page.get_by_label("Username", exact=True).fill(c["username"])
    page.get_by_label("Email", exact=True).fill(c["email"])
    page.get_by_label("Password", exact=True).fill(c["password"])
    page.get_by_label("Confirm password", exact=True).fill(c["password"])
    page.get_by_role("button", name="Create account").click()
    page.wait_for_url("**/feed")
    page.wait_for_load_state("networkidle")
    page.get_by_text("Welcome back").wait_for()


def view_post(page, text):
    page.get_by_text(text).locator("xpath=following::a[contains(., 'View post')][1]").click()
    page.wait_for_load_state("networkidle")


def re_contains(t):
    return re.compile(re.escape(t))


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        ctx_a = browser.new_context(viewport={"width": 1280, "height": 800})
        ctx_a.set_default_timeout(20000)
        a = ctx_a.new_page()
        a_ok = watch(a, "A")
        creds_a = creds("A")
        register(a, creds_a)
        a_ok()

        ctx_b = browser.new_context(viewport={"width": 1280, "height": 800})
        ctx_b.set_default_timeout(20000)
        b = ctx_b.new_page()
        b_ok = watch(b, "B")
        creds_b = creds("B")
        register(b, creds_b)
        b_ok()

        # ---- regression: project create ----
        a.goto(f"{BASE}/projects")
        a.get_by_role("button", name="Create project").first.click()
        d = a.get_by_role("dialog")
        d.get_by_label("Project name", exact=True).fill("Social Milestone")
        d.get_by_label("Description", exact=True).fill("Phase 6 validation.")
        d.get_by_role("button", name="Create project").click()
        a.get_by_text("Project created").wait_for()
        a.get_by_role("link", name=re_contains("Social Milestone")).first.wait_for()
        check("Regression create project", True)

        # ---- create post linked to project ----
        a.goto(f"{BASE}/feed")
        composer = a.get_by_role("form", name="Create a post")
        post_text = f"Phase 6 flagship post {stamp()}"
        composer.get_by_label("Post content", exact=True).fill(post_text)
        composer.get_by_label("Link a project", exact=True).select_option(label="Social Milestone")
        composer.get_by_role("button", name="Publish").click()
        a.get_by_text("Post published").wait_for()
        a.get_by_text(post_text).wait_for()
        check("Create linked post", True)

        # ---- like, unlike, refresh persistence (§31 + §26) ----
        a.get_by_role("button", name="Like post").first.click()
        a.get_by_role("button", name="Unlike post").first.wait_for()
        a.reload()
        a.get_by_text(post_text).wait_for()
        a.get_by_role("button", name="Unlike post").first.wait_for()
        check("Like persists after refresh", True)

        a.get_by_role("button", name="Unlike post").first.click()
        a.get_by_role("button", name="Like post").first.wait_for()
        a.reload()
        a.get_by_text(post_text).wait_for()
        a.get_by_role("button", name="Like post").first.wait_for()
        check("Unlike persists after refresh", True)

        # ---- multi-user like state (§26): B likes -> count 2, A likedByMe still true after relike? ----
        # B likes A's post from feed
        b.goto(f"{BASE}/feed")
        b.get_by_text(post_text).wait_for()
        b.get_by_role("button", name="Like post").first.click()
        b.get_by_role("button", name="Unlike post").first.wait_for()
        check("B likes A post", True)

        # A relikes -> count should be 2, and A's state true
        a.goto(f"{BASE}/feed")
        a.get_by_role("button", name="Like post").first.click()
        a.get_by_role("button", name="Unlike post").first.wait_for()
        # count text next to the liked button includes "1"? It shows count; a quick DOM check
        btn = a.get_by_role("button", name="Unlike post").first
        cnt = btn.inner_text()
        # LikeButton renders an accessible label like "1" typically; guard loosely
        check("Like count presents a number", bool(re.search(r"\d+", cnt)), repr(cnt))
        a_ok()

        # ---- comments: create, refresh persistence (§32), edit, delete, refresh gone ----
        view_post(a, post_text)
        # empty state initially (B hasn't commented yet)
        a.get_by_text("No comments yet").wait_for()
        check("Empty comment state", True)

        c1 = f"Phenomenal! {stamp()}"
        a.get_by_label("Comment content", exact=True).fill(c1)
        a.get_by_role("button", name="Post comment").click()
        a.get_by_text(c1).wait_for()
        a.reload()
        a.get_by_text(c1).wait_for()
        check("Comment persists after refresh", True)

        # B comments on A's post from detail
        b.goto(f"{BASE}/feed")
        view_post(b, post_text)
        cB = f"B likes this too {stamp()}"
        b.get_by_label("Comment content", exact=True).fill(cB)
        b.get_by_role("button", name="Post comment").click()
        b.get_by_text(cB).wait_for()
        b.get_by_role("button", name="Comment options").first.wait_for()
        check("B comments on A post + own controls", True)
        check("B has NO post owner menu", b.get_by_role("button", name="Post options").count() == 0)
        b_ok()

        # A edits own comment (§17 positive path)
        a.goto(f"{BASE}/feed")
        view_post(a, post_text)
        a.get_by_role("button", name="Comment options").first.click()
        a.get_by_role("menuitem", name="Edit comment").click()
        edited = f"Refined take {stamp()}"
        a.get_by_label("Edit comment content", exact=True).fill(edited)
        a.get_by_role("button", name="Save changes").click()
        a.get_by_text(edited).wait_for()
        a.reload()
        a.get_by_text(edited).wait_for()
        a.get_by_text("edited").first.wait_for()
        check("Edit comment + 'edited' badge persist after refresh", True)

        # A deletes own comment (§18) and refresh-verifies deletion persists
        a.get_by_role("button", name="Comment options").first.click()
        a.get_by_role("menuitem", name="Delete comment").click()
        dd = a.get_by_role("dialog")
        dd.get_by_role("button", name="Delete comment").click()
        a.reload()
        a.get_by_text(edited).wait_for(state="detached")
        check("Delete comment persists after refresh", True)

        # ---- cross-user authorization via DIRECT API (§33) ----
        # B tries to edit owner A's post / a comment they own needs an existing comment: use B's own comment deleted? create fresh
        # simpler: B attempts to delete A's post and was blocked by UI (covered); now direct:
        post_id = a.url.split("/posts/")[1] if "/posts/" in a.url else ""
        # A's session token lives in ctx_a; B's request shares ctx_b cookies
        b_res = ctx_b.request.get(f"{BASE}/api/posts/{post_id}")
        check("B can GET A post (read-only)", b_res.status == 200, str(b_res.status))
        b_patch = ctx_b.request.patch(f"{BASE}/api/posts/{post_id}", data={"content": "hijack"})
        check("B PATCH A post -> 403/404", b_patch.status == 403, str(b_patch.status))

        # find B's own comment id on the post
        comments = ctx_b.request.get(f"{BASE}/api/posts/{post_id}/comments").json()["comments"]
        b_own = next((c for c in comments if c["author"]["username"] == creds_b["username"]), None)
        check("B comment exists", b_own is not None)
        if b_own:
            unAuth_edit = ctx_a.request.patch(
                f"{BASE}/api/comments/{b_own['id']}", data={"content": "A hijacks B"}
            )
            check("A PATCH B comment -> 403", unAuth_edit.status == 403, str(unAuth_edit.status))
            unAuth_del = ctx_a.request.delete(f"{BASE}/api/comments/{b_own['id']}")
            check("A DELETE B comment -> 403", unAuth_del.status == 403, str(unAuth_del.status))
            own_del = ctx_b.request.delete(f"{BASE}/api/comments/{b_own['id']}")
            check("B DELETE own comment -> 200", own_del.status == 200, str(own_del.status))

        # B cannot edit/delete A's project either (regression of ownership)
        projects = ctx_a.request.get(f"{BASE}/api/projects?mine=1").json()["projects"]
        proj = next((pr for pr in projects if pr["name"] == "Social Milestone"), None)
        check("A project visible", proj is not None)
        if proj:
            b_del_proj = ctx_b.request.delete(f"{BASE}/api/projects/{proj['id']}")
            check("B DELETE A project -> 403", b_del_proj.status == 403, str(b_del_proj.status))
            a_del_proj = ctx_a.request.delete(f"{BASE}/api/projects/{proj['id']}")
            check("A DELETE own project -> 200", a_del_proj.status == 200, str(a_del_proj.status))

        # A still owns their post (regression: direct owner ops)
        a_patch = ctx_a.request.patch(f"{BASE}/api/posts/{post_id}", data={"content": "owner edit ok"})
        check("A PATCH own post -> 200", a_patch.status == 200, str(a_patch.status))
        a_ok()

        # ---- regression: post delete, profile rename, logout/login ----
        a_del_post = ctx_a.request.delete(f"{BASE}/api/posts/{post_id}")
        check("A DELETE own post -> 200", a_del_post.status == 200, str(a_del_post.status))

        # profile rename via UI
        a.goto(f"{BASE}/settings")
        a.get_by_label("Name", exact=True).fill(f"{creds_a['name']} Jr.")
        a.get_by_role("button", name="Save changes").first.click()
        a.get_by_text("Settings saved").wait_for()
        a.reload()
        a.get_by_text(f"{creds_a['name']} Jr.").first.wait_for()
        check("Profile edit persists", True)

        # logout + re-login regression
        a.goto(f"{BASE}/feed")
        a.get_by_role("button", name="Open user menu").first.click()
        a.get_by_role("menuitem", name="Log out").first.click()
        a.wait_for_url("**/")
        a.goto(f"{BASE}/feed")
        a.wait_for_url("**/login")
        check("Logout clears session (protected route redirect)", True)
        a.get_by_label("Email or username", exact=True).fill(creds_a["email"])
        a.get_by_label("Password", exact=True).fill(creds_a["password"])
        a.get_by_role("button", name="Log in").first.click()
        a.wait_for_url("**/feed")
        a.get_by_text("Welcome back").wait_for()
        check("Logout + re-login regression", True)

        # ---- B publishes own post (B content creation regression) ----
        b.goto(f"{BASE}/feed")
        bcomp = b.get_by_role("form", name="Create a post")
        b_post = f"B original post {stamp()}"
        bcomp.get_by_label("Post content", exact=True).fill(b_post)
        bcomp.get_by_role("button", name="Publish").click()
        b.get_by_text("Post published").wait_for()
        b.get_by_text(b_post).wait_for()
        check("B publishes own post", True)
        b_ok()

        # ---- guest (anonymous) browse: public read-only experience ----
        gctx = browser.new_context(viewport={"width": 1280, "height": 800})
        gctx.set_default_timeout(20000)
        g = gctx.new_page()
        g_ok = watch(g, "guest")

        g.goto(f"{BASE}/")
        g.get_by_role("link", name="Featured projects").wait_for()
        check("Guest sees landing", True)

        g.get_by_role("link", name="Log in").first.click()
        g.wait_for_url("**/login")
        check("Guest can navigate to login", True)

        g.goto(f"{BASE}/projects")
        g.get_by_role("heading", name="Projects").wait_for()
        check("Guest has no Create project button", g.get_by_role("button", name="Create project").count() == 0)
        check("Guest has no My projects tab", g.get_by_role("tab", name="My projects").count() == 0)

        g.get_by_role("link", name=re_contains("RoboNav")).first.wait_for()
        g.get_by_role("link", name=re_contains("RoboNav")).first.click()
        g.wait_for_load_state("networkidle")
        g.get_by_text("Owner").first.wait_for()
        check("Guest can view project detail", True)

        g.goto(f"{BASE}/feed")
        g.wait_for_url("**/login")
        check("Guest /feed redirects to login (protected)", True)

        g_posts = gctx.request.get(f"{BASE}/api/posts?pageSize=5", timeout=10000).json()["posts"]
        check("Guest can fetch public posts via API", g_posts and g_posts[0]["id"])

        g.goto(f"{BASE}/posts/{g_posts[0]['id']}")
        g.wait_for_load_state("networkidle")
        g.get_by_role("link", name="Log in to comment").first.wait_for()
        check("Guest sees comment CTA on post detail", True)
        g.get_by_role("link", name="Log in to comment").first.click()
        g.wait_for_url("**/login**")
        check("Guest comment CTA links to login", True)

        g.goto(f"{BASE}/posts/{g_posts[0]['id']}")
        g.get_by_role("button", name="Like post").first.click()
        g.wait_for_url("**/login**")
        check("Guest like redirects to login", True)

        g.goto(f"{BASE}/profile/arjun")
        g.wait_for_load_state("networkidle")
        g.get_by_text("Arjun Mehta").first.wait_for()
        check("Guest can browse public profile", True)

        gm = gctx.new_page()
        gm.set_viewport_size({"width": 375, "height": 700})
        gm.set_default_timeout(15000)
        gm.goto(f"{BASE}/projects")
        gm.wait_for_load_state("networkidle")
        ov = gm.evaluate("() => document.documentElement.scrollWidth - document.documentElement.clientWidth")
        check("Mobile /projects no horizontal overflow (guest)", ov <= 1, f"overflow={ov}")
        gm.close()

        g_ok()
        gctx.close()

        # ---- mobile 375px: feed + post detail + like/comment controls ----
        am = ctx_a.new_page()
        am.set_viewport_size({"width": 375, "height": 700})
        am.set_default_timeout(15000)
        am.goto(f"{BASE}/feed")
        am.wait_for_load_state("networkidle")
        ov = am.evaluate("() => document.documentElement.scrollWidth - document.documentElement.clientWidth")
        check("Mobile /feed no horizontal overflow", ov <= 1, f"overflow={ov}")
        am.get_by_role("button", name="Like post").first.wait_for()
        check("Mobile like control visible", True)
        am.get_by_role("link", name="View post").first.click()
        am.wait_for_load_state("networkidle")
        ov = am.evaluate("() => document.documentElement.scrollWidth - document.documentElement.clientWidth")
        check("Mobile /posts/[id] no horizontal overflow", ov <= 1, f"overflow={ov}")
        am.get_by_label("Comment content", exact=True).fill("mobile comment target")
        am.get_by_role("button", name="Post comment").click()
        am.get_by_text("mobile comment target").wait_for()
        check("Mobile comment form works", True)
        am.close()

        # summary of console/http monitors
        net_ok = len(problems) == 0 or all(not pr.startswith("[") for pr in problems)
        check("No unexpected console errors / API 4xx-5xx", net_ok, f"problems={problems}")

        ctx_a.close()
        ctx_b.close()
        browser.close()

    print(f"\n============================================")
    print(f"Phase 6 browser E2E (full): {passed} passed, {failed} failed")
    if problems:
        print("Problems:")
        for pr in problems:
            print(f"  - {pr}")
    if failed > 0:
        raise SystemExit(1)


if __name__ == "__main__":
    main()