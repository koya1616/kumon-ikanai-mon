-- サンプルシード: category 1 / topic 2 / quiz 2 / 少量で開始 (新スキーマ用)
INSERT OR IGNORE INTO categories (id, title) VALUES (1, '算数');
INSERT OR IGNORE INTO topics (id, category_id, title) VALUES (1, 1, 'たし算'), (2, 1, 'ひき算');
INSERT OR IGNORE INTO quizzes (id, topic_id, title, difficulty, status) VALUES
  (1, 1, 'くり上がりなし', 1, 'published'),
  (2, 1, 'くり上がりあり', 3, 'published');

INSERT OR IGNORE INTO questions (id, quiz_id) VALUES (1, 1), (2, 1), (3, 2);

INSERT OR IGNORE INTO question_versions (id, question_id, version, statement, explanation) VALUES
  (1, 1, 1, '2 + 3 は？', '2+3=5 です。'),
  (2, 2, 1, '4 + 1 は？', '4+1=5 です。'),
  (3, 3, 1, '8 + 5 は？', '8+5=13 です。1の位は8+5=13で3、10の位に1繰り上がります。');

INSERT OR IGNORE INTO question_choices (question_version_id, position, choice_text, is_correct) VALUES
  (1, 1, '4', 0), (1, 2, '5', 1), (1, 3, '6', 0), (1, 4, '7', 0),
  (2, 1, '3', 0), (2, 2, '4', 0), (2, 3, '5', 1), (2, 4, '6', 0),
  (3, 1, '12', 0), (3, 2, '13', 1), (3, 3, '14', 0), (3, 4, '15', 0);

UPDATE questions SET current_version_id = 1 WHERE id = 1;
UPDATE questions SET current_version_id = 2 WHERE id = 2;
UPDATE questions SET current_version_id = 3 WHERE id = 3;
