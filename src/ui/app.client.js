/* =========================================================
   kumon-ikanai-mon — クライアント
   ハッシュルーティングの画面遷移型 SPA (依存ライブラリなし)

   画面:
     #/                 ホーム (カテゴリカード + 進捗)
     #/c/:categoryId    カテゴリ (トピック別クイズ一覧)
     #/play/:quizId     出題 (没入モード / 1問ずつ)
     #/result           結果
     #/admin            管理 (ドリルダウン + 問題エディタ)
     #/admin/c/:id  #/admin/t/:id  #/admin/q/:id
   ========================================================= */
(function () {
  "use strict";

  var QUESTIONS_PER_QUIZ = 10;

  // ---------- tiny DOM helper (textContent ベースで XSS を構造的に防ぐ) ----------
  function h(tag, props) {
    var el = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v == null || v === false) return;
        if (k === "class") el.className = v;
        else if (k === "text") el.textContent = v;
        else if (k === "html") el.innerHTML = v; // 静的な SVG 等にのみ使用
        else if (k === "on")
          Object.keys(v).forEach(function (ev) {
            el.addEventListener(ev, v[ev]);
          });
        else if (k === "dataset")
          Object.keys(v).forEach(function (d) {
            el.dataset[d] = v[d];
          });
        else if (k === "style") el.style.cssText = v;
        else if (k in el && k !== "list" && k !== "form") {
          try {
            el[k] = v;
          } catch {
            el.setAttribute(k, v);
          }
        } else el.setAttribute(k, v === true ? "" : v);
      });
    }
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }
  function append(el, child) {
    if (child == null || child === false) return;
    if (Array.isArray(child)) {
      child.forEach(function (c) {
        append(el, c);
      });
      return;
    }
    el.appendChild(
      typeof child === "string" || typeof child === "number"
        ? document.createTextNode(String(child))
        : child,
    );
  }
  function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }
  var $ = function (id) {
    return document.getElementById(id);
  };

  // ---------- rich text (```fence コードブロック + `inline` 対応 / XSS-safe) ----------
  // 問題文・選択肢・解説は textContent 直入れだったため ``` が素通しだった。
  // textNode + pre/code の DOM組み立てのみで描画し、innerHTML にユーザー入力を渡さない。
  function appendRichInline(el, text) {
    var parts = String(text).split(/(`[^`\n]+`)/g);
    parts.forEach(function (part) {
      if (!part) return;
      if (part.length >= 2 && part.charAt(0) === "`" && part.charAt(part.length - 1) === "`") {
        el.appendChild(h("code", { class: "inline-code", text: part.slice(1, -1) }));
      } else {
        var lines = part.split("\n");
        lines.forEach(function (line, idx) {
          if (idx) el.appendChild(h("br"));
          if (line) el.appendChild(document.createTextNode(line));
        });
      }
    });
  }
  function appendCodeBlock(el, lang, code) {
    var label = (lang || "").trim() || "code";
    var codeEl = h("code", { text: code.replace(/\n$/, "") });
    codeEl.setAttribute("data-lang", label);
    var copy = h("button", {
      type: "button",
      class: "code-copy",
      text: "コピー",
      "aria-label": "コードをコピー",
    });
    copy.addEventListener("click", function (e) {
      e.stopPropagation();
      var done = function () {
        copy.textContent = "コピー済み";
        setTimeout(function () {
          copy.textContent = "コピー";
        }, 1200);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code.replace(/\n$/, "")).then(done, done);
      } else {
        var ta = document.createElement("textarea");
        ta.value = code.replace(/\n$/, "");
        document.body.appendChild(ta);
        try {
          ta.select();
          document.execCommand("copy");
        } catch {}
        ta.remove();
        done();
      }
    });
    el.appendChild(
      h(
        "div",
        { class: "code-block" },
        h("div", { class: "code-head" }, h("span", { class: "code-lang", text: label }), copy),
        h("pre", { class: "code-pre" }, codeEl),
      ),
    );
  }
  function renderRich(el, src) {
    clear(el);
    el.classList.add("rich");
    var text = src == null ? "" : String(src);
    var re = /```([A-Za-z0-9_+\-#.]*)\s*\n([\s\S]*?)```/g;
    var last = 0;
    var m;
    var found = false;
    while ((m = re.exec(text))) {
      found = true;
      if (m.index > last) appendRichInline(el, text.slice(last, m.index));
      appendCodeBlock(el, m[1], m[2]);
      last = m.index + m[0].length;
    }
    if (!found) {
      appendRichInline(el, text);
      return;
    }
    if (last < text.length) appendRichInline(el, text.slice(last));
  }
  function richEl(tag, cls, src) {
    var el = h(tag, { class: cls });
    renderRich(el, src);
    return el;
  }

  var ICON = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h5v-6h4v6h5V10"/></svg>',
    admin:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    search:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    arrow:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M9 6l6 6-6 6"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>',
    close:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  };
  function svg(name) {
    return h("span", { class: "row", html: ICON[name], "aria-hidden": "true" });
  }

  // ---------- API ----------
  function api(path, opt) {
    opt = opt || {};
    var init = { method: opt.method || "GET", headers: { "Content-Type": "application/json" } };
    if (opt.body !== undefined) init.body = JSON.stringify(opt.body);
    return fetch(path, init).then(function (r) {
      if (r.status === 204) return null;
      return r.text().then(function (t) {
        var data = null;
        try {
          data = t ? JSON.parse(t) : null;
        } catch {
          data = null;
        }
        if (!r.ok) {
          var err = new Error((data && data.error) || t || "HTTP " + r.status);
          err.status = r.status;
          throw err;
        }
        return data;
      });
    });
  }

  // ---------- toast / dialog ----------
  function toast(msg, kind) {
    var box = $("toasts");
    var el = h("div", {
      class: "toast" + (kind ? " toast-" + kind : ""),
      role: "status",
      text: msg,
    });
    box.appendChild(el);
    setTimeout(function () {
      el.classList.add("is-leaving");
      setTimeout(function () {
        el.remove();
      }, 220);
    }, 2800);
  }
  function confirmDialog(opts) {
    return new Promise(function (resolve) {
      var dlg = $("dialog");
      var body = $("dialog-body");
      clear(body);
      var input = null;
      body.appendChild(h("h3", { class: "title-md", text: opts.title }));
      if (opts.message)
        body.appendChild(h("p", { class: "muted", style: "font-size:14px", text: opts.message }));
      if (opts.input) {
        input = h("input", {
          class: "input",
          value: opts.input.value || "",
          maxLength: 100,
          placeholder: opts.input.placeholder || "",
        });
        body.appendChild(input);
      }
      var fields = opts.fields ? opts.fields(body) : null;
      var done = function (v) {
        dlg.close();
        resolve(v);
      };
      var ok = h("button", {
        class: "btn " + (opts.danger ? "btn-danger" : "btn-primary"),
        type: "button",
        text: opts.okLabel || "OK",
        on: {
          click: function () {
            done(input ? input.value : fields ? fields() : true);
          },
        },
      });
      var cancel = h("button", {
        class: "btn btn-ghost",
        type: "button",
        text: "キャンセル",
        on: {
          click: function () {
            done(null);
          },
        },
      });
      body.appendChild(h("div", { class: "dialog-actions" }, cancel, ok));
      dlg.onclose = function () {
        resolve(null);
      };
      dlg.showModal();
      if (input) {
        input.focus();
        input.select();
        input.addEventListener("keydown", function (e) {
          if (e.key === "Enter") {
            e.preventDefault();
            ok.click();
          }
        });
      }
    });
  }

  // ---------- state ----------
  var state = {
    tree: null, // CategoryTreeNode[]
    summary: {}, // quizId -> AttemptSummary
    session: null, // 出題セッション
    admin: { categories: [], topics: [], quizzes: [], catId: null, topicId: null, quizId: null },
  };

  function loadTree(force) {
    if (state.tree && !force) return Promise.resolve(state.tree);
    return Promise.all([
      api("/api/tree").catch(function () {
        return [];
      }),
      api("/api/attempts/summary").catch(function () {
        return [];
      }),
    ]).then(function (r) {
      state.tree = r[0];
      state.summary = {};
      r[1].forEach(function (s) {
        state.summary[s.quizId] = s;
      });
      return state.tree;
    });
  }
  function findCategory(id) {
    return (
      (state.tree || []).filter(function (c) {
        return c.id === id;
      })[0] || null
    );
  }
  function findQuiz(id) {
    var found = null;
    (state.tree || []).forEach(function (c) {
      c.topics.forEach(function (t) {
        t.quizzes.forEach(function (q) {
          if (q.id === id) found = { quiz: q, topic: t, category: c };
        });
      });
    });
    return found;
  }
  function categoryStats(c) {
    var total = 0,
      tried = 0,
      perfect = 0,
      best = 0;
    c.topics.forEach(function (t) {
      t.quizzes.forEach(function (q) {
        if (q.questionCount < QUESTIONS_PER_QUIZ) return;
        total++;
        var s = state.summary[q.id];
        if (s && s.attemptCount) {
          tried++;
          best += s.bestScore;
          if (s.bestScore >= s.bestTotal && s.bestTotal > 0) perfect++;
        }
      });
    });
    return {
      total: total,
      tried: tried,
      perfect: perfect,
      mastery: total ? Math.round((best / (total * QUESTIONS_PER_QUIZ)) * 100) : 0,
    };
  }

  // ---------- shared UI pieces ----------
  // pct: 0..1, tone: "is-good" | "is-mid" | "is-bad" | "is-full" (旧isFull=true互換)
  function ring(pct, label, size, isFull) {
    var r = 24,
      c = 2 * Math.PI * r;
    var tone = "";
    if (isFull === true) tone = "is-full";
    else if (typeof isFull === "string") tone = isFull;
    else if (pct >= 1) tone = "is-full";
    else if (pct >= 0.7) tone = "is-good";
    else if (pct >= 0.4) tone = "is-mid";
    else tone = "is-bad";
    var el = h("div", { class: "ring" + (size ? " " + size : "") });
    el.innerHTML =
      '<svg viewBox="0 0 56 56"><circle class="ring-bg" cx="28" cy="28" r="' +
      r +
      '"/><circle class="ring-fg ' +
      tone +
      '" cx="28" cy="28" r="' +
      r +
      '" stroke-dasharray="' +
      c +
      '" stroke-dashoffset="' +
      c +
      '"/></svg>';
    var lab = h("div", { class: "ring-label" });
    append(lab, label);
    el.appendChild(lab);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        el.querySelector(".ring-fg").style.strokeDashoffset = String(
          c * (1 - Math.max(0, Math.min(1, pct))),
        );
      });
    });
    return el;
  }
  function stars(n) {
    return h(
      "span",
      { class: "stars", "aria-label": "難易度" + n },
      "★".repeat(n),
      h("span", { class: "stars-dim", text: "★".repeat(5 - n) }),
    );
  }
  function crumbs(items) {
    var el = h("nav", { class: "crumbs", "aria-label": "パンくず" });
    items.forEach(function (it, i) {
      if (i) el.appendChild(h("span", { class: "sep", text: "›" }));
      el.appendChild(
        it.href ? h("a", { href: it.href, text: it.label }) : h("span", { text: it.label }),
      );
    });
    return el;
  }
  function emptyState(glyph, title, sub) {
    return h(
      "div",
      { class: "empty" },
      h("div", { class: "empty-glyph", text: glyph }),
      h("h3", { text: title }),
      sub ? h("p", { class: "muted", text: sub }) : null,
    );
  }
  function skeletons(n) {
    var s = h("div", { class: "stack" });
    for (var i = 0; i < n; i++) s.appendChild(h("div", { class: "skeleton" }));
    return s;
  }
  function fmtDate(s) {
    if (!s) return "";
    var d = new Date(
      String(s).replace(" ", "T") +
        (String(s).indexOf("Z") < 0 && String(s).indexOf("+") < 0 ? "Z" : ""),
    );
    if (isNaN(d.getTime())) return String(s).slice(0, 16);
    return (
      d.getMonth() +
      1 +
      "/" +
      d.getDate() +
      " " +
      String(d.getHours()).padStart(2, "0") +
      ":" +
      String(d.getMinutes()).padStart(2, "0")
    );
  }

  // ---------- router ----------
  var routes = [
    { re: /^#?\/?$/, view: viewHome },
    { re: /^#\/c\/(\d+)$/, view: viewCategory },
    { re: /^#\/play\/(\d+)$/, view: viewPlay, focus: true },
    { re: /^#\/result$/, view: viewResult },
    { re: /^#\/admin$/, view: viewAdmin },
    { re: /^#\/admin\/c\/(\d+)$/, view: viewAdmin },
    { re: /^#\/admin\/t\/(\d+)$/, view: viewAdmin },
    { re: /^#\/admin\/q\/(\d+)$/, view: viewAdmin },
  ];
  var teardown = null;
  function go(hash) {
    location.hash = hash;
  }
  function route() {
    var hash = location.hash || "#/";
    var main = $("main");
    if (teardown) {
      teardown();
      teardown = null;
    }
    document.body.removeAttribute("data-mode");
    for (var i = 0; i < routes.length; i++) {
      var m = hash.match(routes[i].re);
      if (m) {
        if (routes[i].focus) document.body.dataset.mode = "focus";
        setNav(hash.indexOf("#/admin") === 0 ? "admin" : "home");
        clear(main);
        var screen = h("div", { class: "screen" });
        main.appendChild(screen);
        window.scrollTo(0, 0);
        var params = m.slice(1).map(Number);
        var res = routes[i].view(screen, params, hash);
        if (typeof res === "function") teardown = res;
        return;
      }
    }
    go("#/");
  }
  function setNav(which) {
    ["nav-home", "nav-admin", "tab-home", "tab-admin"].forEach(function (id) {
      var el = $(id);
      if (el.dataset.nav === which) el.setAttribute("aria-current", "page");
      else el.removeAttribute("aria-current");
    });
  }
  window.addEventListener("hashchange", route);

  // =========================================================
  // HOME
  // =========================================================
  function viewHome(root) {
    root.appendChild(
      h(
        "header",
        { class: "hero" },
        h("span", { class: "eyebrow", text: "今日のドリル" }),
        h("h1", { class: "title-xl", text: "どれから解く？" }),
        h("p", { class: "muted", text: "カテゴリを選んで、10問ずつ解いていこう。" }),
      ),
    );
    var body = h("div");
    root.appendChild(body);
    body.appendChild(skeletons(3));
    loadTree(true).then(function (tree) {
      clear(body);
      var totals = { total: 0, tried: 0, perfect: 0 };
      tree.forEach(function (c) {
        var s = categoryStats(c);
        totals.total += s.total;
        totals.tried += s.tried;
        totals.perfect += s.perfect;
      });
      body.appendChild(
        h(
          "div",
          { class: "stat-row" },
          h(
            "div",
            { class: "stat" },
            h("div", { class: "stat-v tnum", text: String(totals.total) }),
            h("div", { class: "stat-k", text: "挑戦できるクイズ" }),
          ),
          h(
            "div",
            { class: "stat" },
            h("div", { class: "stat-v tnum", text: String(totals.tried) }),
            h("div", { class: "stat-k", text: "挑戦ずみ" }),
          ),
          h(
            "div",
            { class: "stat" },
            h("div", {
              class: "stat-v tnum",
              style: "color:var(--moegi)",
              text: String(totals.perfect),
            }),
            h("div", { class: "stat-k", text: "満点" }),
          ),
        ),
      );

      if (!tree.length) {
        body.appendChild(
          h(
            "div",
            { class: "card" },
            emptyState(
              "空",
              "まだカテゴリがありません",
              "管理画面からカテゴリ・トピック・クイズを作成してください。",
            ),
          ),
        );
        body.appendChild(
          h(
            "div",
            { class: "row mt", style: "justify-content:center" },
            h("a", { class: "btn btn-primary", href: "#/admin", text: "管理画面へ" }),
          ),
        );
        return;
      }

      body.appendChild(
        h("div", { class: "section-head" }, h("h2", { class: "title-md", text: "カテゴリ" })),
      );
      var grid = h("div", { class: "cat-grid" });
      tree.forEach(function (c) {
        var s = categoryStats(c);
        grid.appendChild(
          h(
            "a",
            { class: "cat-card", href: "#/c/" + c.id },
            ring(s.mastery / 100, s.mastery + "%", null, s.total > 0 && s.perfect === s.total),
            h(
              "div",
              { class: "cat-card-body" },
              h("div", { class: "cat-card-title", text: c.title }),
              h("div", {
                class: "cat-card-meta",
                text: c.topics.length + "トピック · " + s.total + "クイズ · 満点" + s.perfect,
              }),
            ),
            h("span", { class: "cat-card-arrow", html: ICON.arrow, "aria-hidden": "true" }),
          ),
        );
      });
      body.appendChild(grid);

      // 最近の挑戦
      var recent = Object.keys(state.summary)
        .map(function (k) {
          return state.summary[k];
        })
        .filter(function (s) {
          return s.lastCompletedAt;
        })
        .sort(function (a, b) {
          return String(b.lastCompletedAt).localeCompare(String(a.lastCompletedAt));
        })
        .slice(0, 5);
      if (recent.length) {
        body.appendChild(
          h(
            "div",
            { class: "section-head mt" },
            h("h2", { class: "title-md", text: "最近の挑戦" }),
          ),
        );
        var list = h("div", { class: "recent-list" });
        recent.forEach(function (s) {
          var f = findQuiz(s.quizId);
          if (!f) return;
          list.appendChild(
            h(
              "a",
              { class: "recent-item", href: "#/play/" + s.quizId },
              h(
                "div",
                { class: "grow" },
                h("div", { style: "font-weight:700", text: f.quiz.title }),
                h("div", {
                  class: "muted",
                  text:
                    f.category.title + " › " + f.topic.title + " · " + fmtDate(s.lastCompletedAt),
                }),
              ),
              h("div", { class: "recent-score", text: "最高 " + s.bestScore + "/" + s.bestTotal }),
              h("span", { class: "cat-card-arrow", html: ICON.arrow, "aria-hidden": "true" }),
            ),
          );
        });
        body.appendChild(list);
      }
    });
  }

  // =========================================================
  // CATEGORY
  // =========================================================
  function viewCategory(root, params) {
    var catId = params[0];
    var filter = { kw: "", diff: 0 };
    root.appendChild(skeletons(3));
    loadTree().then(function () {
      var c = findCategory(catId);
      clear(root);
      if (!c) {
        root.appendChild(h("div", { class: "card" }, emptyState("？", "カテゴリが見つかりません")));
        return;
      }
      var s = categoryStats(c);
      root.appendChild(crumbs([{ label: "ホーム", href: "#/" }, { label: c.title }]));
      root.appendChild(
        h(
          "header",
          { class: "row mt", style: "gap:16px" },
          ring(s.mastery / 100, s.mastery + "%", null, s.total > 0 && s.perfect === s.total),
          h(
            "div",
            { class: "grow" },
            h("h1", { class: "title-lg", text: c.title }),
            h("p", {
              class: "muted",
              text: s.tried + "/" + s.total + " クイズに挑戦ずみ · 満点 " + s.perfect,
            }),
          ),
        ),
      );

      var search = h(
        "div",
        { class: "search" },
        svg("search"),
        h("input", {
          type: "search",
          placeholder: "クイズ名で検索",
          "aria-label": "クイズを検索",
          on: {
            input: function (e) {
              filter.kw = e.target.value.trim();
              renderList();
            },
          },
        }),
      );
      var diffs = h("div", {
        class: "diff-filter",
        role: "group",
        "aria-label": "難易度で絞り込み",
      });
      [0, 1, 2, 3, 4, 5].forEach(function (d) {
        diffs.appendChild(
          h("button", {
            type: "button",
            class: "chip chip-btn",
            "aria-pressed": d === 0 ? "true" : "false",
            text: d === 0 ? "すべて" : "★" + d,
            dataset: { d: String(d) },
            on: {
              click: function () {
                filter.diff = d;
                diffs.querySelectorAll(".chip-btn").forEach(function (b) {
                  b.setAttribute("aria-pressed", b.dataset.d === String(d) ? "true" : "false");
                });
                renderList();
              },
            },
          }),
        );
      });
      root.appendChild(h("div", { class: "toolbar" }, search, diffs));
      var list = h("div");
      root.appendChild(list);

      function renderList() {
        clear(list);
        var shown = 0;
        c.topics.forEach(function (t) {
          var qs = t.quizzes.filter(function (q) {
            return (
              (!filter.kw || q.title.indexOf(filter.kw) >= 0) &&
              (!filter.diff || q.difficulty === filter.diff)
            );
          });
          if (!qs.length) return;
          shown += qs.length;
          var block = h(
            "section",
            { class: "topic-block" },
            h(
              "div",
              { class: "topic-head" },
              h("h3", { text: t.title }),
              h("span", { class: "count", text: qs.length + " クイズ" }),
            ),
          );
          var ul = h("div", { class: "quiz-list" });
          qs.forEach(function (q) {
            var sm = state.summary[q.id];
            var ready = q.questionCount >= QUESTIONS_PER_QUIZ;
            var perfect = sm && sm.attemptCount && sm.bestScore >= sm.bestTotal && sm.bestTotal > 0;
            var mark = h("div", {
              class:
                "quiz-mark" + (perfect ? " is-perfect" : sm && sm.attemptCount ? " is-tried" : ""),
              text: perfect ? "優" : sm && sm.attemptCount ? "再" : "未",
              "aria-hidden": "true",
            });
            var right = ready
              ? sm && sm.attemptCount
                ? h(
                    "div",
                    { class: "quiz-row-right" },
                    h("strong", { text: sm.bestScore + "/" + sm.bestTotal }),
                    h("span", { text: sm.attemptCount + "回" }),
                  )
                : h(
                    "div",
                    { class: "quiz-row-right" },
                    h("span", { class: "chip chip-moegi", text: "▶ はじめる" }),
                  )
              : h(
                  "div",
                  { class: "quiz-row-right" },
                  h("span", {
                    class: "chip chip-yamabuki",
                    text: "準備中 " + q.questionCount + "/" + QUESTIONS_PER_QUIZ,
                  }),
                );
            ul.appendChild(
              h(
                "button",
                {
                  type: "button",
                  class: "quiz-row",
                  disabled: !ready,
                  title: ready ? "" : "問題が10問そろっていません",
                  on: {
                    click: function () {
                      go("#/play/" + q.id);
                    },
                  },
                },
                mark,
                h(
                  "div",
                  { class: "grow" },
                  h("div", { class: "quiz-row-title", text: q.title }),
                  h("div", { class: "quiz-row-meta" }, stars(q.difficulty)),
                ),
                right,
              ),
            );
          });
          block.appendChild(ul);
          list.appendChild(block);
        });
        if (!shown)
          list.appendChild(
            h(
              "div",
              { class: "card" },
              emptyState(
                "無",
                "該当するクイズがありません",
                filter.kw || filter.diff
                  ? "検索条件を変えてみてください。"
                  : "管理画面でこのカテゴリにクイズを追加してください。",
              ),
            ),
          );
      }
      renderList();
    });
  }

  // =========================================================
  // PLAY
  // =========================================================
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }
  // 中断からの再開: 自分の未完了attemptはlocalStorageに保持する。
  // attempts自体にユーザー概念がなく全体共有のため、他人の挑戦を拾わないよう
  // サーバ状態の検証と組み合わせる (表示順もここに保存し、再開時の並びを復元する)。
  function resumeKey(quizId) {
    return "kmon:resume:" + quizId;
  }
  function readResume(quizId) {
    try {
      var raw = localStorage.getItem(resumeKey(quizId));
      if (!raw) return null;
      var v = JSON.parse(raw);
      if (!v || !v.attemptId || !Array.isArray(v.order) || !v.order.length) return null;
      return v;
    } catch {
      return null;
    }
  }
  function writeResume(quizId, attemptId, order) {
    try {
      localStorage.setItem(
        resumeKey(quizId),
        JSON.stringify({ attemptId: attemptId, order: order }),
      );
    } catch {}
  }
  function clearResume(quizId) {
    try {
      localStorage.removeItem(resumeKey(quizId));
    } catch {}
  }
  function viewPlay(root, params) {
    var quizId = params[0];
    var ses = null;
    var ui = {};
    root.appendChild(
      h(
        "div",
        { class: "play" },
        h(
          "div",
          { class: "play-body" },
          h("div", { class: "muted mt", text: "出題を準備しています…" }),
        ),
      ),
    );

    // 再開チェック: 自分の未完了が残っていれば「つづき/はじめ」を選ばせる。
    // 順序不明・不整合の場合は安全側で新規開始 (position前提の復元を壊さないため)。
    var saved = readResume(quizId);
    if (saved) {
      api("/api/attempts/" + saved.attemptId)
        .then(function (st) {
          if (
            !st ||
            st.completedAt ||
            st.quizId !== quizId ||
            !st.questions ||
            st.questions.length !== saved.order.length ||
            !st.answers ||
            !st.answers.length ||
            st.answers.length >= st.questions.length
          ) {
            if (st && st.completedAt) clearResume(quizId);
            startNew();
            return;
          }
          var byId = {};
          st.questions.forEach(function (q) {
            byId[q.attemptQuestionId] = q;
          });
          var ordered = saved.order.map(function (id) {
            return byId[id];
          });
          if (
            ordered.some(function (q) {
              return !q;
            })
          ) {
            clearResume(quizId);
            startNew();
            return;
          }
          var ansById = {};
          st.answers.forEach(function (a) {
            ansById[a.attemptQuestionId] = a;
          });
          // 回答は表示順のprefixのはず。崩れていたら新規開始する。
          for (var i = 0; i < st.answers.length; i++) {
            if (!ansById[ordered[i].attemptQuestionId]) {
              clearResume(quizId);
              startNew();
              return;
            }
          }
          showResumeChoice(st, ordered, ansById);
        })
        .catch(function () {
          startNew();
        });
    } else {
      startNew();
    }

    function showResumeChoice(st, ordered, ansById) {
      clear(root);
      var done = st.answers.length,
        total = ordered.length;
      root.appendChild(
        h(
          "div",
          { class: "play" },
          h(
            "div",
            { class: "play-body" },
            h(
              "div",
              { class: "card mt" },
              h("h1", { class: "title-md", text: "前回のつづきがあります" }),
              h("p", {
                class: "muted",
                text: done + " / " + total + "問まで回答ずみです。同じ並び順で再開できます。",
              }),
              h(
                "div",
                { class: "row mt", style: "justify-content:center" },
                h("button", {
                  type: "button",
                  class: "btn btn-primary",
                  text: "つづきから",
                  on: {
                    click: function () {
                      restoreSession(st, ordered, ansById);
                    },
                  },
                }),
                h("button", {
                  type: "button",
                  class: "btn",
                  text: "はじめから",
                  on: {
                    click: function () {
                      startNew();
                    },
                  },
                }),
              ),
            ),
          ),
        ),
      );
    }

    function restoreSession(st, ordered, ansById) {
      clear(root);
      root.appendChild(
        h(
          "div",
          { class: "play" },
          h(
            "div",
            { class: "play-body" },
            h("div", { class: "muted mt", text: "つづきを読み込んでいます…" }),
          ),
        ),
      );
      Promise.all([api("/api/quizzes/" + quizId + "/play"), loadTree()])
        .then(function (r) {
          var meta = r[0];
          var answers = [],
            score = 0;
          for (var i = 0; i < st.answers.length; i++) {
            var q = ordered[i],
              a = ansById[q.attemptQuestionId];
            if (a.correct) score++;
            answers.push({
              q: q,
              choice: a.choice,
              ok: a.correct,
              correct: a.correctAnswer,
              exp: a.explanation || "",
            });
          }
          ses = {
            attemptId: st.attemptId,
            quiz: meta.quiz,
            questions: ordered,
            index: answers.length,
            score: score,
            answers: answers,
            answered: false,
          };
          state.session = ses;
          build();
          showQuestion();
          toast("前回のつづきから再開しました", "");
        })
        .catch(function () {
          clearResume(quizId);
          startNew();
        });
    }

    function startNew() {
      clear(root);
      root.appendChild(
        h(
          "div",
          { class: "play" },
          h(
            "div",
            { class: "play-body" },
            h("div", { class: "muted mt", text: "出題を準備しています…" }),
          ),
        ),
      );
      Promise.all([
        api("/api/quizzes/" + quizId + "/play"),
        api("/api/quizzes/" + quizId + "/attempts", { method: "POST" }),
        loadTree(),
      ])
        .then(function (r) {
          var meta = r[0],
            started = r[1];
          var shuffled = shuffle(started.questions || []);
          writeResume(
            quizId,
            started.attemptId,
            shuffled.map(function (q) {
              return q.attemptQuestionId;
            }),
          );
          ses = {
            attemptId: started.attemptId,
            quiz: meta.quiz,
            questions: shuffled,
            index: 0,
            score: 0,
            answers: [],
            answered: false,
          };
          state.session = ses;
          build();
          showQuestion();
        })
        .catch(function (e) {
          clear(root);
          root.appendChild(
            h(
              "div",
              { class: "play" },
              h(
                "div",
                { class: "play-body" },
                h(
                  "div",
                  { class: "card mt" },
                  emptyState("！", "このクイズは開始できません", e.message),
                ),
                h(
                  "div",
                  { class: "row", style: "justify-content:center" },
                  h("button", {
                    type: "button",
                    class: "btn",
                    text: "戻る",
                    on: {
                      click: function () {
                        history.back();
                      },
                    },
                  }),
                ),
              ),
            ),
          );
        });
    }

    function build() {
      clear(root);
      ui.dots = h("div", { class: "play-dots", "aria-hidden": "true" });
      ses.questions.forEach(function () {
        ui.dots.appendChild(h("i", { class: "play-dot" }));
      });
      ui.count = h("div", { class: "play-count", "aria-live": "polite" });
      ui.score = h("div", { class: "play-score", "aria-live": "polite" });
      ui.quit = h("button", {
        type: "button",
        class: "btn btn-icon btn-ghost",
        "aria-label": "やめる",
        html: ICON.close,
        on: { click: quit },
      });
      ui.crumb = h("div", { class: "play-crumb" });
      ui.num = h("div", { class: "q-num" });
      ui.statement = h("h1", { class: "q-statement" });
      ui.stamp = h("div", { class: "stamp", "aria-hidden": "true" });
      ui.choices = h("div", { class: "choices", role: "group", "aria-label": "選択肢" });
      ui.sheetCard = h("div", { class: "sheet-card" });
      ui.sheet = h("div", { class: "sheet" }, ui.sheetCard);
      root.appendChild(
        h(
          "div",
          { class: "play" },
          h("div", { class: "play-top" }, ui.quit, ui.dots, ui.score, ui.count),
          h(
            "div",
            { class: "play-body" },
            ui.crumb,
            h("div", { class: "q-wrap" }, ui.num, ui.statement, ui.stamp),
            ui.choices,
            h(
              "p",
              { class: "muted", style: "text-align:center" },
              h("span", { class: "kbd", text: "1" }),
              " – ",
              h("span", { class: "kbd", text: "4" }),
              " で回答 · ",
              h("span", { class: "kbd", text: "Enter" }),
              " で次へ",
            ),
          ),
          ui.sheet,
        ),
      );
      ui.crumb.textContent =
        ses.quiz.categoryTitle + " › " + ses.quiz.topicTitle + " › " + ses.quiz.title + " ";
      ui.crumb.appendChild(stars(ses.quiz.difficulty));
    }

    function updateScore() {
      var answered = ses.answers.length;
      var okCount = ses.score;
      ui.score.textContent = "○" + okCount + " ×" + (answered - okCount);
      ui.score.className =
        "play-score" + (answered ? (okCount / answered >= 0.5 ? " is-ok" : " is-ng") : "");
    }
    function showQuestion() {
      var q = ses.questions[ses.index];
      ses.answered = false;
      ui.count.textContent = "Q" + (ses.index + 1) + " / " + ses.questions.length;
      updateScore();
      ui.num.textContent = "第 " + (ses.index + 1) + " 問";
      renderRich(ui.statement, q.statement);
      ui.stamp.className = "stamp";
      ui.sheet.classList.remove("is-open");
      Array.prototype.forEach.call(ui.dots.children, function (d, i) {
        var a = ses.answers[i];
        d.className =
          "play-dot" + (a ? (a.ok ? " is-ok" : " is-ng") : i === ses.index ? " is-now" : "");
      });
      clear(ui.choices);
      q.choices.forEach(function (text, i) {
        var label = h("span", { class: "choice-label" });
        renderRich(label, text);
        ui.choices.appendChild(
          h(
            "button",
            {
              type: "button",
              class: "choice",
              on: {
                click: function () {
                  answer(q, i + 1);
                },
              },
            },
            h("span", { class: "choice-key", text: String(i + 1), "aria-hidden": "true" }),
            label,
          ),
        );
      });
      window.scrollTo(0, 0);
    }

    function answer(q, choice) {
      if (ses.answered) return;
      ses.answered = true;
      var btns = ui.choices.children;
      Array.prototype.forEach.call(btns, function (b) {
        b.disabled = true;
      });
      api("/api/attempts/" + ses.attemptId + "/answers", {
        method: "POST",
        body: { attemptQuestionId: q.attemptQuestionId, choice: choice },
      })
        .then(function (res) {
          var ok = !!res.correct;
          if (ok) ses.score++;
          ses.answers.push({
            q: q,
            choice: choice,
            ok: ok,
            correct: res.correctAnswer,
            exp: res.explanation || "",
          });
          Array.prototype.forEach.call(btns, function (b, k) {
            if (k + 1 === res.correctAnswer) {
              b.classList.add("is-correct");
              b.appendChild(h("span", { class: "choice-mark", text: "○", "aria-hidden": "true" }));
            } else if (k + 1 === choice) {
              b.classList.add("is-wrong");
              b.appendChild(h("span", { class: "choice-mark", text: "×", "aria-hidden": "true" }));
            } else b.classList.add("is-dim");
          });
          ui.dots.children[ses.index].className = "play-dot " + (ok ? "is-ok" : "is-ng");
          updateScore();
          ui.stamp.textContent = ok ? "○" : "×";
          ui.stamp.className = "stamp show " + (ok ? "is-ok" : "is-ng");
          var last = ses.index + 1 >= ses.questions.length;
          clear(ui.sheetCard);
          ui.sheetCard.className = "sheet-card " + (ok ? "is-ok" : "is-ng");
          ui.sheetCard.appendChild(
            h(
              "div",
              { class: "sheet-title" },
              h("span", {
                class: "sheet-badge",
                text: ok ? "○" : "×",
                "aria-hidden": "true",
              }),
              h("span", { text: ok ? "正解！" : "不正解… 正解は " + res.correctAnswer + " 番" }),
              h("span", {
                class: "sheet-score",
                text: "現在 " + ses.score + " / " + (ses.index + 1) + " 正解",
              }),
              h("span", { class: "kbd", text: "Enter" }),
            ),
          );
          ui.sheetCard.appendChild(
            richEl("div", "sheet-exp", res.explanation || "（解説はありません）"),
          );
          ui.next = h("button", {
            type: "button",
            class: "btn " + (last ? "btn-primary" : "btn-ink"),
            text: last ? "結果を見る" : "次の問題 →",
            on: { click: next },
          });
          ui.sheetCard.appendChild(h("div", { class: "sheet-actions" }, ui.next));
          ui.sheet.classList.add("is-open");
          ui.next.focus({ preventScroll: true });
        })
        .catch(function (e) {
          ses.answered = false;
          Array.prototype.forEach.call(btns, function (b) {
            b.disabled = false;
          });
          toast(e.message || "回答を送信できませんでした", "ng");
        });
    }

    function next() {
      if (!ses.answered) return;
      if (ses.index + 1 < ses.questions.length) {
        ses.index++;
        showQuestion();
      } else go("#/result");
    }
    function quit() {
      confirmDialog({
        title: "途中でやめますか？",
        message: "ここまでの回答は記録されます。このブラウザからは次回つづきから再開できます。",
        okLabel: "やめる",
        danger: true,
      }).then(function (yes) {
        if (yes) go("#/c/" + ses.quiz.categoryId);
      });
    }
    function onKey(e) {
      if (!ses || e.metaKey || e.ctrlKey || e.altKey) return;
      if ($("dialog").open) return;
      if (e.key >= "1" && e.key <= "4" && !ses.answered) {
        var b = ui.choices.children[Number(e.key) - 1];
        if (b) {
          e.preventDefault();
          b.click();
        }
      } else if ((e.key === "Enter" || e.key === " " || e.key === "ArrowRight") && ses.answered) {
        e.preventDefault();
        next();
      }
    }
    document.addEventListener("keydown", onKey);
    return function () {
      document.removeEventListener("keydown", onKey);
    };
  }

  // =========================================================
  // RESULT
  // =========================================================
  function viewResult(root) {
    var ses = state.session;
    if (!ses || !ses.answers.length) {
      go("#/");
      return;
    }
    var total = ses.questions.length;
    var hero = h("div", { class: "result-hero" });
    root.appendChild(hero);
    hero.appendChild(h("div", { class: "muted", text: "採点中…" }));

    var resumeQuizId = ses.quiz.id;
    api("/api/attempts/" + ses.attemptId + "/complete", { method: "POST" })
      .then(function (done) {
        clearResume(resumeQuizId);
        return done;
      })
      .catch(function () {
        return { score: ses.score, total: total };
      })
      .then(function (done) {
        ses.score = done.score;
        var pct = total ? ses.score / total : 0;
        var perfect = ses.score === total;
        var tone = perfect ? "is-full" : pct >= 0.7 ? "is-good" : pct >= 0.4 ? "is-mid" : "is-bad";
        var msgTone = perfect || pct >= 0.7 ? "is-good" : pct >= 0.4 ? "is-mid" : "is-bad";
        var ngCount = total - ses.score;
        clear(hero);
        hero.appendChild(h("span", { class: "eyebrow", text: ses.quiz.title }));
        var ringEl = ring(
          pct,
          [h("strong", { text: String(ses.score) }), h("small", { text: "/ " + total })],
          "score-ring " + tone,
          tone,
        );
        hero.appendChild(ringEl);
        hero.appendChild(
          h("div", {
            class: "result-msg " + msgTone,
            text: perfect
              ? "○ 全問正解！すばらしい！"
              : pct >= 0.7
                ? "○ よくできました！"
                : pct >= 0.4
                  ? "× もう少し！復習しよう"
                  : "× ここからが本番。もう一度！",
          }),
        );
        hero.appendChild(
          h(
            "div",
            { class: "result-score-chips" },
            h("span", { class: "score-chip is-ok", text: "○ " + ses.score + "問 正解" }),
            h("span", { class: "score-chip is-ng", text: "× " + ngCount + "問 不正解" }),
            h("span", {
              class: "score-chip is-rate",
              text: "正答率 " + Math.round(pct * 100) + "%",
            }),
          ),
        );
        hero.appendChild(
          h("div", {
            class: "result-sub",
            text: ses.quiz.categoryTitle + " › " + ses.quiz.topicTitle,
          }),
        );
        hero.appendChild(
          h(
            "div",
            { class: "result-actions" },
            h("button", {
              type: "button",
              class: "btn btn-primary btn-lg",
              text: "もう一度",
              on: {
                click: function () {
                  go("#/play/" + ses.quiz.id);
                },
              },
            }),
            h("a", {
              class: "btn btn-lg",
              href: "#/c/" + ses.quiz.categoryId,
              text: "他のクイズへ",
            }),
          ),
        );

        var grid = h("div", { class: "result-grid" });
        root.appendChild(grid);
        var review = h("div", { class: "review" });
        ses.answers.forEach(function (a, i) {
          var d = h("details", { class: "review-item " + (a.ok ? "is-ok" : "is-ng") });
          if (!a.ok) d.open = true;
          var sumStatement = h("span", { class: "review-statement" });
          renderRich(sumStatement, a.q.statement);
          var judge = h("span", {
            class: "review-judge " + (a.ok ? "is-ok" : "is-ng"),
            text: a.ok ? "正解" : "不正解",
          });
          var sumWrap = h(
            "span",
            { class: "grow" },
            h("span", { text: "第" + (i + 1) + "問　" }),
            sumStatement,
            judge,
          );
          d.appendChild(
            h(
              "summary",
              {},
              h("span", {
                class: "review-mark " + (a.ok ? "is-ok" : "is-ng"),
                text: a.ok ? "○" : "×",
                "aria-hidden": "true",
              }),
              sumWrap,
            ),
          );
          var yourPrefix = h("div", {
            class: "review-your " + (a.ok ? "is-ok" : "is-ng"),
            text: (a.ok ? "○ あなたの回答: " : "× あなたの回答: ") + a.choice + ". ",
          });
          yourPrefix.appendChild(richEl("span", "review-inline", a.q.choices[a.choice - 1]));
          var bodyChildren = [yourPrefix];
          if (!a.ok) {
            var correctPrefix = h("div", {
              class: "review-correct",
              text: "○ 正解: " + a.correct + ". ",
            });
            correctPrefix.appendChild(richEl("span", "review-inline", a.q.choices[a.correct - 1]));
            bodyChildren.push(correctPrefix);
          }
          if (a.exp) bodyChildren.push(richEl("div", "exp", a.exp));
          d.appendChild(h("div", { class: "review-body" }, bodyChildren));
          review.appendChild(d);
        });
        grid.appendChild(
          h(
            "section",
            {},
            h(
              "div",
              { class: "section-head" },
              h("h2", { class: "title-md", text: "ふりかえり" }),
              h("span", { class: "muted", text: "まちがえた問題は開いています" }),
            ),
            review,
          ),
        );

        var hist = h("div", { class: "history" }, h("div", { class: "skeleton" }));
        grid.appendChild(
          h(
            "section",
            {},
            h(
              "div",
              { class: "section-head" },
              h("h2", { class: "title-md", text: "このクイズの記録" }),
            ),
            hist,
          ),
        );
        api("/api/quizzes/" + ses.quiz.id + "/attempts?limit=8")
          .then(function (rows) {
            clear(hist);
            rows = rows.filter(function (r) {
              return r.completedAt;
            });
            if (!rows.length) {
              hist.appendChild(h("p", { class: "muted", text: "まだ記録がありません" }));
              return;
            }
            rows.forEach(function (r) {
              var now = r.id === ses.attemptId;
              var rpct = r.total ? r.score / r.total : 0;
              var barTone = rpct >= 0.7 ? "" : rpct >= 0.4 ? "is-mid" : "is-low";
              var scoreTone = rpct >= 0.7 ? "is-good" : rpct >= 0.4 ? "" : "is-bad";
              hist.appendChild(
                h(
                  "div",
                  { class: "history-row" + (now ? " is-now" : "") },
                  h(
                    "div",
                    {},
                    h("div", { text: (now ? "今回 · " : "") + fmtDate(r.completedAt) }),
                    h(
                      "div",
                      { class: "history-bar" },
                      h("i", {
                        class: barTone,
                        style: "width:" + rpct * 100 + "%",
                      }),
                    ),
                  ),
                  h("strong", {
                    class: "tnum " + scoreTone,
                    text: (rpct >= 1 ? "○ " : rpct < 0.4 ? "× " : "") + r.score + " / " + r.total,
                  }),
                ),
              );
            });
          })
          .catch(function () {
            clear(hist);
            hist.appendChild(h("p", { class: "muted", text: "記録を取得できませんでした" }));
          });

        loadTree(true);
      });
  }

  // =========================================================
  // ADMIN
  // =========================================================
  function viewAdmin(root, params, hash) {
    var A = state.admin;
    var kind =
      hash.indexOf("#/admin/c/") === 0
        ? "c"
        : hash.indexOf("#/admin/t/") === 0
          ? "t"
          : hash.indexOf("#/admin/q/") === 0
            ? "q"
            : "";
    var id = params[0];

    var side = h("aside", { class: "admin-side" });
    var mainCol = h("div", { class: "admin-main" });
    root.appendChild(h("div", { class: "admin" }, side, mainCol));
    side.appendChild(skeletons(2));
    mainCol.appendChild(skeletons(2));

    // URL から選択状態を復元 (quiz → topic → category を逆引き)
    resolveSelection().then(function () {
      renderSide();
      renderMain();
    });

    function resolveSelection() {
      A.catId = A.topicId = A.quizId = null;
      return api("/api/categories").then(function (cats) {
        A.categories = cats;
        if (kind === "c") {
          A.catId = id;
          return loadTopics();
        }
        if (kind === "t") {
          return api("/api/topics").then(function (all) {
            var t = all.filter(function (x) {
              return x.id === id;
            })[0];
            if (!t) return null;
            A.catId = t.categoryId;
            A.topicId = t.id;
            return loadTopics().then(loadQuizzes);
          });
        }
        if (kind === "q") {
          return api("/api/quizzes").then(function (all) {
            var q = all.filter(function (x) {
              return x.id === id;
            })[0];
            if (!q) return null;
            A.quizId = q.id;
            A.topicId = q.topicId;
            A.catId = q.categoryId;
            return loadTopics().then(loadQuizzes);
          });
        }
        return null;
      });
    }
    function loadTopics() {
      return A.catId
        ? api("/api/topics?categoryId=" + A.catId).then(function (t) {
            A.topics = t;
          })
        : Promise.resolve((A.topics = []));
    }
    function loadQuizzes() {
      return A.topicId
        ? api("/api/quizzes?topicId=" + A.topicId).then(function (q) {
            A.quizzes = q;
          })
        : Promise.resolve((A.quizzes = []));
    }
    function refreshAll() {
      state.tree = null;
      return resolveSelection().then(function () {
        renderSide();
        renderMain();
      });
    }

    // ---- side: category / topic tree ----
    function renderSide() {
      clear(side);
      var catBox = h("div", { class: "card card-pad" });
      catBox.appendChild(
        h(
          "div",
          { class: "side-title" },
          h("span", { text: "カテゴリ" }),
          h("span", { text: A.categories.length + "件" }),
        ),
      );
      var lv = h("div", { class: "tree-level", role: "list" });
      A.categories.forEach(function (c) {
        lv.appendChild(
          h(
            "button",
            {
              type: "button",
              class: "tree-item",
              role: "listitem",
              "aria-current": A.catId === c.id ? "true" : null,
              on: {
                click: function () {
                  go("#/admin/c/" + c.id);
                },
              },
            },
            h("span", { class: "grow", text: c.title }),
            h("span", { class: "count", text: (c.quizCount || 0) + "Q" }),
          ),
        );
      });
      if (!A.categories.length) lv.appendChild(h("p", { class: "muted", text: "まだありません" }));
      catBox.appendChild(lv);
      catBox.appendChild(
        addForm("新しいカテゴリ", function (title) {
          return api("/api/categories", { method: "POST", body: { title: title } }).then(
            function (r) {
              toast("カテゴリを追加しました", "ok");
              go("#/admin/c/" + r.id);
              if (kind === "c" && r.id === id) refreshAll();
            },
          );
        }),
      );
      side.appendChild(catBox);

      if (A.catId) {
        var cat = A.categories.filter(function (c) {
          return c.id === A.catId;
        })[0];
        var tBox = h("div", { class: "card card-pad" });
        tBox.appendChild(
          h(
            "div",
            { class: "side-title" },
            h("span", { text: (cat ? cat.title : "") + " のトピック" }),
            h("span", { text: A.topics.length + "件" }),
          ),
        );
        var tl = h("div", { class: "tree-level", role: "list" });
        A.topics.forEach(function (t) {
          tl.appendChild(
            h(
              "button",
              {
                type: "button",
                class: "tree-item",
                role: "listitem",
                "aria-current": A.topicId === t.id ? "true" : null,
                on: {
                  click: function () {
                    go("#/admin/t/" + t.id);
                  },
                },
              },
              h("span", { class: "grow", text: t.title }),
              h("span", { class: "count", text: (t.quizCount || 0) + "Q" }),
            ),
          );
        });
        if (!A.topics.length) tl.appendChild(h("p", { class: "muted", text: "まだありません" }));
        tBox.appendChild(tl);
        tBox.appendChild(
          addForm("新しいトピック", function (title) {
            return api("/api/topics", {
              method: "POST",
              body: { categoryId: A.catId, title: title },
            }).then(function (r) {
              toast("トピックを追加しました", "ok");
              go("#/admin/t/" + r.id);
            });
          }),
        );
        side.appendChild(tBox);
      }
    }
    function addForm(placeholder, onAdd) {
      var input = h("input", {
        class: "input",
        placeholder: placeholder,
        maxLength: 100,
        "aria-label": placeholder,
      });
      var btn = h("button", {
        type: "button",
        class: "btn btn-icon btn-ink",
        "aria-label": "追加",
        html: ICON.plus,
      });
      var submit = function () {
        var v = input.value.trim();
        if (!v) {
          input.focus();
          return;
        }
        btn.disabled = true;
        onAdd(v)
          .then(function () {
            input.value = "";
          })
          .catch(function (e) {
            toast(e.message, "ng");
          })
          .then(function () {
            btn.disabled = false;
          });
      };
      btn.addEventListener("click", submit);
      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          submit();
        }
      });
      return h("div", { class: "tree-add" }, input, btn);
    }

    // ---- main ----
    function renderMain() {
      clear(mainCol);
      if (!A.catId) {
        mainCol.appendChild(
          h(
            "div",
            { class: "card" },
            emptyState(
              "管",
              "管理画面",
              "左のリストからカテゴリを選ぶか、新しく作成してください。カテゴリ › トピック › クイズ (10問) の順に作ります。",
            ),
          ),
        );
        mainCol.appendChild(jsonImportCard());
        return;
      }
      var cat = A.categories.filter(function (c) {
        return c.id === A.catId;
      })[0];
      if (!cat) {
        mainCol.appendChild(
          h("div", { class: "card" }, emptyState("？", "カテゴリが見つかりません")),
        );
        return;
      }

      if (!A.topicId) {
        mainCol.appendChild(
          entityHead("カテゴリ", cat.title, [
            {
              label: "名前を変更",
              fn: function () {
                renameEntity("カテゴリ名を変更", cat.title, "/api/categories/" + cat.id);
              },
            },
            {
              label: "削除",
              danger: true,
              fn: function () {
                deleteEntity(
                  "カテゴリ「" + cat.title + "」を削除しますか？",
                  "配下のトピック・クイズ・問題もすべて削除されます。",
                  "/api/categories/" + cat.id,
                  "#/admin",
                );
              },
            },
          ]),
        );
        mainCol.appendChild(
          h(
            "div",
            { class: "card" },
            emptyState(
              "題",
              A.topics.length ? "トピックを選んでください" : "最初のトピックを作りましょう",
              A.topics.length
                ? "左の一覧からトピックを選ぶと、クイズを管理できます。"
                : "左の「新しいトピック」から追加できます。",
            ),
          ),
        );
        return;
      }
      var topic = A.topics.filter(function (t) {
        return t.id === A.topicId;
      })[0];
      if (!topic) {
        mainCol.appendChild(
          h("div", { class: "card" }, emptyState("？", "トピックが見つかりません")),
        );
        return;
      }

      mainCol.appendChild(
        crumbs([
          { label: "管理", href: "#/admin" },
          { label: cat.title, href: "#/admin/c/" + cat.id },
          { label: topic.title, href: A.quizId ? "#/admin/t/" + topic.id : null },
        ]),
      );

      if (!A.quizId) {
        mainCol.appendChild(
          entityHead("トピック", topic.title, [
            {
              label: "名前を変更",
              fn: function () {
                renameEntity("トピック名を変更", topic.title, "/api/topics/" + topic.id);
              },
            },
            {
              label: "削除",
              danger: true,
              fn: function () {
                deleteEntity(
                  "トピック「" + topic.title + "」を削除しますか？",
                  "配下のクイズ・問題もすべて削除されます。",
                  "/api/topics/" + topic.id,
                  "#/admin/c/" + cat.id,
                );
              },
            },
          ]),
        );
        mainCol.appendChild(quizCreateCard());
        mainCol.appendChild(
          h(
            "div",
            { class: "section-head" },
            h("h2", { class: "title-md", text: "クイズ" }),
            h("span", { class: "muted", text: A.quizzes.length + "件" }),
          ),
        );
        var list = h("div", { class: "admin-quiz-list" });
        if (!A.quizzes.length)
          list.appendChild(
            h(
              "div",
              { class: "card" },
              emptyState("問", "クイズがありません", "上のフォームから作成してください。"),
            ),
          );
        A.quizzes.forEach(function (q) {
          list.appendChild(quizRow(q));
        });
        mainCol.appendChild(list);
        mainCol.appendChild(jsonImportCard());
        return;
      }
      var quiz = A.quizzes.filter(function (q) {
        return q.id === A.quizId;
      })[0];
      if (!quiz) {
        mainCol.appendChild(
          h("div", { class: "card" }, emptyState("？", "クイズが見つかりません")),
        );
        return;
      }
      mainCol.appendChild(
        entityHead(
          "クイズ",
          quiz.title,
          [
            {
              label: "設定",
              fn: function () {
                editQuizDialog(quiz);
              },
            },
            {
              label: "削除",
              danger: true,
              fn: function () {
                deleteEntity(
                  "クイズ「" + quiz.title + "」を削除しますか？",
                  "配下の問題もすべて削除されます。",
                  "/api/quizzes/" + quiz.id,
                  "#/admin/t/" + topic.id,
                );
              },
            },
          ],
          h("div", { class: "row wrap" }, stars(quiz.difficulty), statusChip(quiz.status)),
        ),
      );
      renderEditor(quiz);
    }

    function entityHead(kind, title, actions, extra) {
      var acts = h("div", { class: "entity-actions" });
      actions.forEach(function (a) {
        acts.appendChild(
          h("button", {
            type: "button",
            class: "btn btn-sm " + (a.danger ? "btn-danger" : ""),
            text: a.label,
            on: { click: a.fn },
          }),
        );
      });
      return h(
        "header",
        { class: "entity-head" },
        h(
          "div",
          { class: "grow" },
          h("span", { class: "eyebrow", text: kind }),
          h("h1", { class: "title-lg", text: title }),
          extra || null,
        ),
        acts,
      );
    }
    function statusChip(s) {
      var map = {
        published: ["公開中", "chip-moegi"],
        draft: ["下書き", "chip-yamabuki"],
        archived: ["公開終了", "chip-outline"],
      };
      var m = map[s] || [s, ""];
      return h("span", { class: "chip " + m[1], text: m[0] });
    }
    function renameEntity(title, current, path) {
      confirmDialog({ title: title, input: { value: current }, okLabel: "保存" }).then(
        function (v) {
          if (v == null) return;
          v = String(v).trim();
          if (!v) {
            toast("名前を入力してください", "ng");
            return;
          }
          api(path, { method: "PUT", body: { title: v } })
            .then(function () {
              toast("保存しました", "ok");
              refreshAll();
            })
            .catch(function (e) {
              toast(e.message, "ng");
            });
        },
      );
    }
    function deleteEntity(title, message, path, after) {
      confirmDialog({ title: title, message: message, okLabel: "削除する", danger: true }).then(
        function (yes) {
          if (!yes) return;
          api(path, { method: "DELETE" })
            .then(function () {
              toast("削除しました", "ok");
              state.tree = null;
              go(after);
              if (location.hash === after) refreshAll();
            })
            .catch(function (e) {
              toast(e.message, "ng");
            });
        },
      );
    }

    function difficultySelect(value) {
      var s = h("select", { class: "select", "aria-label": "難易度" });
      for (var n = 1; n <= 5; n++)
        s.appendChild(h("option", { value: String(n), text: "★" + n, selected: n === value }));
      return s;
    }
    function statusSelect(value) {
      var s = h("select", { class: "select", "aria-label": "公開状態" });
      [
        ["published", "公開中"],
        ["draft", "下書き"],
        ["archived", "公開終了"],
      ].forEach(function (p) {
        s.appendChild(h("option", { value: p[0], text: p[1], selected: p[0] === value }));
      });
      return s;
    }
    function quizCreateCard() {
      var title = h("input", {
        class: "input",
        placeholder: "クイズ名（例: くり上がりあり）",
        maxLength: 100,
        "aria-label": "クイズ名",
      });
      var diff = difficultySelect(3);
      var st = statusSelect("published");
      var btn = h("button", { type: "button", class: "btn btn-ink", text: "クイズを作成" });
      var submit = function () {
        var v = title.value.trim();
        if (!v) {
          title.focus();
          return;
        }
        btn.disabled = true;
        api("/api/quizzes", {
          method: "POST",
          body: { topicId: A.topicId, title: v, difficulty: Number(diff.value), status: st.value },
        })
          .then(function (r) {
            toast("クイズを作成しました。問題を登録しましょう", "ok");
            state.tree = null;
            go("#/admin/q/" + r.id);
          })
          .catch(function (e) {
            toast(e.message, "ng");
            btn.disabled = false;
          });
      };
      btn.addEventListener("click", submit);
      title.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          submit();
        }
      });
      return h(
        "div",
        { class: "card card-pad" },
        h("div", { class: "side-title" }, h("span", { text: "新しいクイズ" })),
        h("div", { class: "form-grid cols-3" }, title, diff, st),
        h("div", { class: "row mt", style: "justify-content:flex-end" }, btn),
      );
    }
    // ---- JSON一括取込 (data/quizzes/*.json と同形式をフォームから登録) ----
    function parseQuizJson(text) {
      var data = JSON.parse(text);
      if (!data || typeof data !== "object" || Array.isArray(data))
        throw new Error("JSONはオブジェクトである必要があります");
      var category = data.category,
        topic = data.topic,
        quiz = data.quiz,
        questions = data.questions;
      if (typeof category !== "string" || !category.trim())
        throw new Error("category は1〜100文字の文字列が必須です");
      if (typeof topic !== "string" || !topic.trim())
        throw new Error("topic は1〜100文字の文字列が必須です");
      if (!quiz || typeof quiz !== "object" || typeof quiz.title !== "string" || !quiz.title.trim())
        throw new Error("quiz.title は1〜100文字の文字列が必須です");
      if (!Array.isArray(questions) || questions.length !== QUESTIONS_PER_QUIZ)
        throw new Error(
          "questions はちょうど" +
            QUESTIONS_PER_QUIZ +
            "問必要です (現在" +
            (Array.isArray(questions) ? questions.length : "非配列") +
            "問)",
        );
      return {
        category: category.trim(),
        topic: topic.trim(),
        title: quiz.title.trim(),
        count: questions.length,
      };
    }
    function jsonImportCard() {
      var ta = h("textarea", {
        class: "textarea code-input",
        style: "min-height:180px",
        placeholder:
          '{\n  "category": "プログラミング",\n  "topic": "Golang",\n  "quiz": { "title": "Golang基礎1", "difficulty": 1, "status": "draft" },\n  "questions": [ { "statement": "...", "choice1": "...", "choice2": "...", "choice3": "...", "choice4": "...", "answer": 1, "explanation": "..." } ]\n} の形式で貼り付け (10問)',
        "aria-label": "クイズJSON",
        spellcheck: "false",
      });
      var fileInput = h("input", {
        type: "file",
        accept: ".json,application/json",
        "aria-label": "JSONファイルを選択",
      });
      var msg = h("p", {
        class: "muted",
        text: "category / topic は同名再利用、quiz重複は中断、status省略時はdraftになります。",
      });
      var preview = h("div");
      var submitBtn = h("button", {
        type: "button",
        class: "btn btn-primary",
        text: "JSONで登録する",
      });
      var checkBtn = h("button", { type: "button", class: "btn btn-sm", text: "内容を確認" });
      var sampleBtn = h("button", {
        type: "button",
        class: "btn btn-sm btn-ghost",
        text: "雛形を入れる",
      });
      var check = function () {
        clear(preview);
        var raw = ta.value.trim();
        if (!raw) {
          msg.textContent = "JSONを貼り付けか、ファイルを選択してください。";
          return null;
        }
        try {
          var summary = parseQuizJson(raw);
          msg.textContent = "";
          preview.appendChild(
            h(
              "div",
              { class: "chip chip-moegi" },
              h("span", {
                text:
                  "「" +
                  summary.category +
                  " › " +
                  summary.topic +
                  " › " +
                  summary.title +
                  "」 " +
                  summary.count +
                  "問",
              }),
            ),
          );
          return JSON.parse(raw);
        } catch (e) {
          msg.textContent = "エラー: " + (e && e.message ? e.message : String(e));
          return null;
        }
      };
      checkBtn.addEventListener("click", check);
      ta.addEventListener("input", function () {
        msg.textContent = "";
        clear(preview);
      });
      fileInput.addEventListener("change", function () {
        var f = fileInput.files && fileInput.files[0];
        if (!f) return;
        var reader = new FileReader();
        reader.onload = function () {
          ta.value = String(reader.result || "");
          check();
        };
        reader.onerror = function () {
          msg.textContent = "エラー: ファイルを読み込めませんでした";
        };
        reader.readAsText(f);
      });
      sampleBtn.addEventListener("click", function () {
        ta.value = JSON.stringify(
          {
            category: "プログラミング",
            topic: "Golang",
            quiz: { title: "Golang基礎1", difficulty: 1, status: "draft" },
            questions: [
              {
                statement: "問題文",
                choice1: "選択肢1",
                choice2: "選択肢2",
                choice3: "選択肢3",
                choice4: "選択肢4",
                answer: 1,
                explanation: "解説",
              },
            ],
          },
          null,
          2,
        );
        msg.textContent = "雛形を入れました。questionsを10問に増やして登録してください。";
        clear(preview);
        ta.focus();
      });
      submitBtn.addEventListener("click", function () {
        var body = check();
        if (!body) {
          if (!msg.textContent) msg.textContent = "エラー: 先に内容を確認してください";
          return;
        }
        submitBtn.disabled = true;
        msg.textContent = "登録中…";
        api("/api/quizzes/import", { method: "POST", body: body })
          .then(function (r) {
            toast("クイズを登録しました (" + r.count + "問)", "ok");
            state.tree = null;
            ta.value = "";
            fileInput.value = "";
            clear(preview);
            msg.textContent = "";
            go("#/admin/q/" + r.quizId);
            if (location.hash === "#/admin/q/" + r.quizId) refreshAll();
            else refreshAll();
          })
          .catch(function (e) {
            msg.textContent = "エラー: " + e.message;
            toast(e.message, "ng");
          })
          .then(function () {
            submitBtn.disabled = false;
          });
      });
      return h(
        "div",
        { class: "card card-pad" },
        h("div", { class: "side-title" }, h("span", { text: "JSONで一括登録 (10問)" })),
        h(
          "div",
          { class: "field" },
          h("span", { class: "label", text: "JSONファイル" }),
          fileInput,
        ),
        h(
          "div",
          { class: "field mt" },
          h("span", { class: "label", text: "JSON貼り付け" }),
          ta,
          h("span", {
            class: "muted",
            text: "data/quizzes/example.json と同形式。questionsは10問ちょうど。",
          }),
        ),
        h("div", { class: "row mt wrap" }, checkBtn, sampleBtn, preview),
        msg,
        h("div", { class: "row mt", style: "justify-content:flex-end" }, submitBtn),
      );
    }
    function quizRow(q) {
      var full = q.questionCount >= QUESTIONS_PER_QUIZ;
      return h(
        "div",
        { class: "admin-quiz" },
        h(
          "div",
          { class: "grow" },
          h(
            "div",
            { class: "admin-quiz-title" },
            h("span", { text: q.title }),
            statusChip(q.status),
          ),
          h(
            "div",
            { class: "admin-quiz-meta" },
            stars(q.difficulty),
            h(
              "span",
              { class: "qc-bar", "aria-hidden": "true" },
              h("i", {
                class: full ? "is-full" : "",
                style: "width:" + (q.questionCount / QUESTIONS_PER_QUIZ) * 100 + "%",
              }),
            ),
            h("span", {
              text: q.questionCount + "/" + QUESTIONS_PER_QUIZ + "問" + (full ? "" : "（未完成）"),
            }),
          ),
        ),
        h(
          "div",
          { class: "entity-actions" },
          h("button", {
            type: "button",
            class: "btn btn-sm btn-ghost",
            text: "設定",
            on: {
              click: function () {
                editQuizDialog(q);
              },
            },
          }),
          h("button", {
            type: "button",
            class: "btn btn-sm btn-ink",
            text: "問題を編集",
            on: {
              click: function () {
                go("#/admin/q/" + q.id);
              },
            },
          }),
        ),
      );
    }
    function editQuizDialog(q) {
      var title, diff, st;
      confirmDialog({
        title: "クイズの設定",
        okLabel: "保存",
        fields: function (body) {
          title = h("input", {
            class: "input",
            value: q.title,
            maxLength: 100,
            "aria-label": "クイズ名",
          });
          diff = difficultySelect(q.difficulty);
          st = statusSelect(q.status);
          body.appendChild(
            h(
              "div",
              { class: "form-grid" },
              h(
                "label",
                { class: "field" },
                h("span", { class: "label", text: "クイズ名" }),
                title,
              ),
              h(
                "div",
                { class: "form-grid cols-2" },
                h("label", { class: "field" }, h("span", { class: "label", text: "難易度" }), diff),
                h("label", { class: "field" }, h("span", { class: "label", text: "公開状態" }), st),
              ),
            ),
          );
          return function () {
            return { title: title.value.trim(), difficulty: Number(diff.value), status: st.value };
          };
        },
      }).then(function (v) {
        if (!v) return;
        if (!v.title) {
          toast("クイズ名を入力してください", "ng");
          return;
        }
        api("/api/quizzes/" + q.id, { method: "PUT", body: v })
          .then(function () {
            toast("保存しました", "ok");
            refreshAll();
          })
          .catch(function (e) {
            toast(e.message, "ng");
          });
      });
    }

    // ---- question editor (ステッパー式: 1問ずつ集中して編集) ----
    function renderEditor(quiz) {
      var wrap = h("div", { class: "editor" });
      mainCol.appendChild(wrap);
      wrap.appendChild(skeletons(2));
      api("/api/questions?quizId=" + quiz.id)
        .then(function (qs) {
          clear(wrap);
          var drafts = [];
          for (var i = 0; i < QUESTIONS_PER_QUIZ; i++) {
            var q = qs[i] || {};
            drafts.push({
              id: q.id || null,
              statement: q.statement || "",
              choices: [
                (q.choices || [])[0] || "",
                (q.choices || [])[1] || "",
                (q.choices || [])[2] || "",
                (q.choices || [])[3] || "",
              ],
              answer: q.answer || 1,
              explanation: q.explanation || "",
            });
          }
          var pristine = JSON.stringify(drafts);
          var cur = Math.min(qs.length, QUESTIONS_PER_QUIZ - 1); // 最初の未登録枠 (全部登録済なら最後)
          var pills = h("div", { class: "qpills", role: "tablist", "aria-label": "問題番号" });
          var form = h("div", { class: "card card-pad qform" });
          var status = h("div", { class: "status" });
          var saveBtn = h("button", {
            type: "button",
            class: "btn btn-primary",
            text: "保存する",
            on: { click: save },
          });
          wrap.appendChild(h("div", { class: "editor-head" }, pills));
          wrap.appendChild(form);
          wrap.appendChild(
            h(
              "div",
              { class: "save-bar" },
              status,
              h("a", {
                class: "btn btn-ghost btn-sm",
                href: "#/admin/t/" + quiz.topicId,
                text: "一覧へ",
              }),
              saveBtn,
            ),
          );

          function isComplete(d) {
            return !!(
              d.statement.trim() &&
              d.choices.every(function (c) {
                return c.trim();
              })
            );
          }
          function isBlank(d) {
            return (
              !d.statement.trim() &&
              d.choices.every(function (c) {
                return !c.trim();
              }) &&
              !d.explanation.trim()
            );
          }
          function isDirty() {
            return JSON.stringify(drafts) !== pristine;
          }

          function renderPills() {
            clear(pills);
            drafts.forEach(function (d, i) {
              var cls = "qpill" + (isComplete(d) ? " is-done" : isBlank(d) ? "" : " is-partial");
              pills.appendChild(
                h("button", {
                  type: "button",
                  class: cls,
                  role: "tab",
                  "aria-current": i === cur ? "true" : null,
                  "aria-label": "第" + (i + 1) + "問",
                  text: String(i + 1),
                  on: {
                    click: function () {
                      cur = i;
                      renderForm();
                    },
                  },
                }),
              );
            });
            var done = drafts.filter(isComplete).length;
            status.textContent =
              "完成 " +
              done +
              " / " +
              QUESTIONS_PER_QUIZ +
              (isDirty() ? " · 未保存の変更があります" : "");
            status.className = "status" + (isDirty() ? " is-dirty" : "");
          }
          function renderForm() {
            renderPills();
            clear(form);
            var d = drafts[cur];
            var preview = richEl("div", "admin-preview", d.statement || "（プレビュー）");
            var expPreview = richEl("div", "admin-preview admin-preview-sm", d.explanation || "");
            var statement = h("textarea", {
              class: "textarea code-input",
              placeholder: "問題文を入力（```js のように ``` で囲むとコードブロックになります）",
              value: d.statement,
              "aria-label": "問題文",
              on: {
                input: function (e) {
                  d.statement = e.target.value;
                  renderRich(preview, d.statement || "（プレビュー）");
                  renderPills();
                },
              },
            });
            var choices = h("div", { class: "qform-choices" });
            d.choices.forEach(function (c, i) {
              var ans = h("button", {
                type: "button",
                class: "ans",
                "aria-pressed": d.answer === i + 1 ? "true" : "false",
                "aria-label": "選択肢" + (i + 1) + "を正解にする",
                title: "クリックで正解に設定",
                text: String(i + 1),
                on: {
                  click: function () {
                    d.answer = i + 1;
                    choices.querySelectorAll(".ans").forEach(function (b, k) {
                      b.setAttribute("aria-pressed", k === i ? "true" : "false");
                    });
                    renderPills();
                  },
                },
              });
              choices.appendChild(
                h(
                  "div",
                  { class: "qform-choice" },
                  ans,
                  h("input", {
                    class: "input",
                    placeholder: "選択肢 " + (i + 1),
                    value: c,
                    "aria-label": "選択肢" + (i + 1),
                    on: {
                      input: function (e) {
                        d.choices[i] = e.target.value;
                        renderPills();
                      },
                    },
                  }),
                ),
              );
            });
            var exp = h("textarea", {
              class: "textarea",
              style: "min-height:72px",
              placeholder: "解説（任意。``` で囲むとコードブロックになります）",
              value: d.explanation,
              "aria-label": "解説",
              on: {
                input: function (e) {
                  d.explanation = e.target.value;
                  renderRich(expPreview, d.explanation || "");
                  renderPills();
                },
              },
            });
            form.appendChild(
              h(
                "div",
                { class: "row" },
                h("span", { class: "q-num", text: "第 " + (cur + 1) + " 問" }),
                h("span", { class: "muted", text: d.id ? "登録済み (ID " + d.id + ")" : "未登録" }),
              ),
            );
            form.appendChild(
              h(
                "label",
                { class: "field" },
                h("span", { class: "label", text: "問題文" }),
                statement,
                h("span", {
                  class: "muted",
                  text: "改行はそのまま表示・`code` で装飾・```言語名 で囲むとコードブロック＆コピー付きで表示されます",
                }),
                h("span", { class: "label", text: "プレビュー" }),
                preview,
              ),
            );
            form.appendChild(
              h(
                "div",
                { class: "field" },
                h("span", {
                  class: "label",
                  text: "選択肢 4つ　※左の番号をクリックして正解を選ぶ",
                }),
                choices,
              ),
            );
            form.appendChild(
              h(
                "label",
                { class: "field" },
                h("span", { class: "label", text: "解説" }),
                exp,
                expPreview,
              ),
            );
            form.appendChild(
              h(
                "div",
                { class: "qform-nav" },
                h("button", {
                  type: "button",
                  class: "btn btn-sm",
                  text: "← 前",
                  disabled: cur === 0,
                  on: {
                    click: function () {
                      cur--;
                      renderForm();
                    },
                  },
                }),
                h("span", { class: "spacer" }),
                h("button", {
                  type: "button",
                  class: "btn btn-sm btn-ghost",
                  text: "この枠をクリア",
                  on: {
                    click: function () {
                      d.statement = "";
                      d.choices = ["", "", "", ""];
                      d.answer = 1;
                      d.explanation = "";
                      renderForm();
                    },
                  },
                }),
                h("button", {
                  type: "button",
                  class: "btn btn-sm",
                  text: "次 →",
                  disabled: cur === QUESTIONS_PER_QUIZ - 1,
                  on: {
                    click: function () {
                      cur++;
                      renderForm();
                    },
                  },
                }),
              ),
            );
            statement.focus({ preventScroll: true });
          }
          function save() {
            var payload = [];
            var partial = 0;
            drafts.forEach(function (d) {
              if (isComplete(d))
                payload.push({
                  statement: d.statement.trim(),
                  choice1: d.choices[0].trim(),
                  choice2: d.choices[1].trim(),
                  choice3: d.choices[2].trim(),
                  choice4: d.choices[3].trim(),
                  answer: d.answer,
                  explanation: d.explanation.trim(),
                });
              else if (!isBlank(d)) partial++;
            });
            var doSave = function () {
              saveBtn.disabled = true;
              status.textContent = "保存中…";
              api("/api/questions/batch", {
                method: "POST",
                body: { quizId: quiz.id, questions: payload },
              })
                .then(function () {
                  toast(payload.length + "問を保存しました", "ok");
                  state.tree = null;
                  refreshAll();
                })
                .catch(function (e) {
                  toast(e.message, "ng");
                  saveBtn.disabled = false;
                  renderPills();
                });
            };
            if (partial)
              confirmDialog({
                title: "入力途中の問題があります",
                message:
                  partial +
                  "問は問題文か選択肢が未入力のため保存されません。完成した" +
                  payload.length +
                  "問だけ保存しますか？",
                okLabel: "保存する",
              }).then(function (yes) {
                if (yes) doSave();
              });
            else doSave();
          }
          renderForm();
          window.onbeforeunload = function () {
            return isDirty() ? "未保存の変更があります" : undefined;
          };
        })
        .catch(function (e) {
          clear(wrap);
          wrap.appendChild(
            h("div", { class: "card" }, emptyState("！", "問題を読み込めませんでした", e.message)),
          );
        });
    }

    return function () {
      window.onbeforeunload = null;
    };
  }

  // ---------- boot ----------
  $("nav-home").dataset.nav = "home";
  $("tab-home").dataset.nav = "home";
  $("nav-admin").dataset.nav = "admin";
  $("tab-admin").dataset.nav = "admin";
  $("tab-home").insertBefore(
    h("span", { html: ICON.home, "aria-hidden": "true" }),
    $("tab-home").firstChild,
  );
  $("tab-admin").insertBefore(
    h("span", { html: ICON.admin, "aria-hidden": "true" }),
    $("tab-admin").firstChild,
  );
  route();
})();
