# 穴埋め問題の追加手順（記述式）

穴埋め（`cloze_text`）は4択と混在できる。投入方法は2つある（推奨はJSON一括）。`seed.sql` は全消去型のため**本番に流さないこと**。

## 前提

- マイグレ `0004_cloze.sql` 適用済みであること
- 記法: 問題文中の空欄は `{{1}}`, `{{2}}` … と書く（半角波括弧＋1始まり連番。飛び番・0始まり不可）

## 方法A: JSON一括（推奨）

`docs/adding-quiz.md` の手順で、questions要素を穴埋め形式にする。4択と混在可。

```json
{
  "category": "社会",
  "topic": "歴史",
  "quiz": { "title": "江戸時代", "difficulty": 2, "status": "draft" },
  "questions": [
    {
      "questionType": "cloze_text",
      "statement": "江戸幕府を開いたのは徳川{{1}}である。幕府は約{{2}}年続いた。",
      "answers": ["家康", "260"],
      "explanation": "家康が開府。約260年続いた。"
    }
  ]
}
```

```bash
BASIC_USER=xxx BASIC_PASS=xxx \
  pnpm quiz:add -- --file data/quizzes/my-cloze.json --url https://<本番URL> --dry-run
BASIC_USER=xxx BASIC_PASS=xxx \
  pnpm quiz:add -- --file data/quizzes/my-cloze.json --url https://<本番URL>
```

または管理画面の「JSONで一括登録」から同形式で登録する。

ルール:

- 1quizあたりの問題数カウントは「文章数」（空欄数ではない）。10文章なら `QUESTIONS_PER_QUIZ=10` 準拠
- `answers` は空欄番号順に1〜20個（各1〜100文字）。`{{n}}` と個数・順序を一致させること
- `difficulty` 1〜5、`status` は作業中 `draft` → 完了後 `published`

## 方法B: SQL直投入

1文章ごとに次の順でINSERTする（`<QUIZ_ID>` を置換）。

```sql
-- (a) 問題の束ね行
INSERT INTO questions (quiz_id) VALUES (<QUIZ_ID>);
-- <QID> = 採番されたid（SELECT max(id) FROM questions; で確認）

-- (b) 版（statementに{{n}}マーカー、points_possible=空欄数）
INSERT INTO question_versions (question_id, version, statement, explanation, question_type, points_possible)
VALUES (
  <QID>, 1,
  '江戸幕府を開いたのは徳川{{1}}である。幕府は約{{2}}年続いた。',
  '家康が開府。約260年続いた。',
  'cloze_text', 2
);
-- <VERSION_ID> = 採番された版id（SELECT max(id) FROM question_versions; で確認）
UPDATE questions SET current_version_id = <VERSION_ID> WHERE id = <QID>;

-- (c) 空欄定義（{{n}} と1対1に対応させる）
INSERT INTO question_cloze_blanks (question_version_id, blank_index) VALUES
  (<VERSION_ID>, 1),
  (<VERSION_ID>, 2);

-- (d) 正答（1空欄1行。trim後完全一致で採点される文字列をそのまま書く）
INSERT INTO question_cloze_answers (blank_id, answer_text, sort_order)
SELECT id, CASE blank_index WHEN 1 THEN '家康' ELSE '260' END, 0
FROM question_cloze_blanks WHERE question_version_id = <VERSION_ID>;
```

`wrangler` 実行例（本番）:

```bash
pnpm exec wrangler d1 execute kumon-ikanai-mon-db --remote --file=./data/cloze/my-quiz.sql
```

## 3. 検証する（公開前必須）

```sql
-- (1) マーカー数と空欄定義数の一致（差が出たらNG）
WITH markers(statement, n) AS (
  SELECT statement,
    (LENGTH(statement) - LENGTH(REPLACE(statement, '{{', ''))) / 2 FROM question_versions WHERE id = <VERSION_ID>
)
SELECT m.n AS markers_in_statement, COUNT(b.id) AS blanks
FROM markers m LEFT JOIN question_cloze_blanks b ON b.question_version_id = <VERSION_ID>;

-- (2) 空欄ごとの正答行数（各1行であること）
SELECT b.blank_index, COUNT(a.id) AS answers
FROM question_cloze_blanks b LEFT JOIN question_cloze_answers a ON a.blank_id = b.id
WHERE b.question_version_id = <VERSION_ID> GROUP BY 1 ORDER BY 1;

-- (3) choices混入チェック（穴埋め版に選択肢が無いこと）
SELECT COUNT(*) AS choices FROM question_choices WHERE question_version_id = <VERSION_ID>;
-- 期待: markers=blanks、answers各1、choices=0
```

## 4. 公開する

```bash
curl -u "xxx:xxx" -X PUT https://<本番URL>/api/quizzes/<id> \
  -H 'Content-Type: application/json' -d '{"status":"published"}'
```

## ルール

- `question_type='cloze_text'` 固定（`close_text` と書かない。言語学用語 cloze test 由来）
- `statement` の `{{n}}` 集合と `blanks.blank_index` 集合は完全一致させること（DB制約なし・アプリ責務）
- 正答は完全一致（前後空白のみ除去）。別解は現在未対応（`answers` に複数行入れない）
- 同一版に `question_choices` と `question_cloze_blanks` を混在させない
- 編集時は UPDATE せず新規 `version` をINSERTし、`current_version_id` を差し替える（履歴保持）。新版には blanks/answers を作り直す（旧版の行は残す）
- 履歴（本番・復習の回答）がある版は削除・改変しない。`RESTRICT` で拒否される

## トラブルシュート

| 症状 | 原因・対処 |
|---|---|
| `CHECK constraint failed: question_type ...` | `single_choice` / `cloze_text` 以外を指定している。綴り確認（`close` ではない） |
| `CHECK constraint failed: match_mode ...` | `match_mode` を指定したか、誤値。省略時 `exact_trim` のため列指定不要 |
| `UNIQUE constraint failed: ... blank_index` | 同一版に同番号を重複INSERT。`{{n}}` と突き合わせる |
| `FOREIGN KEY constraint failed`（版DELETE時） | 回答履歴あり。削除せず新版発行で対応 |
| マーカー数と空欄数が合わない | `{{n}}` の書き損じ（全角括弧・スペース混入等）。`(1)` のSQLで特定 |

## 注意

- `seed.sql` を `--remote` で流さない（全データ削除される）
- SQLファイルに認証情報は書かない。履歴に残るのが嫌なら対話式に分割実行する
- 管理画面の問題エディタ・`POST /api/questions/batch` も穴埋め対応済み（要素ごとに4択/穴埋めを切替可）
