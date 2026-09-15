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
        TEXT statement "NOT NULL"
        TEXT explanation "DEFAULT ''"
        TEXT question_type "single_choice固定"
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
        INTEGER choice_position ">=1 NOT NULL"
        TEXT choice_text_snapshot "DEFAULT ''"
        INTEGER correct "0|1 NOT NULL"
        TEXT created_at "DEFAULT datetime('now')"
    }

    categories ||--o{ topics : "CASCADE"
    topics ||--o{ quizzes : "CASCADE"
    quizzes ||--o{ questions : "CASCADE"
    questions ||--o{ question_versions : "CASCADE"
    questions ||--o| question_versions : "current_version_id(論理FK)"
    question_versions ||--o{ question_choices : "CASCADE"
    quizzes ||--o{ attempts : "RESTRICT"
    attempts ||--o{ attempt_questions : "CASCADE"
    question_versions ||--o{ attempt_questions : "RESTRICT"
    attempt_questions ||--|| attempt_answers : "1:1 CASCADE"
```

## リレーションシップ一覧

| 親 → 子                                 | FK                                                  | ON DELETE                 | 備考                                                                                        |
| --------------------------------------- | --------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------- |
| categories → topics                     | topics.category_id                                  | CASCADE                   | カテゴリ削除で配下も消える                                                                  |
| topics → quizzes                        | quizzes.topic_id                                    | CASCADE                   | UNIQUE(topic_id, title)                                                                     |
| quizzes → questions                     | questions.quiz_id                                   | CASCADE                   | 問題本体は薄い行。文面は versions に持つ                                                    |
| questions → question_versions           | question_versions.question_id                       | CASCADE                   | 編集時は UPDATE せず新規 version を INSERT。UNIQUE(question_id, version)                    |
| questions → question_versions (current) | questions.current_version_id → question_versions.id | — (DDL上のFKなし・論理FK) | `seed.sql` のように UPDATE で最新版を指す                                                   |
| question_versions → question_choices    | question_choices.question_version_id                | CASCADE                   | N択・○×に耐える設計。UNIQUE(question_version_id, position)                                  |
| quizzes → attempts                      | attempts.quiz_id                                    | RESTRICT                  | 学習履歴はコンテンツ削除で消さない。CHECK(score <= total)                                   |
| attempts → attempt_questions            | attempt_questions.attempt_id                        | CASCADE                   | 出題スナップショット。UNIQUE(attempt_id, position), UNIQUE(attempt_id, question_version_id) |
| question_versions → attempt_questions   | attempt_questions.question_version_id               | RESTRICT                  | 出題時点の版を固定参照                                                                      |
| attempt_questions → attempt_answers     | attempt_answers.attempt_question_id                 | CASCADE                   | UNIQUE制約で 1:1 (出題1行に回答1行)                                                         |

## UNIQUE / CHECK 一覧

- categories.title: UNIQUE
- topics: UNIQUE(category_id, title)
- quizzes: UNIQUE(topic_id, title), difficulty 1-5, status IN (draft, published, archived)
- question_versions: UNIQUE(question_id, version), question_type = 'single_choice'
- question_choices: UNIQUE(question_version_id, position), position >= 1, is_correct IN (0,1)
- attempts: CHECK(score >= 0), CHECK(total >= 0), CHECK(score <= total)
- attempt_questions: UNIQUE(attempt_id, position), UNIQUE(attempt_id, question_version_id)
- attempt_answers: UNIQUE(attempt_question_id), choice_position >= 1, correct IN (0,1)
