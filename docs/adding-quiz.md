# クイズ追加手順（新規クイズごと）

JSONファイルを作成し、管理画面の「JSONで一括登録」から登録する。コマンドからの実行はしない。

`seed.sql` は全消去型のため**本番に流さないこと**。

## 前提

- マイグレ `0004_cloze.sql` 適用済みであること
- 本番URL（例: `https://kumon-ikanai-mon.xxx.workers.dev`）
- Basic認証の `BASIC_USER` / `BASIC_PASS`（管理画面アクセス時に使用）

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

## 2. 管理画面から登録する

1. 管理画面 `https://<本番URL>/#/admin` を開く
2. 「JSONで一括登録」に作成したJSONファイルを選択（または内容を貼り付け）する
3. 「内容を確認」で `category › topic › title` と10問表示を確認する
4. 「JSONで登録する」を押す

## 3. 確認する

1. 管理画面で10問（4択5問＋穴埋め5問）が登録されたことを目視確認する
2. `GET https://<本番URL>/api/quizzes/<id>/play` が10問返すことを確認する（ブラウザで開いて確認可）
3. `status: draft` で投入した場合のみ、管理画面または `PUT /api/quizzes/:id` で `published` に変更して公開する

## トラブルシュート

| 症状                             | 原因・対処                                                             |
| -------------------------------- | ---------------------------------------------------------------------- |
| 401 認証失敗                     | Basic認証の値が不一致。Secrets設定を確認                               |
| 同名quizが既にあります           | 同一topicに同名あり。新規タイトルにするか、既存は管理画面で編集        |
| questions はちょうど10問必要です | 10問揃える（内訳: 4択5問＋穴埋め5問。出題条件が10問固定のため）         |
| 空欄マーカー関連のエラー         | `{{n}}` の書き損じ（全角括弧・スペース混入・飛び番等）か、`answers` との個数不一致。綴りが `cloze_text` であることも確認 |
| quizは作成済み・問題登録失敗     | quizだけ作成済み。管理画面 `#/admin` から問題を追記する                |

## 注意

- コマンドから実行しない（コマンドから実行できる関連コードは削除済み）
- `seed.sql` を本番に流さない（全データ削除される）
- 認証情報はコミットしない
