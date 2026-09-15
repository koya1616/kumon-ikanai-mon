# 本番DBへの問題追加手順（新規クイズごと）

API 経由で category / topic / quiz + 10問を一括投入する。`seed.sql` は全消去型のため**本番に流さないこと**。

## 前提

- 本番URL（例: `https://kumon-ikanai-mon.xxx.workers.dev`）
- Basic認証の `BASIC_USER` / `BASIC_PASS`（本番Secretsに設定済みであること）
  - 確認: `pnpm exec wrangler secret list`
  - 未設定なら: `pnpm exec wrangler secret put BASIC_USER` / `pnpm exec wrangler secret put BASIC_PASS`

## 1. 入力JSONを用意する

`data/quizzes/example.json` をコピーして編集する。

```bash
cp data/quizzes/example.json data/quizzes/my-quiz.json
```

形式:

```json
{
  "category": "プログラミング",
  "topic": "TypeScript",
  "quiz": { "title": "TypeScript基礎1", "difficulty": 2, "status": "draft" },
  "questions": [
    {
      "statement": "...",
      "choice1": "...",
      "choice2": "...",
      "choice3": "...",
      "choice4": "...",
      "answer": 2,
      "explanation": "..."
    }
  ]
}
```

ルール:

- `questions` はちょうど10問
- `choice1〜4` はすべて必須、`answer` は1〜4
- `quiz.status` 省略時は `draft`（いきなり公開しないため）。確認後に公開する
- 同名 `category` / `topic` は再利用される。同名 `quiz` が同じtopicに存在すると中断（誤上書き防止）

## 2. dry-run で検証する

POSTせず検証と重複チェックだけ行う。

```bash
BASIC_USER=admin BASIC_PASS=xxx \
  pnpm quiz:add -- --file data/quizzes/my-quiz.json --url https://<本番URL> --dry-run
```

`dry-run OK` と出れば次へ。エラーが出たらJSONを修正する。

## 3. ローカルで試す（任意だが推奨）

```bash
pnpm dev # 別ターミナルで起動
BASIC_USER=admin BASIC_PASS=password \
  pnpm quiz:add -- --file data/quizzes/my-quiz.json --url http://127.0.0.1:8787
```

`.dev.vars` の値と `BASIC_USER/PASS` を合わせること。

## 4. 本番に投入する

```bash
BASIC_USER=xxx BASIC_PASS=xxx \
  pnpm quiz:add -- --file data/quizzes/my-quiz.json --url https://<本番URL>
```

成功例:

```
category再利用: id=3 「プログラミング」
topic再利用: id=5 「Golang」
quiz作成: id=12 「Golang基礎2」
questions登録: 10問 (quizId=12)
```

## 5. 確認して公開する

1. `GET https://<本番URL>/api/quizzes/<id>/play` が10問返すことを確認
2. 管理画面 `https://<本番URL>/#/admin` で目視確認
3. 問題なければ公開:

```bash
curl -u "xxx:xxx" -X PUT https://<本番URL>/api/quizzes/<id> \
  -H 'Content-Type: application/json' -d '{"status":"published"}'
```

## トラブルシュート

| 症状                             | 原因・対処                                                             |
| -------------------------------- | ---------------------------------------------------------------------- |
| 401 認証失敗                     | `BASIC_USER/PASS` が本番Secretsと不一致。`wrangler secret list` で確認 |
| 同名quizが既にあります           | 同一topicに同名あり。新規タイトルにするか、既存は管理画面で編集        |
| questions はちょうど10問必要です | 10問揃える（出題条件が10問固定のため）                                 |
| quizは作成済み・問題登録失敗     | quizだけ作成済み。管理画面 `#/admin` から問題を追記する                |

## 注意

- `seed.sql` を `--remote` で流さない（全データ削除される）
- 認証情報はコミットしない。シェル履歴に残るのが嫌なら環境変数を `.env.local` 的に別管理する
