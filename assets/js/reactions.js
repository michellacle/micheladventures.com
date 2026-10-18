/* Michel Adventures — photo reactions + comments (ticket 0081)
 * API: https://thinksmart.life/api/micheladventures
 * Progressive: if the API is unreachable, the footbars quietly don't appear.
 */
(function () {
    "use strict";

    var API_BASE = "https://thinksmart.life/api/micheladventures";
    var KINDS = ["like", "dislike", "none"];
    var LABELS = { like: "👍", dislike: "👎", none: "😐" };
    var TOKEN_KEY = "ma_session_token";

    function getToken() {
        try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; }
    }
    function setToken(t) {
        try {
            if (t) localStorage.setItem(TOKEN_KEY, t);
            else localStorage.removeItem(TOKEN_KEY);
        } catch (e) { }
    }

    var state = {
        photos: new Map(), // id -> {reactions, comments(count), my_reaction}
        email: null,
        busy: new Set() // photo ids with an in-flight write
    };

    function api(path, opts) {
        var headers = { "Content-Type": "application/json" };
        var tok = getToken();
        if (tok) headers["Authorization"] = "Bearer " + tok;
        return fetch(API_BASE + path, Object.assign({
            headers: headers
        }, opts || {})).then(function (r) {
            if (!r.ok) {
                return r.json().catch(function () { return {}; })
                    .then(function (b) { throw new Error(b.detail || r.status); });
            }
            return r.json();
        });
    }

    function el(tag, cls, text) {
        var n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text != null) n.textContent = text;
        return n;
    }

    function esc(s) { return el("span", null, s); }

    // ---------- rendering ---------------------------------------------------

    function footbar(photoId) {
        var bar = el("div", "photo-footbar");
        bar.dataset.photo = photoId;

        KINDS.forEach(function (kind) {
            var btn = el("button", "pf-btn");
            btn.dataset.kind = kind;
            btn.type = "button";
            btn.appendChild(el("span", "pf-ico", LABELS[kind]));
            btn.appendChild(el("span", "pf-count", "0"));
            btn.title = kind === "like" ? "I like it" : kind === "dislike" ? "Not for me" : "No opinion";
            btn.addEventListener("click", function () { onReaction(photoId, kind); });
            bar.appendChild(btn);
        });

        var cbtn = el("button", "pf-btn pf-comments");
        cbtn.type = "button";
        cbtn.appendChild(el("span", "pf-ico", "💬"));
        cbtn.appendChild(el("span", "pf-count", "0"));
        cbtn.title = "Comments";
        cbtn.addEventListener("click", function () { togglePanel(photoId); });
        bar.appendChild(cbtn);

        bar.appendChild(el("div", "pf-status"));
        return bar;
    }

    function panel(photoId) {
        var p = el("div", "photo-panel");
        p.dataset.photo = photoId;
        p.hidden = true;

        var list = el("div", "pf-comment-list");
        var form = el("form", "pf-comment-form");
        var input = el("textarea", "pf-input");
        input.rows = 2;
        input.maxLength = 500;
        input.placeholder = "Say something about this photo…";
        var send = el("button", "pf-send", "Post");
        send.type = "submit";
        form.appendChild(input);
        form.appendChild(send);
        form.addEventListener("submit", function (e) {
            e.preventDefault();
            var text = input.value.trim();
            if (text) addComment(photoId, text);
        });
        p.appendChild(list);
        p.appendChild(form);
        return p;
    }

    function renderCounts(photoId) {
        var bar = document.querySelector('.photo-footbar[data-photo="' + photoId + '"]');
        if (!bar || !state.photos.has(photoId)) return;
        var d = state.photos.get(photoId);
        KINDS.forEach(function (kind) {
            var c = bar.querySelector('.pf-count[data-kind="' + kind + '"]');
            if (c) c.textContent = d.reactions[kind] || 0;
        });
        var cc = bar.querySelector(".pf-comments .pf-count");
        if (cc) cc.textContent = d.comments || 0;
        if (d.my_reaction) bar.dataset.mine = d.my_reaction;
    }

    function renderComments(photoId) {
        return api("/photos/" + photoId).then(function (d) {
            var p = document.querySelector('.photo-panel[data-photo="' + photoId + '"]');
            if (!p) return;
            var list = p.querySelector(".pf-comment-list");
            list.innerHTML = "";
            if (!d.comments.length) {
                list.appendChild(el("div", "pf-empty", "No comments yet — start the conversation."));
            }
            d.comments.forEach(function (c) {
                var row = el("div", "pf-comment" + (c.yours ? " pf-own" : ""));
                var meta = el("div", "pf-meta");
                meta.appendChild(el("span", "pf-who", c.who + (c.yours ? " (you)" : "")));
                var when = el("time", "pf-when");
                when.dateTime = c.created_at;
                when.textContent = new Date(c.created_at).toLocaleDateString(undefined, {
                    month: "short", day: "numeric", year: "numeric"
                });
                meta.appendChild(when);
                if (c.yours) {
                    var del = el("button", "pf-del", "✕");
                    del.type = "button";
                    del.title = "Delete my comment";
                    del.addEventListener("click", function () { deleteComment(photoId, c.id); });
                    meta.appendChild(del);
                }
                row.appendChild(meta);
                row.appendChild(el("div", "pf-text", c.text));
                list.appendChild(row);
            });
            state.photos.get(photoId).my_reaction = d.my_reaction;
            renderCounts(photoId);
        }).catch(function () { });
    }

    function togglePanel(photoId) {
        var p = document.querySelector('.photo-panel[data-photo="' + photoId + '"]');
        if (!p) return;
        p.hidden = !p.hidden;
        if (!p.hidden) renderComments(photoId);
    }

    function status(photoId, msg, isErr) {
        var bar = document.querySelector('.photo-footbar[data-photo="' + photoId + '"]');
        if (!bar) return;
        var s = bar.querySelector(".pf-status");
        s.textContent = msg || "";
        s.className = "pf-status" + (isErr ? " pf-err" : "");
        if (msg) setTimeout(function () { s.textContent = ""; }, 4000);
    }

    // ---------- actions ------------------------------------------------------

    function ensureSignedIn(photoId, then) {
        if (getToken()) return then();
        askEmail(photoId, function (email) {
            api("/session", { method: "POST", body: JSON.stringify({ email: email }) })
                .then(function (d) {
                    setToken(d.token);
                    state.email = d.email;
                    then();
                })
                .catch(function (e) { status(photoId, e.message, true); });
        });
    }

    function askEmail(photoId, cb) {
        var existing = document.getElementById("ma-signin-modal");
        if (existing) existing.remove();
        var m = el("div", "ma-modal");
        m.id = "ma-signin-modal";
        m.innerHTML =
            '<div class="ma-modal-card">' +
            '<div class="ma-modal-title">Join the conversation</div>' +
            '<p class="ma-modal-sub">Enter your email to like photos and leave comments. ' +
            'No password — we remember you for 60 days.</p>' +
            '<form class="ma-modal-form"><input type="email" required placeholder="you@example.com" ' +
            'style="width:100%;margin-bottom:0.6rem;padding:0.55rem 0.7rem;border:1px solid var(--border);' +
            'border-radius:8px;font:inherit;background:var(--surface)">' +
            '<div style="display:flex;gap:0.5rem">' +
            '<button type="submit" style="flex:1;padding:0.55rem;border:none;border-radius:8px;' +
            'background:var(--accent);color:var(--accent-ink);font:inherit;font-weight:600;cursor:pointer">Continue</button>' +
            '<button type="button" class="ma-cancel" style="padding:0.55rem 1rem;border:1px solid var(--border);' +
            'border-radius:8px;background:var(--surface);color:var(--text-secondary);font:inherit;cursor:pointer">Cancel</button>' +
            '</div></form></div>';
        document.body.appendChild(m);
        var close = function () { m.remove(); document.removeEventListener("click", onDoc, true); };
        var onDoc = function (e) { if (e.target === m) close(); };
        m.querySelector(".ma-cancel").addEventListener("click", close);
        document.addEventListener("click", onDoc, true);
        m.querySelector("form").addEventListener("submit", function (e) {
            e.preventDefault();
            var email = m.querySelector("input").value.trim();
            if (!email) return;
            close();
            cb(email);
        });
        m.querySelector("input").focus();
    }

    function onReaction(photoId, kind) {
        if (state.busy.has(photoId)) return;
        ensureSignedIn(photoId, function () {
            state.busy.add(photoId);
            var bar = document.querySelector('.photo-footbar[data-photo="' + photoId + '"]');
            var current = bar ? bar.dataset.mine : undefined;
            var body = { kind: current === kind ? "none" : kind };
            api("/photos/" + photoId + "/reactions", { method: "POST", body: JSON.stringify(body) })
                .then(function (d) {
                    var p = state.photos.get(photoId);
                    if (p) { p.reactions = d.reactions; p.my_reaction = d.my_reaction; }
                    renderCounts(photoId);
                })
                .catch(function (e) { status(photoId, e.message, true); })
                .finally(function () { state.busy.delete(photoId); });
        });
    }

    function addComment(photoId, text) {
        ensureSignedIn(photoId, function () {
            api("/photos/" + photoId + "/comments", { method: "POST", body: JSON.stringify({ text: text }) })
                .then(function (d) {
                    var p = state.photos.get(photoId);
                    if (p) { p.comments = d.comments; p.reactions = d.reactions; }
                    renderCounts(photoId);
                    renderComments(photoId);
                    var p2 = document.querySelector('.photo-panel[data-photo="' + photoId + '"]');
                    if (p2) p2.querySelector(".pf-input").value = "";
                })
                .catch(function (e) { status(photoId, e.message, true); });
        });
    }

    function deleteComment(photoId, commentId) {
        api("/comments/" + commentId, { method: "DELETE" })
            .then(function () { renderComments(photoId); })
            .catch(function (e) { status(photoId, e.message, true); });
    }

    // ---------- wiring --------------------------------------------------------

    function wire() {
        var grid = document.querySelector(".gallery");
        if (!grid || grid.dataset.maWired) return;
        grid.dataset.maWired = "1";

        Array.prototype.forEach.call(grid.children, function (item) {
            var img = item.tagName === "IMG" ? item : item.querySelector("img");
            if (!img) return;
            var m = img.src.match(/\/media\/(\d+-[a-z0-9-]+)\.jpg/i);
            if (!m) return;
            var photoId = m[1];

            var host = (item.tagName === "IMG") ? grid : item;
            if (item.tagName === "IMG") {
                var fig = el("figure", "photo-item");
                item.parentNode.insertBefore(fig, item);
                fig.appendChild(item);
                host = fig;
            }
            host.appendChild(footbar(photoId));
            host.appendChild(panel(photoId));
            state.photos.set(photoId, { reactions: { like: 0, dislike: 0, none: 0 }, comments: 0 });
        });

        api("/photos").then(function (d) {
            d.photos.forEach(function (p) {
                state.photos.set(p.id, {
                    reactions: p.reactions, comments: p.comments,
                    my_reaction: p.my_reaction || null
                });
                renderCounts(p.id);
            });
        }).catch(function () {
            // API down: footbars stay at zero — acceptable, but hide them
            // so the page looks unchanged rather than broken.
            Array.prototype.forEach.call(document.querySelectorAll(".photo-footbar"), function (b) {
                b.style.display = "none";
            });
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", wire);
    } else {
        wire();
    }
})();
