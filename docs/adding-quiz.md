# クイズ追加ルール

適用範囲: 新規クイズの追加はすべてこのファイルに従う。登録は JSON ファイル作成 → 管理画面「JSONで一括登録」のみ。コマンドからの登録・直書き・SQL直投入はしない。

`seed.sql` は全消去型のため**本番に流さないこと**。

必ず最新の情報をWEB searchすること。正確性を重視する。

## ルール

### 構成

- R1: `questions` はちょうど10問。3形式を 4:3:3 の割合にし、どの形式を4問にするかはクイズごとにランダムに決める（例: 4択4・穴埋め3・並べ替え3）
- R2: 1クイズ内の `difficulty` はすべて同じレベルに揃える（目安は下表）
- R3: 問題数のカウントは「文章数」（空欄数ではない）

### 4択（`single_choice`）

- R4: `statement` / `choice1`〜`choice4` はすべて必須、`answer` は1〜4。`questionType` は省略する（省略＝4択として扱われる。根拠: `src/domain.ts` `normalizeImportQuestion`）
- R5: 選択肢の文量は均等にする。正解の当たりやすさ（長さ・詳しさだけが違う等）を作らない

### 穴埋め（`cloze_text`）

- R6: `questionType: "cloze_text"` を明示する（`close_text` と書かない。言語学用語 cloze test 由来）
- R7: 空欄は `{{1}}`, `{{2}}` … と書く（半角波括弧＋1始まり連番。飛び番・0始まり不可）
- R8: `answers` は空欄番号順に1〜20個（各1〜100文字）。`{{n}}` と個数・順序を一致させる（根拠: `src/domain.ts` `CLOZE_MAX_BLANKS` / `CLOZE_ANSWER_MAX_LENGTH`）
- R9: 1問あたりの空欄は1〜5個にする
- R10: 別解は未対応のため、1空欄に複数正答を入れない。採点は前後空白のみ除去・大文字小文字は区別しない（根拠: `isClozeAnswerEqual` が `toLowerCase` 比較）

### 並べ替え（`order_blocks`）

- R11: `questionType: "order_blocks"` を明示する
- R12: `items` は正しい順序のブロックを4〜20個（各1〜500文字・空不可・重複不可。根拠: `src/domain.ts` `ORDER_MIN_ITEMS` / `ORDER_MAX_ITEMS`）。1ブロック=1行/1単語/1コマンド断片など任意のまとまり
- R13: コマンド・SQL・コードなどの手順・文の順序を問うこと。順序を入れ替えると意味が変わる・動かなくなる組み合わせにすること。各ブロックは短く区切る（1行/1文/1手順が目安）
- R14: 出題時はシャッフルされ、採点は前後空白のみ除去・大文字小文字区別（根拠: `isOrderItemEqual`）

### 解説・分類

- R15: `explanation` は必須級とする。正解の解説に加え、4択ではなぜ他の選択肢が違うのかを含める
- R16: 同名 `category` / `topic` は再利用される。新規 `quiz.title` が同一 `topic` に存在する場合は登録が中断される（誤上書き防止）ため、事前に重複確認する
- R17: `quiz.status` 省略時は `published`（登録後すぐ出題される）。下書きにしたい場合のみ `"draft"` を明示する
- R18: 同一の問題に `question_choices` と穴埋め定義を混在させない

### 問題文の長さ

- R19: どの形式でも問題文（`statement`）の長さは問わない。長くても問題ない。コード・SQL・複数段落を含めた長文でよい（根拠: `src/domain.ts` の各スキーマで `statement` に上限なし、`docs/er-diagram.md` でも「長文OK」）
- R20: 長さ上限があるのは穴埋めの `answers`（各100文字以内）と並べ替えの `items`（各500文字以内）のみ。4択の選択肢（`choice1`〜`choice4`）と `explanation` に上限はないが、選択肢は R5（文量均等）を守る

## 難易度の目安

| difficulty | レベル                      | 問題作成の基準                                                                                                                                                                                   |
| ---------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1          | ジュニア                    | 日常業務でよく使う機能の正しい使い方。基本の組み合わせや、初学者がつまずきやすい挙動                                                                                                             |
| 2          | ハイジュニア                | 仕組み・理由の理解を問う。複数の方法から状況に合うものを選ぶ、不具合の原因を特定するなど実務の判断                                                                                               |
| 3          | ミドル                      | 設計・性能・セキュリティ・運用のトレードオフ。内部動作や仕様の細部、エッジケースを踏まえた判断                                                                                                   |
| 4          | シニア                      | 仕様・実装レベルの深い知識、大規模・長期運用での設計判断、ツールや技術の選定理由・限界を説明できるか                                                                                             |
| 5          | エキスパート / プリンシパル | 言語・ランタイム・プロトコルの内部実装や標準仕様の細部、稀な障害の根本原因分析、組織・システム全体に影響するアーキテクチャ判断。一次情報（仕様書・ソースコード）を読み込んでいないと解けない水準 |

## 問題形式

`data/quizzes/example.json` をコピーして編集する。

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

## チェックリスト

上から順に実行し、すべてにチェックしてから登録する。できない項目は飛ばさず、代替結果を報告に残す。

### A. 作成前の調査（R16）

ローカル確認は不要。本番への確認のみ行う。`--remote` が実行できない場合（認証エラー等）はその旨を報告に記録する。

- [ ] A1. 本番の分類・重複を確認した（新規分類の妥当性判断、同一topic内の同名 `quiz` 有無、似たキーワードの目視見比べ）
  ```bash
  pnpm exec wrangler d1 execute kumon-ikanai-mon-db --remote --command "SELECT c.title AS category, t.title AS topic, q.title AS quiz, q.difficulty, q.status FROM quizzes q JOIN topics t ON t.id=q.topic_id JOIN categories c ON c.id=t.category_id ORDER BY c.title, t.title, q.title;"
  pnpm exec wrangler d1 execute kumon-ikanai-mon-db --remote --command "SELECT z.title AS quiz, v.statement AS s FROM question_versions v JOIN questions q ON q.current_version_id = v.id JOIN quizzes z ON z.id = q.quiz_id WHERE v.statement LIKE '%<キーワード>%';"
  pnpm exec wrangler d1 execute kumon-ikanai-mon-db --remote --command "SELECT z.title AS quiz, v.statement AS s FROM question_versions v JOIN questions q ON q.current_version_id = v.id JOIN quizzes z ON z.id = q.quiz_id JOIN topics t ON t.id = z.topic_id WHERE t.title = '<トピック名>';"
  ```

### B. 作成（R1〜R20）

- [ ] B1. 10問ちょうど・内訳 4:3:3（どれを4問にするかはランダム）で作成した
- [ ] B2. 4択は R4・R5 を満たす（必須項目・`answer` 1〜4・文量均等）
- [ ] B3. 穴埋めは R6〜R10 を満たす（`cloze_text` 表記・マーカー連番・個数一致・空欄1〜5個・別解なし）
- [ ] B4. 並べ替えは R11〜R14 を満たす（4〜20ブロック・空/重複なし・順序に意味がある）
- [ ] B5. 解説は R15 を満たす（正解の解説＋4択は不正解の理由）
- [ ] B6. 最新情報を確認し、正確性を優先した（仕様・バージョン依存の内容は一次情報に当たった）

### C. 登録前の検証

- [ ] C1. JSON構文・問数・内訳を機械検証した
  ```bash
  python3 -c "import json,re; p='data/quizzes/<ファイル名>.json'; d=json.load(open(p)); qs=d['questions']; assert len(qs)==10, len(qs); c={};
  for q in qs: c[q.get('questionType','single_choice')] = c.get(q.get('questionType','single_choice'),0)+1
  print(c); assert sorted(c.values())==[3,3,4], c"
  ```
- [ ] C2. 形式ごとの制約を目視した（穴埋め: マーカー連番・`answers` 個数一致・各100文字以内／並べ替え: 4〜20個・各500文字以内・重複なし／4択: `questionType` なし・`answer` 1〜4）。詳細バリデーション（`quizImportSchema` / `normalizeImportQuestion`）は登録時に実行される
