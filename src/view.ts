export const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>kumon-ikanai-mon | 4択クイズ</title>
<style>
  /* 2026モダンCSS: カスケードレイヤで優先度を明示 (reset < base < components < utilities) */
  @layer reset, base, components, utilities;
  @layer reset {
    *, *::before, *::after { box-sizing: border-box; }
    body { margin: 0; }
  }
  @layer base {
  :root {
    color-scheme: light dark;
    --bg: #f8fafc;
    --card: rgba(255, 255, 255, 0.86);
    --ink: #0f172a;
    --muted: #64748b;
    --line: #e2e8f0;
    --brand: #2563eb;
    --brand2: #d946ef;
    --ok: #059669;
    --ok-bg: #ecfdf5;
    --ok-line: #a7f3d0;
    --ng: #e11d48;
    --ng-bg: #fff1f2;
    --ng-line: #fecdd3;
    --warn: #d97706;
    --warn-bg: #fffbeb;
    --radius: 16px;
    --shadow: 0 4px 16px rgba(15, 23, 42, 0.07);
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    color: var(--ink);
    font-family: "Hiragino Kaku Gothic ProN", "Noto Sans JP", system-ui, sans-serif;
    background:
      radial-gradient(1200px 600px at 10% -10%, #dbeafe 0%, transparent 60%),
      radial-gradient(1000px 500px at 110% 10%, #fce7f3 0%, transparent 55%),
      var(--bg);
    min-height: 100vh;
  }
  .wrap { max-width: 1120px; margin: 0 auto; padding: 24px 16px 8px; }
  .hidden { display: none !important; }
  .muted-text { color: var(--muted); font-size: 12px; }

  /* header */
  .topbar {
    position: sticky; top: 12px; z-index: 20;
    display: flex; flex-wrap: wrap; align-items: center; gap: 12px;
    background: var(--card); backdrop-filter: blur(12px);
    border: 1px solid #fff; outline: 1px solid var(--line);
    border-radius: var(--radius); padding: 14px 18px; box-shadow: var(--shadow);
  }
  .brand { display: flex; align-items: center; gap: 12px; }
  .logo {
    width: 40px; height: 40px; border-radius: 12px; flex: none;
    background: linear-gradient(135deg, var(--brand), var(--brand2));
    color: #fff; display: grid; place-items: center;
    font-weight: 900; font-size: 20px;
  }
  .brand-text h1 { margin: 0; font-size: 18px; letter-spacing: -0.02em; }
  .brand-text p { margin: 2px 0 0; font-size: 12px; color: var(--muted); }
  .tabs { margin-left: auto; display: flex; gap: 8px; }
  .tab {
    padding: 8px 16px; border-radius: 12px; font-size: 14px; font-weight: 700;
    border: 1px solid var(--line); background: #fff; cursor: pointer;
  }
  .tab-active { background: var(--ink); color: #fff; border-color: var(--ink); }

  /* solve layout */
  .solve-grid { margin-top: 20px; display: grid; grid-template-columns: 340px 1fr; gap: 20px; align-items: start; }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow); }
  .sidebar { padding: 16px; position: sticky; top: 96px; }
  .sidebar .search-input { width: 100%; }
  .filter-row { display: flex; align-items: center; gap: 8px; margin: 12px 0 8px; font-size: 12px; color: var(--muted); }
  .filter-row .tree-count { margin-left: auto; color: #94a3b8; }
  .tree { display: flex; flex-direction: column; gap: 8px; max-height: 65vh; overflow: auto; padding-right: 4px; font-size: 14px; }
  .tree-large { border: 1px solid var(--line); border-radius: 12px; background: rgba(255,255,255,.7); padding: 8px 12px; }
  .tree-large > summary { list-style: none; cursor: pointer; font-weight: 700; }
  .tree-large > summary::-webkit-details-marker { display: none; }
  .tree-medium { margin: 8px 0 0 8px; border-left: 2px solid var(--line); padding-left: 8px; }
  .tree-medium > summary { list-style: none; cursor: pointer; font-weight: 700; font-size: 13px; }
  .tree-medium > summary::-webkit-details-marker { display: none; }
  .quiz-list { display: flex; flex-direction: column; gap: 6px; margin-top: 6px; }
  .quiz-pick {
    width: 100%; text-align: left; cursor: pointer;
    border: 1px solid var(--line); border-radius: 12px; background: #fff;
    padding: 8px 12px; display: flex; align-items: center; gap: 8px; font-size: 13px;
    transition: transform .15s ease, box-shadow .15s ease, border-color .15s ease;
  }
  .quiz-pick:hover { border-color: var(--brand); box-shadow: 0 8px 20px -8px rgba(37,99,235,.5); transform: translateY(-1px); }
  .quiz-pick-active { border-color: var(--brand); box-shadow: 0 0 0 3px #dbeafe; }
  .quiz-pick-disabled { opacity: .55; cursor: not-allowed; }
  .quiz-pick-disabled:hover { transform: none; box-shadow: none; border-color: var(--line); }
  .quiz-pick-title { font-weight: 700; }
  .stars { font-size: 11px; color: #f59e0b; font-weight: 700; white-space: nowrap; }
  .badge { margin-left: auto; font-size: 11px; padding: 2px 8px; border-radius: 999px; white-space: nowrap; }
  .badge-full { background: var(--ok-bg); color: var(--ok); }
  .badge-partial { background: var(--warn-bg); color: var(--warn); }

  /* quiz play */
  .stack { display: flex; flex-direction: column; gap: 16px; }
  .empty-card { padding: 40px 24px; text-align: center; }
  .empty-card .emoji { font-size: 48px; margin-bottom: 12px; }
  .empty-card h2 { margin: 0; font-size: 18px; font-weight: 800; }
  .empty-card p { color: var(--muted); font-size: 14px; }
  .quiz-head { padding: 20px; }
  .quiz-head-top { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 12px; color: var(--muted); }
  .quiz-head-top .diff { margin-left: auto; font-weight: 700; color: #f59e0b; }
  .quiz-head h2 { margin: 4px 0 0; font-size: 20px; font-weight: 800; }
  .progress { margin-top: 12px; height: 8px; background: #f1f5f9; border-radius: 999px; overflow: hidden; }
  .progress-fill { height: 100%; background: linear-gradient(90deg, var(--brand), var(--brand2)); transition: width .2s ease; }
  .progress-meta { display: flex; justify-content: space-between; font-size: 12px; color: var(--muted); margin-top: 4px; }
  .q-card { padding: 24px; }
  .q-statement { margin: 0; font-weight: 700; font-size: 18px; line-height: 1.7; white-space: pre-wrap; }
  .choices { display: grid; gap: 10px; margin-top: 20px; }
  .choice-btn {
    text-align: left; cursor: pointer; font-size: 14px; font-weight: 700;
    border: 2px solid var(--line); background: #fff; border-radius: 12px;
    padding: 12px 16px; transition: transform .15s ease, box-shadow .15s ease, border-color .15s ease;
    display: flex; align-items: center; gap: 8px;
  }
  .choice-btn:not(:disabled):hover { transform: translateY(-1px); border-color: var(--brand); box-shadow: 0 8px 20px -8px rgba(37,99,235,.5); }
  .choice-btn:disabled { cursor: default; }
  .choice-num { display: inline-grid; place-items: center; width: 24px; height: 24px; flex: none; border-radius: 999px; background: #f1f5f9; font-size: 12px; }
  .choice-correct { border-color: var(--ok) !important; background: var(--ok-bg) !important; }
  .choice-wrong { border-color: var(--ng) !important; background: var(--ng-bg) !important; }
  .choice-dim { opacity: .55; }
  .feedback { margin-top: 16px; border-radius: 12px; padding: 16px; font-size: 14px; }
  .feedback-ok { background: var(--ok-bg); border: 1px solid var(--ok-line); }
  .feedback-ng { background: var(--ng-bg); border: 1px solid var(--ng-line); }
  .feedback-title { font-weight: 800; }
  .feedback-body { margin-top: 4px; white-space: pre-wrap; }
  .row-end { display: flex; gap: 8px; margin-top: 20px; }
  .row-end .spacer { margin-left: auto; }
  .btn { padding: 10px 20px; border-radius: 12px; font-size: 14px; font-weight: 700; cursor: pointer; border: 1px solid var(--line); background: #fff; }
  .btn:hover { background: #f8fafc; }
  .btn-dark { background: var(--ink); color: #fff; border-color: var(--ink); }
  .btn-dark:hover { background: #334155; }
  .btn-gradient { background: linear-gradient(90deg, var(--brand), var(--brand2)); color: #fff; border: none; }

  /* result */
  .result-card { padding: 32px; text-align: center; }
  .result-card .emoji { font-size: 48px; }
  .result-card h2 { margin: 8px 0 0; font-size: 28px; font-weight: 800; }
  .result-card p { color: var(--muted); font-size: 14px; }
  .review-list { text-align: left; margin-top: 20px; display: flex; flex-direction: column; gap: 8px; max-height: 40vh; overflow: auto; }
  .review-item { border: 1px solid var(--line); border-radius: 12px; padding: 12px; background: #fff; font-size: 14px; }
  .review-head { font-weight: 700; }
  .ok-text { color: var(--ok); }
  .ng-text { color: var(--ng); }
  .review-exp { font-size: 12px; margin-top: 4px; white-space: pre-wrap; }
  .result-actions { display: flex; justify-content: center; gap: 8px; margin-top: 24px; flex-wrap: wrap; }

  /* admin */
  .admin-grid { margin-top: 20px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
  .panel { padding: 16px; }
  .panel h3 { margin: 0 0 8px; font-size: 14px; font-weight: 800; }
  .panel h3 .sub { font-weight: 400; color: var(--muted); }
  .form-row { display: flex; gap: 8px; margin-bottom: 12px; }
  .input, .select, .textarea {
    font-size: 14px; border: 1px solid var(--line); border-radius: 12px;
    padding: 8px 12px; background: #fff; color: var(--ink); outline: none;
  }
  .input:focus, .select:focus, .textarea:focus { border-color: var(--brand); box-shadow: 0 0 0 3px #dbeafe; }
  .input { flex: 1; min-width: 0; }
  .select { flex: 1; min-width: 0; }
  .textarea { width: 100%; min-height: 64px; resize: vertical; margin-bottom: 8px; }
  .list { display: flex; flex-direction: column; gap: 6px; font-size: 14px; max-height: 256px; overflow: auto; }
  .list-item { display: flex; align-items: center; gap: 8px; border: 1px solid var(--line); border-radius: 12px; padding: 8px 12px; background: #fff; }
  .list-title { font-weight: 700; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .list-title .stars { margin-left: 4px; }
  .count-ok { font-size: 11px; color: var(--ok); }
  .count-warn { font-size: 11px; color: var(--warn); }
  .del-btn { background: none; border: none; font-size: 12px; color: #94a3b8; cursor: pointer; flex: none; }
  .del-btn:hover { color: var(--ng); }
  .edit-btn { background: none; border: none; font-size: 12px; color: var(--brand); cursor: pointer; flex: none; }
  .edit-btn:hover { text-decoration: underline; }
  .list-item .input { flex: 1; }
  .add-btn { flex: none; padding: 8px 12px; border-radius: 12px; background: var(--ink); color: #fff; font-size: 14px; font-weight: 700; border: none; cursor: pointer; }
  .editor-panel { margin-top: 20px; padding: 20px; }
  .editor-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .editor-head h3 { margin: 0; font-weight: 800; }
  .editor-head .select { margin-left: auto; min-width: 220px; flex: none; }
  .qedit-item { border: 1px solid var(--line); border-radius: 12px; background: #fff; padding: 12px; margin-top: 12px; }
  .qedit-head { font-weight: 800; font-size: 12px; color: var(--muted); margin-bottom: 8px; }
  .choice-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px; }
  .choice-grid .input { width: 100%; }
  .qedit-foot { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .qedit-foot .input { flex: 1; min-width: 200px; }
  .qedit-foot .select { flex: none; width: auto; }
  .save-row { margin-top: 16px; display: flex; align-items: center; gap: 8px; }

  footer { text-align: center; font-size: 12px; color: #94a3b8; padding: 32px 0; }

  .history-title { margin: 24px 0 8px; font-size: 14px; font-weight: 800; text-align: left; }
  .history-list { display: flex; flex-direction: column; gap: 6px; text-align: left; }
  .history-item { display: flex; justify-content: space-between; align-items: center; gap: 8px; border: 1px solid var(--line); background: #fff; border-radius: 10px; padding: 8px 12px; font-size: 13px; }
  .history-item strong { font-size: 15px; white-space: nowrap; }
  .best-score { font-size: 11px; color: var(--ok); font-weight: 700; white-space: nowrap; }
  .fade-in { animation: fadeIn .25s ease; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

  /* responsive */
  } /* ← @layer base ここまで */
  @layer components {
  @media (max-width: 960px) {
    .solve-grid { grid-template-columns: 1fr; }
    .sidebar { position: static; }
    .tree { max-height: 40dvh; }
    .admin-grid { grid-template-columns: 1fr; }
    .editor-head .select { margin-left: 0; width: 100%; }
  }
  @media (max-width: 640px) {
    .wrap { padding: 12px 8px 4px; }
    .topbar { top: 6px; padding: 10px 12px; }
    .brand-text h1 { font-size: 1rem; }
    .tabs { margin-left: 0; width: 100%; }
    .tabs .tab { flex: 1; }
    .q-card, .quiz-head { padding: 16px; }
    .q-statement { font-size: 1rem; }
    .choice-grid { grid-template-columns: 1fr; }
    .result-card { padding: 20px 12px; }
    .editor-panel { padding: 12px; }
  }
  } /* ← @layer components ここまで */
  @layer utilities {
    /* 流体タイポグラフィ: clamp()+remでズーム耐性 (2026推奨・WCAG 1.4.4対応) */
    .brand-text h1 { font-size: clamp(1rem, 0.9rem + 1vw, 1.25rem); }
    .q-statement { font-size: clamp(1rem, 0.95rem + 0.8vw, 1.125rem); }
    .quiz-head h2 { font-size: clamp(1.125rem, 1rem + 1.2vw, 1.375rem); }
    /* モバイル100vh問題: dvhでURLバー伸縮に対応 */
    body { min-height: 100dvh; }
    .tree { max-height: 65dvh; scrollbar-gutter: stable; }
    /* キーボード操作の可視フォーカス (WCAG 2.4.7) */
    :focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; border-radius: 6px; }
    .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: clip; clip-path: inset(50%); white-space: nowrap; }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #0f172a; --card: rgba(30, 41, 59, 0.92); --ink: #f1f5f9;
        --muted: #94a3b8; --line: #334155;
      }
      body {
        background:
          radial-gradient(1200px 600px at 10% -10%, #1e3a8a 0%, transparent 60%),
          radial-gradient(1000px 500px at 110% 10%, #831843 0%, transparent 55%),
          var(--bg);
      }
      .quiz-pick, .choice-btn, .list-item, .review-item, .history-item, .tree-large, .tab, .input, .select, .textarea { background: #1e293b; color: var(--ink); }
      .choice-num { background: #334155; }
    }
  }
</style>
</head>
<body>
<a href="#view-solve" class="visually-hidden">クイズへスキップ</a>
<div class="wrap">

  <header class="topbar">
    <div class="brand">
      <div class="logo" aria-hidden="true">問</div>
      <div class="brand-text">
        <h1>kumon-ikanai-mon</h1>
        <p>カテゴリー → トピック → クイズ（10問）4択ドリル</p>
      </div>
    </div>
    <nav class="tabs" aria-label="ビュー切替">
      <button id="tab-solve" type="button" class="tab tab-active" aria-current="page">解く</button>
      <button id="tab-admin" type="button" class="tab">管理</button>
    </nav>
  </header>

  <!-- SOLVE -->
  <main id="view-solve" class="solve-grid" aria-label="クイズを解く">
    <aside class="card sidebar" aria-label="クイズ一覧">
      <label class="visually-hidden" for="tree-search">クイズを検索</label>
      <input id="tree-search" class="search-input input" placeholder="クイズを検索…" autocomplete="off" />
      <div class="filter-row">
        <label for="filter-diff">難易度:</label>
        <select id="filter-diff" class="select" style="flex:none;width:auto">
          <option value="">すべて</option>
          <option value="1">★1</option><option value="2">★2</option><option value="3">★3</option><option value="4">★4</option><option value="5">★5</option>
        </select>
        <span id="tree-count" class="tree-count"></span>
      </div>
      <div id="tree" class="tree"></div>
    </aside>

    <section class="stack">
      <div id="quiz-empty" class="card empty-card">
        <div class="emoji">📝</div>
        <h2>クイズを選んでスタート</h2>
        <p>1つのクイズ = 10問。タイトル・難易度ごとに挑戦できます。</p>
      </div>

      <div id="quiz-play" class="hidden stack">
        <div class="card quiz-head">
          <div class="quiz-head-top">
            <span id="q-breadcrumb"></span>
            <span id="q-diff" class="diff"></span>
          </div>
          <h2 id="q-quiz-title"></h2>
          <div class="progress"><div id="q-progress" class="progress-fill" style="width:0%"></div></div>
          <div class="progress-meta"><span id="q-pos"></span><span id="q-score"></span></div>
        </div>

        <div class="card q-card fade-in" id="q-card">
          <p id="q-statement" class="q-statement"></p>
          <div id="q-choices" class="choices"></div>
          <div id="q-feedback" class="hidden feedback"></div>
          <div class="row-end">
            <span class="spacer"></span>
            <button id="btn-next" type="button" class="hidden btn btn-dark">次の問題 →</button>
            <button id="btn-result" type="button" class="hidden btn btn-gradient">結果を見る</button>
          </div>
        </div>
      </div>

      <div id="quiz-result" class="hidden card result-card fade-in">
        <div id="r-emoji" class="emoji">🎉</div>
        <h2><span id="r-score"></span> / <span id="r-total"></span></h2>
        <p id="r-msg"></p>
        <div id="r-review" class="review-list"></div>
        <h3 class="history-title">このクイズの挑戦履歴</h3>
        <div id="r-history" class="history-list"></div>
        <div class="result-actions">
          <button id="btn-retry" type="button" class="btn">もう一度</button>
          <button id="btn-back" type="button" class="btn btn-dark">別のクイズへ</button>
        </div>
      </div>
    </section>
  </main>

  <!-- ADMIN -->
  <section id="view-admin" class="hidden" aria-label="管理">
    <div class="admin-grid">
      <div class="card panel">
        <h3>📁 カテゴリー</h3>
        <div class="form-row"><label class="visually-hidden" for="in-category">カテゴリー名</label><input id="in-category" class="input" placeholder="例: 算数" maxlength="100" /><button data-action="create-category" type="button" class="add-btn">追加</button></div>
        <div id="list-category" class="list"></div>
      </div>
      <div class="card panel">
        <h3>📂 トピック</h3>
        <div class="form-row"><label class="visually-hidden" for="sel-category">カテゴリー選択</label><select id="sel-category" class="select"></select></div>
        <div class="form-row"><label class="visually-hidden" for="in-topic">トピック名</label><input id="in-topic" class="input" placeholder="例: たし算" maxlength="100" /><button data-action="create-topic" type="button" class="add-btn">追加</button></div>
        <div id="list-topic" class="list"></div>
      </div>
      <div class="card panel">
        <h3>📄 クイズ <span class="sub">（タイトル+難易度 / 10問）</span></h3>
        <div class="form-row"><label class="visually-hidden" for="sel-topic">トピック選択</label><select id="sel-topic" class="select"></select></div>
        <div class="form-row">
          <label class="visually-hidden" for="in-quiz">クイズ名</label><input id="in-quiz" class="input" placeholder="例: くり上がりあり" maxlength="100" />
          <label class="visually-hidden" for="in-diff">難易度</label><select id="in-diff" class="select" style="flex:none;width:76px"><option value="1">★1</option><option value="2">★2</option><option value="3" selected>★3</option><option value="4">★4</option><option value="5">★5</option></select>
          <button data-action="create-quiz" type="button" class="add-btn">追加</button>
        </div>
        <div id="list-quiz" class="list"></div>
      </div>
    </div>

    <div class="card editor-panel">
      <div class="editor-head">
        <h3>✏️ 問題編集（10問）</h3>
        <label class="visually-hidden" for="sel-quiz">編集するクイズ</label><select id="sel-quiz" class="select"></select>
      </div>
      <p class="muted-text">クイズを選ぶと10枠表示。各枠: 問題文・選択肢4つ・正解・解説。空欄は無視して保存されます。</p>
      <div id="q-editor"></div>
      <div class="save-row">
        <button data-action="save-questions" type="button" class="btn btn-gradient">10問を保存</button>
        <span id="save-msg" class="muted-text" role="status" aria-live="polite"></span>
      </div>
    </div>
  </section>

  <footer>Basic Auth protected · Hono + Cloudflare Workers + D1</footer>
</div>

<script>
const $ = (id) => document.getElementById(id);
const api = async (path, opt={}) => {
  const r = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opt });
  if (!r.ok) throw new Error(await r.text());
  return r.status === 204 ? null : r.json();
};
const stars = (n) => '★'.repeat(n) + '☆'.repeat(5-n);
let categoryTree = [];
let session = { attemptId:null, quiz:null, questions:[], index:0, score:0, answers:[] };
let attemptSummary = {};

// tabs (2026推奨: addEventListener。インラインonclick禁止)
$('tab-solve').addEventListener('click', () => { $('view-solve').classList.remove('hidden'); $('view-admin').classList.add('hidden'); $('tab-solve').className='tab tab-active'; $('tab-admin').className='tab'; $('tab-solve').setAttribute('aria-current','page'); $('tab-admin').removeAttribute('aria-current'); });
$('tab-admin').addEventListener('click', () => { $('view-admin').classList.remove('hidden'); $('view-solve').classList.add('hidden'); $('tab-admin').className='tab tab-active'; $('tab-solve').className='tab'; $('tab-admin').setAttribute('aria-current','page'); $('tab-solve').removeAttribute('aria-current'); loadCategories(); });

// tree
async function loadTree() {
  let treeData = [];
  let summaryData = [];
  try { treeData = await api('/api/tree'); } catch (e) { treeData = []; }
  try { summaryData = await api('/api/attempts/summary'); } catch (e) { summaryData = []; }
  categoryTree = treeData;
  attemptSummary = {};
  summaryData.forEach(s => { attemptSummary[s.quizId] = s; });
  renderTree();
}
function renderTree() {
  const kw = ($('tree-search').value||'').trim();
  const df = $('filter-diff').value;
  const el = $('tree'); el.innerHTML = '';
  let quizTotal = 0;
  categoryTree.forEach(category => {
    const lbox = document.createElement('details'); lbox.open = true;
    lbox.className = 'tree-large';
    const lsum = document.createElement('summary');
    const licon = document.createElement('span'); licon.textContent = '📁 ' + category.title;
    const lcount = document.createElement('span'); lcount.className = 'muted-text'; lcount.textContent = ' ' + category.topics.length + 'トピック';
    lsum.appendChild(licon); lsum.appendChild(lcount); lbox.appendChild(lsum);
    category.topics.forEach(topic => {
      const mbox = document.createElement('details'); mbox.open = true;
      mbox.className = 'tree-medium';
      const msum = document.createElement('summary'); msum.textContent = '📂 ' + topic.title;
      mbox.appendChild(msum);
      const ul = document.createElement('div'); ul.className = 'quiz-list';
      topic.quizzes.filter(q => (!kw || q.title.includes(kw)) && (!df || String(q.difficulty)===df)).forEach(quizItem => {
        quizTotal++;
        const full = quizItem.questionCount >= 10;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'quiz-pick' + (session.quiz && session.quiz.id===quizItem.id ? ' quiz-pick-active' : '') + (full ? '' : ' quiz-pick-disabled');
        if (!full) { b.disabled = true; b.title = '10問揃っていません（現在' + quizItem.questionCount + '問）'; }
        const t = document.createElement('span'); t.className = 'quiz-pick-title'; t.textContent = quizItem.title;
        const st = document.createElement('span'); st.className = 'stars'; st.textContent = stars(quizItem.difficulty);
        const badge = document.createElement('span'); badge.className = 'badge ' + (full ? 'badge-full' : 'badge-partial'); badge.textContent = quizItem.questionCount + '/10問';
        b.appendChild(t); b.appendChild(st);
        const best = bestScoreText(quizItem.id);
        if (best) { const bs = document.createElement('span'); bs.className = 'best-score'; bs.textContent = best; b.appendChild(bs); }
        b.appendChild(badge);
        b.addEventListener('click', () => startQuiz(quizItem.id));
        ul.appendChild(b);
      });
      mbox.appendChild(ul); lbox.appendChild(mbox);
    });
    el.appendChild(lbox);
  });
  $('tree-count').textContent = quizTotal + ' クイズ';
}
$('tree-search').addEventListener('input', renderTree); $('filter-diff').addEventListener('change', renderTree);
const bestScoreText = (quizId) => {
  const s = attemptSummary[quizId];
  if (!s || !s.attemptCount) return '';
  return '最高' + s.bestScore + '/' + s.bestTotal;
};
const bestScoreHtml = bestScoreText;
const esc = (s) => String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const apiError = (e) => {
  const raw = String((e && e.message) || e || '');
  try { return JSON.parse(raw).error || raw; } catch (parseError) { return raw || '通信に失敗しました'; }
};

// quiz
async function startQuiz(quizId) {
  let data;
  try {
    data = await api('/api/quizzes/' + quizId + '/play');
  } catch (e) {
    let msg = 'クイズを開始できません';
    try { msg = JSON.parse(e.message).error || msg; } catch (parseError) { msg = String((e && e.message) || e) || msg; }
    alert(msg);
    return;
  }
  if (!data.questions.length) { alert('このクイズにはまだ問題がありません。管理タブから10問登録してください。'); return; }
  const started = await api('/api/quizzes/' + quizId + '/attempts', { method: 'POST' });
  const items = started.questions || [];
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = items[i]; items[i] = items[j]; items[j] = tmp;
  }
  session = { attemptId: started.attemptId, quiz: data.quiz, questions: items, index: 0, score: 0, answers: [] };
  $('quiz-empty').classList.add('hidden'); $('quiz-result').classList.add('hidden'); $('quiz-play').classList.remove('hidden');
  renderTree(); showQ();
}
function showQ() {
  const q = session.questions[session.index];
  $('q-breadcrumb').textContent = session.quiz.categoryTitle + ' / ' + session.quiz.topicTitle;
  $('q-quiz-title').textContent = session.quiz.title;
  $('q-diff').textContent = stars(session.quiz.difficulty);
  $('q-pos').textContent = 'Q' + (session.index+1) + ' / ' + session.questions.length;
  $('q-score').textContent = '正解: ' + session.score;
  $('q-progress').style.width = (session.index / session.questions.length * 100) + '%';
  $('q-statement').textContent = q.statement;
  $('q-feedback').className = 'hidden feedback';
  $('btn-next').className = 'hidden btn btn-dark'; $('btn-result').className = 'hidden btn btn-gradient';
  const box = $('q-choices'); box.innerHTML = '';
  q.choices.forEach((c, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'choice-btn';
    const num = document.createElement('span'); num.className = 'choice-num'; num.textContent = String(i+1);
    const label = document.createElement('span'); label.textContent = c;
    btn.appendChild(num); btn.appendChild(label);
    btn.addEventListener('click', () => answerQ(q, i+1));
    box.appendChild(btn);
  });
  const card = $('q-card'); card.classList.remove('fade-in'); void card.offsetWidth; card.classList.add('fade-in');
}
async function answerQ(q, choice) {
  const buttons = $('q-choices').children;
  for (let k = 0; k < buttons.length; k++) { buttons[k].disabled = true; }
  const res = await api('/api/attempts/' + session.attemptId + '/answers', { method: 'POST', body: JSON.stringify({ attemptQuestionId: q.attemptQuestionId, choice: choice }) });
  const ok = res.correct;
  if (ok) session.score++;
  session.answers.push({ q: q, choice: choice, ok: ok, correct: res.correctAnswer, exp: res.explanation });
  for (let k = 0; k < buttons.length; k++) {
    if (k+1 === res.correctAnswer) buttons[k].className += ' choice-correct';
    else if (k+1 === choice && !ok) buttons[k].className += ' choice-wrong';
    else buttons[k].className += ' choice-dim';
  }
  const fb = $('q-feedback');
  fb.className = 'feedback ' + (ok ? 'feedback-ok' : 'feedback-ng');
  fb.innerHTML = '';
  const fbTitle = document.createElement('div'); fbTitle.className = 'feedback-title';
  fbTitle.textContent = ok ? '⭕ 正解！' : '❌ 不正解… 正解は ' + res.correctAnswer;
  const fbBody = document.createElement('div'); fbBody.className = 'feedback-body';
  fbBody.textContent = res.explanation || '(解説なし)';
  fb.appendChild(fbTitle); fb.appendChild(fbBody);
  $('q-score').textContent = '正解: ' + session.score;
  $('q-progress').style.width = ((session.index+1) / session.questions.length * 100) + '%';
  if (session.index + 1 < session.questions.length) $('btn-next').classList.remove('hidden');
  else $('btn-result').classList.remove('hidden');
}
$('btn-next').addEventListener('click', () => { session.index++; showQ(); });
$('btn-result').addEventListener('click', showResult);
async function showResult() {
  $('quiz-play').classList.add('hidden'); $('quiz-result').classList.remove('hidden');
  try {
    const done = await api('/api/attempts/' + session.attemptId + '/complete', { method: 'POST' });
    session.score = done.score;
  } catch (e) { /* 記録に失敗しても手元の集計で表示する */ }
  $('r-score').textContent = session.score; $('r-total').textContent = session.questions.length;
  $('r-emoji').textContent = session.score === session.questions.length ? '🏆' : session.score >= session.questions.length*0.7 ? '🎉' : '💪';
  $('r-msg').textContent = session.score === session.questions.length ? 'パーフェクト！すばらしい！' : 'おつかれさま！復習して再チャレンジしよう。';
  const reviewBox = $('r-review'); reviewBox.innerHTML = '';
  session.answers.forEach((a, i) => {
    const item = document.createElement('div'); item.className = 'review-item';
    const head = document.createElement('div'); head.className = 'review-head';
    head.textContent = 'Q' + (i+1) + '. ' + a.q.statement + ' ';
    const mark = document.createElement('span'); mark.className = a.ok ? 'ok-text' : 'ng-text'; mark.textContent = a.ok ? '⭕' : '❌';
    head.appendChild(mark);
    const meta = document.createElement('div'); meta.className = 'muted-text';
    meta.textContent = 'あなたの回答: ' + a.choice + ' / 正解: ' + a.correct;
    const exp = document.createElement('div'); exp.className = 'review-exp'; exp.textContent = a.exp || '';
    item.appendChild(head); item.appendChild(meta); item.appendChild(exp);
    reviewBox.appendChild(item);
  });
  await renderHistory();
  loadTree();
}

async function renderHistory() {
  const box = $('r-history');
  box.innerHTML = '';
  const loading = document.createElement('p'); loading.className = 'muted-text'; loading.textContent = '読み込み中…';
  box.appendChild(loading);
  try {
    const attempts = await api('/api/quizzes/' + session.quiz.id + '/attempts?limit=5');
    box.innerHTML = '';
    if (!attempts.length) { const p = document.createElement('p'); p.className = 'muted-text'; p.textContent = 'まだ履歴がありません'; box.appendChild(p); return; }
    attempts.forEach((a, i) => {
      const when = String(a.completedAt || a.createdAt || '').slice(0, 16);
      const row = document.createElement('div'); row.className = 'history-item';
      const left = document.createElement('span'); left.textContent = (i === 0 ? '今回 ' : '履歴 ') + when;
      const score = document.createElement('strong'); score.textContent = a.score + ' / ' + a.total;
      row.appendChild(left); row.appendChild(score); box.appendChild(row);
    });
  } catch (e) { box.innerHTML = ''; const p = document.createElement('p'); p.className = 'muted-text'; p.textContent = '履歴を取得できませんでした'; box.appendChild(p); }
}
$('btn-retry').addEventListener('click', () => startQuiz(session.quiz.id));
$('btn-back').addEventListener('click', () => { $('quiz-play').classList.add('hidden'); $('quiz-result').classList.add('hidden'); $('quiz-empty').classList.remove('hidden'); });

// admin
let adminState = { categories: [], topics: [], quizzes: [] };
async function loadCategories() {
  adminState.categories = await api('/api/categories');
  const list = $('list-category'); list.innerHTML = '';
  if (!adminState.categories.length) { list.innerHTML = '<p class="muted-text">なし</p>'; }
  adminState.categories.forEach(c => {
    list.appendChild(adminRow('cat-' + c.id, c.title, c.questionCount + '問', [
      { label: '編集', cls: 'edit-btn', action: 'edit-category', id: c.id },
      { label: '削除', cls: 'del-btn', action: 'delete-category', id: c.id },
    ]));
  });
  const selCat = $('sel-category'); selCat.innerHTML = '';
  adminState.categories.forEach(c => {
    const opt = document.createElement('option'); opt.value = String(c.id); opt.textContent = c.title;
    selCat.appendChild(opt);
  });
  await loadTopics();
}
async function loadTopics() {
  const categoryId = $('sel-category').value;
  adminState.topics = categoryId ? await api('/api/topics?categoryId=' + categoryId) : [];
  const list = $('list-topic'); list.innerHTML = '';
  if (!adminState.topics.length) { list.innerHTML = '<p class="muted-text">なし</p>'; }
  adminState.topics.forEach(t => {
    list.appendChild(adminRow('topic-' + t.id, t.title, t.questionCount + '問', [
      { label: '編集', cls: 'edit-btn', action: 'edit-topic', id: t.id },
      { label: '削除', cls: 'del-btn', action: 'delete-topic', id: t.id },
    ]));
  });
  const selTopic = $('sel-topic'); selTopic.innerHTML = '';
  adminState.topics.forEach(t => {
    const opt = document.createElement('option'); opt.value = String(t.id); opt.textContent = t.title;
    selTopic.appendChild(opt);
  });
  await loadQuizzes();
}
$('sel-category').addEventListener('change', loadTopics); $('sel-topic').addEventListener('change', loadQuizzes); $('sel-quiz').addEventListener('change', loadQEditor);
async function loadQuizzes() {
  const topicId = $('sel-topic').value;
  adminState.quizzes = topicId ? await api('/api/quizzes?topicId=' + topicId) : [];
  const list = $('list-quiz'); list.innerHTML = '';
  if (!adminState.quizzes.length) { list.innerHTML = '<p class="muted-text">なし</p>'; }
  adminState.quizzes.forEach(q => {
    const statusMark = q.status && q.status !== 'published' ? ' [' + q.status + ']' : '';
    const row = adminRow('quiz-' + q.id, q.title + ' ' + stars(q.difficulty) + statusMark, q.questionCount + '/10', [
      { label: '編集', cls: 'edit-btn', action: 'edit-quiz', id: q.id },
      { label: '削除', cls: 'del-btn', action: 'delete-quiz', id: q.id },
    ], q.questionCount >= 10 ? 'count-ok' : 'count-warn');
    list.appendChild(row);
  });
  const selQuiz = $('sel-quiz'); selQuiz.innerHTML = '';
  adminState.quizzes.forEach(q => {
    const opt = document.createElement('option'); opt.value = String(q.id); opt.textContent = q.title + '（' + q.questionCount + '/10）';
    selQuiz.appendChild(opt);
  });
  await loadQEditor();
}
async function createCategory() { const t = $('in-category').value.trim(); if(!t) return; await api('/api/categories',{method:'POST',body:JSON.stringify({title:t})}); $('in-category').value=''; loadCategories(); }
async function createTopic() { const t = $('in-topic').value.trim(); if(!t || !$('sel-category').value) return alert('カテゴリーを選択してください'); await api('/api/topics',{method:'POST',body:JSON.stringify({categoryId:+$('sel-category').value,title:t})}); $('in-topic').value=''; loadTopics(); loadTree(); }
async function createQuiz() { const t = $('in-quiz').value.trim(); if(!t || !$('sel-topic').value) return alert('トピックを選択してください'); await api('/api/quizzes',{method:'POST',body:JSON.stringify({topicId:+$('sel-topic').value,title:t,difficulty:+$('in-diff').value})}); $('in-quiz').value=''; loadQuizzes(); loadTree(); }
async function deleteCategory(id) { if(!confirm('配下のトピック・クイズ・問題も全削除されます。OK?')) return; try { await api('/api/categories/'+id,{method:'DELETE'}); } catch (e) { alert(apiError(e)); return; } loadCategories(); loadTree(); }
async function deleteTopic(id) { if(!confirm('配下のクイズ・問題も全削除されます。OK?')) return; try { await api('/api/topics/'+id,{method:'DELETE'}); } catch (e) { alert(apiError(e)); return; } loadTopics(); loadTree(); }
async function deleteQuiz(id) { if(!confirm('配下の問題も全削除されます。OK?')) return; try { await api('/api/quizzes/'+id,{method:'DELETE'}); } catch (e) { alert(apiError(e)); return; } loadQuizzes(); loadTree(); }
// 管理行のDOM生成 (textContentでXSSを防止。innerHTML文字列結合を使わない)
function adminRow(rowId, title, countText, actions, countCls) {
  const row = document.createElement('div');
  row.className = 'list-item'; row.id = rowId;
  const titleEl = document.createElement('span'); titleEl.className = 'list-title'; titleEl.textContent = title;
  const countEl = document.createElement('span'); countEl.className = countCls || 'muted-text'; countEl.textContent = countText;
  row.appendChild(titleEl); row.appendChild(countEl);
  actions.forEach(a => {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = a.cls; btn.textContent = a.label;
    btn.dataset.action = a.action; btn.dataset.id = String(a.id);
    row.appendChild(btn);
  });
  return row;
}
function inlineEditor(rowId, inputId, value, onSave, onCancel) {
  const row = $(rowId); row.innerHTML = '';
  const input = document.createElement('input');
  input.id = inputId; input.className = 'input'; input.maxLength = 100; input.value = value;
  const save = document.createElement('button'); save.type = 'button'; save.className = 'add-btn'; save.textContent = '保存';
  save.addEventListener('click', onSave);
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'del-btn'; cancel.textContent = '取消';
  cancel.addEventListener('click', onCancel);
  row.appendChild(input); row.appendChild(save); row.appendChild(cancel);
  input.focus();
}
function editCategory(id) {
  const found = adminState.categories.filter(c => c.id === id)[0];
  if (!found) return;
  inlineEditor('cat-' + id, 'edit-cat-' + id, found.title, () => saveCategory(id), loadCategories);
}
async function saveCategory(id) {
  const t = $('edit-cat-' + id).value.trim();
  if (!t) { alert('タイトルを入力してください'); return; }
  try {
    await api('/api/categories/' + id, { method: 'PUT', body: JSON.stringify({ title: t }) });
  } catch (e) { alert(apiError(e)); return; }
  loadCategories(); loadTree();
}
function editTopic(id) {
  const found = adminState.topics.filter(t => t.id === id)[0];
  if (!found) return;
  inlineEditor('topic-' + id, 'edit-topic-' + id, found.title, () => saveTopic(id), loadTopics);
}
async function saveTopic(id) {
  const t = $('edit-topic-' + id).value.trim();
  if (!t) { alert('タイトルを入力してください'); return; }
  try {
    await api('/api/topics/' + id, { method: 'PUT', body: JSON.stringify({ title: t }) });
  } catch (e) { alert(apiError(e)); return; }
  loadTopics(); loadTree();
}
function editQuiz(id) {
  const found = adminState.quizzes.filter(q => q.id === id)[0];
  if (!found) return;
  const row = $('quiz-' + id); row.innerHTML = '';
  const input = document.createElement('input');
  input.id = 'edit-quiz-' + id; input.className = 'input'; input.maxLength = 100; input.value = found.title;
  const sel = document.createElement('select');
  sel.id = 'edit-quiz-diff-' + id; sel.className = 'select'; sel.style.cssText = 'flex:none;width:76px';
  for (let n = 1; n <= 5; n++) {
    const opt = document.createElement('option'); opt.value = String(n); opt.textContent = '★' + n;
    if (found.difficulty === n) opt.selected = true;
    sel.appendChild(opt);
  }
  const save = document.createElement('button'); save.type = 'button'; save.className = 'add-btn'; save.textContent = '保存';
  save.addEventListener('click', () => saveQuiz(id));
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'del-btn'; cancel.textContent = '取消';
  cancel.addEventListener('click', loadQuizzes);
  const statusSel = document.createElement('select');
  statusSel.id = 'edit-quiz-status-' + id; statusSel.className = 'select'; statusSel.style.cssText = 'flex:none;width:110px';
  ['draft', 'published', 'archived'].forEach(s => {
    const opt = document.createElement('option'); opt.value = s; opt.textContent = s;
    if (found.status === s) opt.selected = true;
    statusSel.appendChild(opt);
  });
  row.appendChild(input); row.appendChild(sel); row.appendChild(statusSel); row.appendChild(save); row.appendChild(cancel);
  input.focus();
}
async function saveQuiz(id) {
  const t = $('edit-quiz-' + id).value.trim();
  if (!t) { alert('タイトルを入力してください'); return; }
  const difficulty = +$('edit-quiz-diff-' + id).value;
  const status = $('edit-quiz-status-' + id).value;
  try {
    await api('/api/quizzes/' + id, { method: 'PUT', body: JSON.stringify({ title: t, difficulty: difficulty, status: status }) });
  } catch (e) { alert(apiError(e)); return; }
  loadQuizzes(); loadTree();
}
async function loadQEditor() {
  const quizId = $('sel-quiz').value; const box = $('q-editor'); box.innerHTML = '';
  if (!quizId) { box.innerHTML = '<p class="muted-text">クイズを作成・選択してください</p>'; return; }
  const qs = await api('/api/questions?quizId=' + quizId);
  for (let i = 0; i < 10; i++) {
    const q = qs[i] || {};
    const d = document.createElement('div');
    d.className = 'qedit-item';
    // 骨組みは静的HTML、ユーザー値はプロパティ代入 (value/textContent) でXSS防止
    d.innerHTML = '<div class="qedit-head"></div><textarea data-k="statement" placeholder="問題文" class="textarea"></textarea><div class="choice-grid"><input data-k="choice1" placeholder="選択肢1" class="input" /><input data-k="choice2" placeholder="選択肢2" class="input" /><input data-k="choice3" placeholder="選択肢3" class="input" /><input data-k="choice4" placeholder="選択肢4" class="input" /></div><div class="qedit-foot"><label class="muted-text">正解: <select data-k="answer" class="select"><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option></select></label><input data-k="explanation" placeholder="解説" class="input" /></div>';
    d.querySelector('.qedit-head').textContent = 'Q' + (i+1) + ' ' + (q.id ? '(ID:' + q.id + ')' : '(未登録)');
    d.querySelector('[data-k=statement]').value = q.statement || '';
    for (let n = 1; n <= 4; n++) { d.querySelector('[data-k=choice' + n + ']').value = (q.choices && q.choices[n-1]) || ''; }
    d.querySelector('[data-k=answer]').value = String(q.answer || 1);
    d.querySelector('[data-k=explanation]').value = q.explanation || '';
    box.appendChild(d);
  }
}
async function saveQuestions() {
  const quizId = +$('sel-quiz').value; if (!quizId) return;
  const cards = $('q-editor').children;
  const payload = [];
  for (let k = 0; k < cards.length; k++) {
    const c = cards[k];
    const entry = {
      statement: c.querySelector('[data-k=statement]').value.trim(),
      choice1: c.querySelector('[data-k=choice1]').value.trim(),
      choice2: c.querySelector('[data-k=choice2]').value.trim(),
      choice3: c.querySelector('[data-k=choice3]').value.trim(),
      choice4: c.querySelector('[data-k=choice4]').value.trim(),
      answer: +c.querySelector('[data-k=answer]').value,
      explanation: c.querySelector('[data-k=explanation]').value.trim()
    };
    if (entry.statement && entry.choice1 && entry.choice2 && entry.choice3 && entry.choice4) payload.push(entry);
  }
  $('save-msg').textContent = '保存中…';
  try {
    await api('/api/questions/batch', { method: 'POST', body: JSON.stringify({ quizId: quizId, questions: payload }) });
  } catch (e) {
    const msg = apiError(e);
    $('save-msg').textContent = msg;
    alert(msg);
    return;
  }
  $('save-msg').textContent = payload.length + '問保存しました';
  loadQuizzes(); loadTree();
}
// 2026推奨: インラインonclick全廃。data-action委譲で一元処理
const ACTIONS = {
  'create-category': createCategory,
  'create-topic': createTopic,
  'create-quiz': createQuiz,
  'save-questions': saveQuestions,
};
document.addEventListener('click', (ev) => {
  const btn = ev.target && ev.target.closest ? ev.target.closest('[data-action]') : null;
  if (!btn) return;
  const action = btn.dataset.action;
  const id = btn.dataset.id ? Number(btn.dataset.id) : undefined;
  if (action === 'edit-category') return void editCategory(id);
  if (action === 'delete-category') return void deleteCategory(id);
  if (action === 'edit-topic') return void editTopic(id);
  if (action === 'delete-topic') return void deleteTopic(id);
  if (action === 'edit-quiz') return void editQuiz(id);
  if (action === 'delete-quiz') return void deleteQuiz(id);
  const fn = ACTIONS[action];
  if (fn) return void fn();
});
loadTree();
</script>
</body>
</html>`;
