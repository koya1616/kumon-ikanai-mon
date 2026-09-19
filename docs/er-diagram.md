# DB ER図

`migrations/0001_schema.sql` が正本。D1 (SQLite) / `wrangler.jsonc` の `migrations_dir: migrations` から適用される。

```mermaid
erDiagram
    categories {
        INTEGER id PK "AUTOINCREMENT"
        TEXT title "UNIQUE NOT NULL"
        TEXT created_at "DEFAULT datetime('now')"
        TEXT updated_at "DEFAULT datetime('now')"
    }
    topics {
        INTEGER id PK "AUTOINCREMENT"
        INTEGER category_id FK "NOT NULL, CASCADE"
        TEXT title "NOT NULL"
        TEXT created_at "DEFAULT datetime('now')"
        TEXT updated_at "DEFAULT datetime('now')"
    }
    quizzes {
        INTEGER id PK "AUTOINCREMENT"
        INTEGER topic_id FK "NOT NULL, CASCADE"
        TEXT title "NOT NULL"
        INTEGER difficulty "1-5, DEFAULT 1"
        TEXT status "draft|published|archived"
        TEXT created_at "DEFAULT datetime('now')"
        TEXT updated_at "DEFAULT datetime('now')"
    }
    questions {
        INTEGER id PK "AUTOINCREMENT"
        INTEGER quiz_id FK "NOT NULL, CASCADE"
        INTEGER current_version_id "NULL可, 論理FK → question_versions.id"
        TEXT created_at "DEFAULT datetime('now')"
        TEXT updated_at "DEFAULT datetime('now')"
    }
    question_versions {
        INTEGER id PK "AUTOINCREMENT"
        INTEGER question_id FK "NOT NULL, CASCADE"
        INTEGER version "NOT NULL, 1始まり"
        TEXT statement "NOT NULL, 長文OK・穴埋めは{{1}}マーカー埋め込み"
        TEXT explanation "DEFAULT ''"
        TEXT question_type "single_choice|cloze_text|order_blocks"
        INTEGER points_possible ">=1, DEFAULT 1（将来の配点拡張予約）"
        TEXT created_at "DEFAULT datetime('now')"
    }
    question_choices {
        INTEGER id PK "AUTOINCREMENT"
        INTEGER question_version_id FK "NOT NULL, CASCADE"
        INTEGER position ">=1 NOT NULL"
        TEXT choice_text "NOT NULL"
        INTEGER is_correct "0|1"
    }
    attempts {
        INTEGER id PK "AUTOINCREMENT"
        INTEGER quiz_id FK "NOT NULL, RESTRICT"
        INTEGER score ">=0, score<=total"
        INTEGER total ">=0"
        TEXT completed_at "NULL可"
        TEXT created_at "DEFAULT datetime('now')"
        TEXT updated_at "DEFAULT datetime('now')"
    }
    attempt_questions {
        INTEGER id PK "AUTOINCREMENT"
        INTEGER attempt_id FK "NOT NULL, CASCADE"
        INTEGER question_version_id FK "NOT NULL, RESTRICT"
        INTEGER position ">=1 NOT NULL"
        TEXT created_at "DEFAULT datetime('now')"
    }
    attempt_answers {
        INTEGER id PK "AUTOINCREMENT"
        INTEGER attempt_question_id FK "UNIQUE, CASCADE, 1:1"
        INTEGER choice_position "NULL可（cloze行はNULL）, >=1"
        TEXT choice_text_snapshot "DEFAULT ''"
        TEXT answer_text_snapshot "DEFAULT ''（cloze集約行の連結回答）"
        INTEGER correct "0|1 NOT NULL, clozeは全空欄正解時のみ1"
        TEXT created_at "DEFAULT datetime('now')"
    }
    question_cloze_blanks {
        INTEGER id PK "AUTOINCREMENT"
        INTEGER question_version_id FK "NOT NULL, CASCADE"
        INTEGER blank_index ">=1 NOT NULL, {{n}}に対応"
        INTEGER points ">=1, DEFAULT 1（重み付け予約）"
        TEXT match_mode "exact_trim固定（将来拡張予約）"
        TEXT created_at "DEFAULT datetime('now')"
    }
    question_cloze_answers {
        INTEGER id PK "AUTOINCREMENT"
        INTEGER blank_id FK "NOT NULL, CASCADE"
        TEXT answer_text "NOT NULL, 完全一致（trimのみ）"
        INTEGER sort_order "DEFAULT 0, 先頭=代表答"
        TEXT created_at "DEFAULT datetime('now')"
    }
    attempt_cloze_answers {
        INTEGER id PK "AUTOINCREMENT"
        INTEGER attempt_question_id FK "NOT NULL, CASCADE"
        INTEGER blank_index ">=1 NOT NULL"
        TEXT user_answer_text "NOT NULL, 生入力"
        INTEGER correct "0|1 NOT NULL"
        TEXT created_at "DEFAULT datetime('now')"
    }
    question_order_items {
        INTEGER id PK "AUTOINCREMENT"
        INTEGER question_version_id FK "NOT NULL, CASCADE"
        INTEGER position ">=1 NOT NULL, 正解順"
        TEXT item_text "NOT NULL, 1ブロック=1行/1単語/1断片"
        INTEGER points ">=1, DEFAULT 1（重み付け予約）"
        TEXT match_mode "exact_trim_cs固定（将来拡張予約）"
        INTEGER is_distractor "0固定（ダミーブロック予約）"
    }
    attempt_order_answers {
        INTEGER id PK "AUTOINCREMENT"
        INTEGER attempt_question_id FK "NOT NULL, CASCADE"
        INTEGER position ">=1 NOT NULL, 提出順"
        TEXT user_item_text "NOT NULL, 生提出"
        INTEGER correct "0|1 NOT NULL"
    }
    review_order_answers {
        INTEGER id PK "AUTOINCREMENT"
        INTEGER review_answer_id FK "NOT NULL, CASCADE"
        INTEGER position ">=1 NOT NULL, 提出順"
        TEXT user_item_text "NOT NULL, 生提出"
        INTEGER correct "0|1 NOT NULL"
    }
    review_answers {
        INTEGER id PK "AUTOINCREMENT"
        TEXT session_id "NULL可"
        INTEGER question_id FK "RESTRICT"
        INTEGER question_version_id FK "RESTRICT"
        INTEGER quiz_id FK "RESTRICT"
        INTEGER choice_position "NULL可（cloze行はNULL）"
        TEXT choice_text_snapshot "DEFAULT ''"
        TEXT answer_text_snapshot "DEFAULT ''"
        INTEGER correct "0|1, clozeは全空欄正解時のみ1"
        TEXT created_at "DEFAULT datetime('now')"
    }
    review_cloze_answers {
        INTEGER id PK "AUTOINCREMENT"
        INTEGER review_answer_id FK "NOT NULL, CASCADE"
        INTEGER blank_index ">=1 NOT NULL"
        TEXT user_answer_text "NOT NULL, 生入力"
        INTEGER correct "0|1 NOT NULL"
        TEXT created_at "DEFAULT datetime('now')"
    }
    question_bookmarks {
        INTEGER id PK "AUTOINCREMENT"
        INTEGER question_id FK "UNIQUE NOT NULL, CASCADE"
        TEXT created_at "DEFAULT datetime('now')"
    }

    categories ||--o{ topics : "CASCADE"
    topics ||--o{ quizzes : "CASCADE"
    quizzes ||--o{ questions : "CASCADE"
    questions ||--o{ question_versions : "CASCADE"
    questions ||--o| question_versions : "current_version_id(論理FK)"
    question_versions ||--o{ question_choices : "CASCADE"
    question_versions ||--o{ question_cloze_blanks : "CASCADE"
    question_cloze_blanks ||--o{ question_cloze_answers : "CASCADE"
    question_versions ||--o{ question_order_items : "CASCADE"
    attempt_questions ||--o{ attempt_cloze_answers : "CASCADE"
    attempt_questions ||--o{ attempt_order_answers : "CASCADE"
    review_answers ||--o{ review_cloze_answers : "CASCADE"
    review_answers ||--o{ review_order_answers : "CASCADE"
    quizzes ||--o{ attempts : "RESTRICT"
    attempts ||--o{ attempt_questions : "CASCADE"
    question_versions ||--o{ attempt_questions : "RESTRICT"
    attempt_questions ||--|| attempt_answers : "1:1 CASCADE"
    questions ||--o| question_bookmarks : "1:1 CASCADE"
```

## リレーションシップ一覧

| 親 → 子                                        | FK                                                  | ON DELETE                 | 備考                                                                                        |
| ---------------------------------------------- | --------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------- |
| categories → topics                            | topics.category_id                                  | CASCADE                   | カテゴリ削除で配下も消える                                                                  |
| topics → quizzes                               | quizzes.topic_id                                    | CASCADE                   | UNIQUE(topic_id, title)                                                                     |
| quizzes → questions                            | questions.quiz_id                                   | CASCADE                   | 問題本体は薄い行。文面は versions に持つ                                                    |
| questions → question_versions                  | question_versions.question_id                       | CASCADE                   | 編集時は UPDATE せず新規 version を INSERT。UNIQUE(question_id, version)                    |
| questions → question_versions (current)        | questions.current_version_id → question_versions.id | — (DDL上のFKなし・論理FK) | `seed.sql` のように UPDATE で最新版を指す                                                   |
| question_versions → question_choices           | question_choices.question_version_id                | CASCADE                   | N択・○×に耐える設計。UNIQUE(question_version_id, position)                                  |
| quizzes → attempts                             | attempts.quiz_id                                    | RESTRICT                  | 学習履歴はコンテンツ削除で消さない。CHECK(score <= total)                                   |
| attempts → attempt_questions                   | attempt_questions.attempt_id                        | CASCADE                   | 出題スナップショット。UNIQUE(attempt_id, position), UNIQUE(attempt_id, question_version_id) |
| question_versions → attempt_questions          | attempt_questions.question_version_id               | RESTRICT                  | 出題時点の版を固定参照                                                                      |
| attempt_questions → attempt_answers            | attempt_answers.attempt_question_id                 | CASCADE                   | UNIQUE制約で 1:1 (出題1行に回答1行)。cloze行はchoice_position=NULL＋明細参照                |
| question_versions → question_cloze_blanks      | question_cloze_blanks.question_version_id           | CASCADE                   | 版ごとに空欄定義。UNIQUE(question_version_id, blank_index)。statementの{{n}}に対応          |
| question_cloze_blanks → question_cloze_answers | question_cloze_answers.blank_id                     | CASCADE                   | 1空欄N正答（今は1行運用）。UNIQUE(blank_id, answer_text)                                    |
| attempt_questions → attempt_cloze_answers      | attempt_cloze_answers.attempt_question_id           | CASCADE                   | 空欄単位の回答明細・部分点。UNIQUE(attempt_question_id, blank_index)                        |
| question_versions → question_order_items       | question_order_items.question_version_id            | CASCADE                   | 版ごとに正順ブロック。UNIQUE(question_version_id, position)。positionが正解順               |
| attempt_questions → attempt_order_answers      | attempt_order_answers.attempt_question_id           | CASCADE                   | 位置単位の回答明細・部分点。UNIQUE(attempt_question_id, position)                           |
| review_answers → review_cloze_answers          | review_cloze_answers.review_answer_id               | CASCADE                   | 復習の空欄単位明細。UNIQUE(review_answer_id, blank_index)                                   |
| review_answers → review_order_answers          | review_order_answers.review_answer_id               | CASCADE                   | 復習の位置単位明細。UNIQUE(review_answer_id, position)                                      |
| questions → question_bookmarks                 | question_bookmarks.question_id                      | CASCADE                   | 1問1ブックマーク。UNIQUE(question_id)。解答履歴と分離                                       |

## UNIQUE / CHECK 一覧

- categories.title: UNIQUE
- topics: UNIQUE(category_id, title)
- quizzes: UNIQUE(topic_id, title), difficulty 1-5, status IN (draft, published, archived)
- question_versions: UNIQUE(question_id, version), question_type IN (single_choice, cloze_text, order_blocks), points_possible >= 1
- question_choices: UNIQUE(question_version_id, position), position >= 1, is_correct IN (0,1)
- question_cloze_blanks: UNIQUE(question_version_id, blank_index), blank_index >= 1, points >= 1, match_mode = 'exact_trim'
- question_cloze_answers: UNIQUE(blank_id, answer_text)
- question_order_items: UNIQUE(question_version_id, position), position >= 1, points >= 1, match_mode IN ('exact_trim_cs','exact_trim_ci'), is_distractor IN (0,1)
- attempt_order_answers: UNIQUE(attempt_question_id, position), position >= 1, correct IN (0,1)
- review_order_answers: UNIQUE(review_answer_id, position), position >= 1, correct IN (0,1)
- attempts: CHECK(score >= 0), CHECK(total >= 0), CHECK(score <= total)
- attempt_questions: UNIQUE(attempt_id, position), UNIQUE(attempt_id, question_version_id)
- attempt_answers: UNIQUE(attempt_question_id), choice_position IS NULL OR >= 1, correct IN (0,1)
- attempt_cloze_answers: UNIQUE(attempt_question_id, blank_index), blank_index >= 1, correct IN (0,1)
- review_answers: choice_position IS NULL OR >= 1（cloze行はNULL）
- review_cloze_answers: UNIQUE(review_answer_id, blank_index), blank_index >= 1, correct IN (0,1)
- question_bookmarks: UNIQUE(question_id)

## 穴埋め運用ルール（アプリ層責務・DBでは強制しない）

- `single_choice` → choices>0 かつ blanks=0・order=0、`cloze_text` → choices=0 かつ blanks>=1・order=0、`order_blocks` → choices=0・blanks=0 かつ order>=2。
- `statement` 中の `{{n}}` 集合と `blanks.blank_index` 集合が一致すること。
- 採点は `trim(user_input) = answer_text` の完全一致。`correct(集約) = 全空欄正解時のみ1`。
- `attempts.score/total` は問題数分母のまま（空欄分母の率は明細から集計）。
- `unified_answer_history` は問題単位のまま。空欄単位は `unified_cloze_blank_history` を見る。

## 並べ替え運用ルール（アプリ層責務・DBでは強制しない）

- `items` は正解順のブロック配列。1ブロック=1行/1単語/1コマンド断片など任意のまとまり。
- `items` は2〜10個、各1〜500文字・空不可・版内重複なし (v1)。`is_distractor=0` 固定。
- 出題時はサーバがシャッフルして返す (正順漏洩防止)。採点は `trim` 後完全一致・大文字小文字区別 (`exact_trim_cs`)。
- `correct(集約) = 全位置一致時のみ1`。位置単位の正誤は明細に残し、将来の部分点・誤順分析に使う (`unified_order_position_history`)。
