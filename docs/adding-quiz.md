# クイズ追加手順（新規クイズごと）

JSONファイルを作成し、管理画面の「JSONで一括登録」から登録する。コマンドからの実行はしない。

`seed.sql` は全消去型のため**本番に流さないこと**。

## 1. JSONファイルを作成する

`data/quizzes/example.json` をコピーして編集する。必ずJSONファイルを作成すること（直書き・SQL直投入はしない）。

1クイズあたり10問。そのうち5問は4択（`single_choice`）、5問は穴埋め（`cloze_text`）にする。

形式:

```json
{
  "category": "プログラミング",
  "topic": "TypeScript",
  "quiz": { "title": "TypeScript基礎1", "difficulty": 2, "status": "published" },
  "questions": [
    {
      "statement": "...",
      "choice1": "...",
      "choice2": "...",
      "choice3": "...",
      "choice4": "...",
      "answer": 2,
      "explanation": "..."
    },
    {
      "questionType": "cloze_text",
      "statement": "江戸幕府を開いたのは徳川{{1}}である。幕府は約{{2}}年続いた。",
      "answers": ["家康", "260"],
      "explanation": "家康が開府。約260年続いた。"
    }
  ]
}
```

ルール:

- `questions` はちょうど10問。内訳は4択5問＋穴埋め（`cloze_text`）5問
- 4択: `statement` / `choice1〜4` はすべて必須、`answer` は1〜4。`questionType` は省略する
- 穴埋め: `questionType: "cloze_text"` を明示する（`close_text` と書かない。言語学用語 cloze test 由来）
- 穴埋めの問題文中の空欄は `{{1}}`, `{{2}}` … と書く（半角波括弧＋1始まり連番。飛び番・0始まり不可）
- 穴埋めの `answers` は空欄番号順に1〜20個（各1〜100文字）。`{{n}}` と個数・順序を一致させること
- 1quizあたりの問題数カウントは「文章数」（空欄数ではない）
- 正答は完全一致（前後空白のみ除去）。別解は現在未対応（1空欄に複数正答を入れない）
- 同一の問題に `question_choices` と穴埋め定義を混在させない
- `difficulty` 1〜5、`quiz.status` 省略時は `published`（登録後すぐ出題される）。下書きにしたい場合のみ `"draft"` を明示する
- 同名 `category` / `topic` は再利用される。同名 `quiz` が同じtopicに存在すると中断（誤上書き防止）

## 2. 問題文の品質ルール

- 最新の情報を取得し、正確性を重視すること
- `explanation` には正解の解説と、なぜ他の選択肢（不正解）が違うのかを含めること
- 4択問題の場合
  - 選択肢の文量は均等になるようにすること
  - 問題文と4択の選択肢は文量が多くなっても良い
- 穴埋め問題の場合
  - 文量は多くなっても良い
  - 空欄は1問あたり1〜5個作って良い

## 3. 本番データを確認する

JSONファイルを作成する前に、本番の問題と重複がないこと、既存のカテゴリ・トピック分類を確認する。

テーブル一覧を確認する:

```bash
pnpm exec wrangler d1 execute kumon-ikanai-mon-db --remote --command "SELECT name FROM sqlite_master WHERE type='table';"
```

既存のカテゴリ・トピック・クイズ分類を確認する（新規クイズの分類分けの参考にする）:

```bash
pnpm exec wrangler d1 execute kumon-ikanai-mon-db --remote --command "SELECT c.title AS category, t.title AS topic, q.title AS quiz, q.difficulty, q.status FROM quizzes q JOIN topics t ON t.id=q.topic_id JOIN categories c ON c.id=t.category_id ORDER BY c.title, t.title, q.title;"
```

問題文の重複がないことを確認する。完全一致だけでなく、似たような問題も登録しないこと。

完全一致の重複を確認する（結果が0件なら完全一致の重複なし）:

```bash
pnpm exec wrangler d1 execute kumon-ikanai-mon-db --remote --command "SELECT v.statement AS s, COUNT(*) AS cnt FROM question_versions v JOIN questions q ON q.current_version_id = v.id GROUP BY v.statement HAVING cnt > 1;"
```

似た問題の確認は、新規問題のキーワードで検索し、ヒットした問題文を目視で見比べる:

```bash
pnpm exec wrangler d1 execute kumon-ikanai-mon-db --remote --command "SELECT z.title AS quiz, v.statement AS s FROM question_versions v JOIN questions q ON q.current_version_id = v.id JOIN quizzes z ON z.id = q.quiz_id WHERE v.statement LIKE '%<キーワード>%';"
```

同じトピックの既存問題を一覧して見比べる:

```bash
pnpm exec wrangler d1 execute kumon-ikanai-mon-db --remote --command "SELECT z.title AS quiz, v.statement AS s FROM question_versions v JOIN questions q ON q.current_version_id = v.id JOIN quizzes z ON z.id = q.quiz_id JOIN topics t ON t.id = z.topic_id WHERE t.title = '<トピック名>';"
```
