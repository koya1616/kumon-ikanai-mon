# クイズ追加手順（新規クイズごと）

JSONファイルを作成し、管理画面の「JSONで一括登録」から登録する。コマンドからの実行はしない。

`seed.sql` は全消去型のため**本番に流さないこと**。

## 1. JSONファイルを作成する

`data/quizzes/example.json` をコピーして編集する。必ずJSONファイルを作成すること（直書き・SQL直投入はしない）。

1クイズあたり10問。4択（`single_choice`）・穴埋め（`cloze_text`）・並べ替え（`order_blocks`）を 4:3:3 の割合で作成する。どの形式を4問にするかはクイズごとにランダムに決める（例: 4択4・穴埋め3・並べ替え3 / 4択3・穴埋め3・並べ替え4）。

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
    },
    {
      "questionType": "order_blocks",
      "statement": "次のSQLが正しく動く順序に並べ替えよ。",
      "items": ["SELECT name FROM users", "WHERE age >= 20", "ORDER BY name", "LIMIT 10"],
      "explanation": "SELECT → WHERE → ORDER BY → LIMIT の順に書く。"
    }
  ]
}
```

ルール:

- `questions` はちょうど10問。3形式を 4:3:3 の割合とし、どの形式を4問にするかはクイズごとにランダムに決める
- 4択: `statement` / `choice1〜4` はすべて必須、`answer` は1〜4。`questionType` は省略する
- 穴埋め: `questionType: "cloze_text"` を明示する（`close_text` と書かない。言語学用語 cloze test 由来）
- 穴埋めの問題文中の空欄は `{{1}}`, `{{2}}` … と書く（半角波括弧＋1始まり連番。飛び番・0始まり不可）
- 穴埋めの `answers` は空欄番号順に1〜20個（各1〜100文字）。`{{n}}` と個数・順序を一致させること
- 並べ替え: `questionType: "order_blocks"` を明示する。`items` は正しい順序のブロックを4〜20個（各1〜500文字・空不可・重複不可）。1ブロック=1行/1単語/1コマンド断片など任意のまとまり。出題時はシャッフルされ、採点は完全一致（前後空白のみ除去・大文字小文字区別）
- 1quizあたりの問題数カウントは「文章数」（空欄数ではない）
- 正答は完全一致（前後空白のみ除去）。別解は現在未対応（1空欄に複数正答を入れない）
- 同一の問題に `question_choices` と穴埋め定義を混在させない
- `difficulty` 1〜5（目安は「2. 難易度の目安」を参照）、`quiz.status` 省略時は `published`（登録後すぐ出題される）。下書きにしたい場合のみ `"draft"` を明示する
- 同名 `category` / `topic` は再利用される。同名 `quiz` が同じtopicに存在すると中断（誤上書き防止）

## 2. 難易度の目安

`difficulty` は想定する解答者のレベルで決める。1クイズ内の問題はすべて同じレベルに揃える。

| difficulty | レベル | 問題作成の基準 |
| --- | --- | --- |
| 1 | ジュニア | 日常業務でよく使う機能の正しい使い方。基本の組み合わせや、初学者がつまずきやすい挙動 |
| 2 | ハイジュニア | 仕組み・理由の理解を問う。複数の方法から状況に合うものを選ぶ、不具合の原因を特定するなど実務の判断 |
| 3 | ミドル | 設計・性能・セキュリティ・運用のトレードオフ。内部動作や仕様の細部、エッジケースを踏まえた判断 |
| 4 | シニア | 仕様・実装レベルの深い知識、大規模・長期運用での設計判断、ツールや技術の選定理由・限界を説明できるか |
| 5 | エキスパート / プリンシパル | 言語・ランタイム・プロトコルの内部実装や標準仕様の細部、稀な障害の根本原因分析、組織・システム全体に影響するアーキテクチャ判断。一次情報（仕様書・ソースコード）を読み込んでいないと解けない水準 |

## 3. 問題文の品質ルール

- 最新の情報を取得し、正確性を重視すること
- `explanation` には正解の解説と、なぜ他の選択肢（不正解）が違うのかを含めること
- 4択問題の場合
  - 選択肢の文量は均等になるようにすること
  - 問題文と4択の選択肢は文量が多くなっても良い
- 穴埋め問題の場合
  - 文量は多くなっても良い
  - 空欄は1問あたり1〜5個作って良い
- 並べ替え問題の場合
  - コマンド・SQL・コードなどの手順・文の順序を問うこと
  - ブロックは1問あたり4〜20個、各ブロックは短く区切ること（1行/1文/1手順が目安）
  - 順序を入れ替えると意味が変わる・動かなくなる組み合わせにすること

## 4. 本番データを確認する

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
