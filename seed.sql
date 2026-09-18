-- DB制約・アプリ仕様に準拠したシード
-- 前提: QUESTIONS_PER_QUIZ=10 / 選択肢4つ・正解1つ / versionは1始まり / attemptsはscore<=total
-- 冪等ではなくリセット方式: FKをOFFにして全消去→INSERT
PRAGMA foreign_keys = OFF;
DELETE FROM question_bookmarks;
DELETE FROM attempt_answers;
DELETE FROM attempt_questions;
DELETE FROM attempts;
DELETE FROM question_choices;
DELETE FROM question_versions;
DELETE FROM questions;
DELETE FROM quizzes;
DELETE FROM topics;
DELETE FROM categories;
DELETE FROM sqlite_sequence;
PRAGMA foreign_keys = ON;

INSERT INTO categories (id, title) VALUES (1, '算数'), (2, '国語'), (3, 'プログラミング');
INSERT INTO topics (id, category_id, title) VALUES
  (1, 1, 'たし算'), (2, 1, 'ひき算'), (3, 2, '漢字'), (4, 2, 'ことわざ'), (5, 3, 'Golang');
INSERT INTO quizzes (id, topic_id, title, difficulty, status) VALUES
  (1, 1, 'くり上がりなし', 1, 'published'),
  (2, 1, 'くり上がりあり', 3, 'published'),
  (3, 2, 'くり下がりなし', 1, 'published'),
  (4, 3, '小学1年生の漢字', 2, 'published'),
  (5, 4, 'ことわざ入門', 2, 'published'),
  (6, 1, 'かけ算 準備中', 2, 'draft'),
  (7, 5, 'Golang基礎', 2, 'published');

INSERT INTO questions (id, quiz_id) VALUES
  (1, 1), (2, 1), (3, 1), (4, 1), (5, 1), (6, 1), (7, 1), (8, 1), (9, 1), (10, 1), (11, 2), (12, 2), (13, 2), (14, 2), (15, 2), (16, 2), (17, 2), (18, 2), (19, 2), (20, 2), (21, 3), (22, 3), (23, 3), (24, 3), (25, 3), (26, 3), (27, 3), (28, 3), (29, 3), (30, 3), (31, 4), (32, 4), (33, 4), (34, 4), (35, 4), (36, 4), (37, 4), (38, 4), (39, 4), (40, 4), (41, 5), (42, 5), (43, 5), (44, 5), (45, 5), (46, 5), (47, 5), (48, 5), (49, 5), (50, 5), (51, 6), (52, 6), (53, 7), (54, 7), (55, 7), (56, 7), (57, 7), (58, 7), (59, 7), (60, 7), (61, 7), (62, 7);
INSERT INTO question_versions (id, question_id, version, statement, explanation) VALUES
  (1, 1, 1, '2 + 3 は??', '旧バージョン（誤字あり）。'),
  (2, 1, 2, '2 + 3 は？', '2+3=5 です。'),
  (3, 2, 1, '4 + 1 は？', '4+1=5 です。'),
  (4, 3, 1, '1 + 2 は？', '1+2=3 です。'),
  (5, 4, 1, '3 + 3 は？', '3+3=6 です。'),
  (6, 5, 1, '5 + 2 は？', '5+2=7 です。'),
  (7, 6, 1, '4 + 3 は？', '4+3=7 です。'),
  (8, 7, 1, '2 + 1 は？', '2+1=3 です。'),
  (9, 8, 1, '6 + 2 は？', '6+2=8 です。'),
  (10, 9, 1, '3 + 4 は？', '3+4=7 です。'),
  (11, 10, 1, '5 + 4 は？', '5+4=9 です。くり上がりはありません。'),
  (12, 11, 1, '8 + 5 は？', '8+5=13 です。1の位は8+5=13で3、10の位に1繰り上がります。'),
  (13, 12, 1, '7 + 6 は？', '7+6=13 です。7に3を足して10、残り3で13です。'),
  (14, 13, 1, '9 + 4 は？', '9+4=13 です。9に1を足して10、残り3で13です。'),
  (15, 14, 1, '6 + 7 は？', '6+7=13 です。6に4を足して10、残り3で13です。'),
  (16, 15, 1, '8 + 8 は？', '8+8=16 です。8に2を足して10、残り6で16です。'),
  (17, 16, 1, '9 + 9 は？', '9+9=18 です。9に1を足して10、残り8で18です。'),
  (18, 17, 1, '5 + 7 は？', '5+7=12 です。5に5を足して10、残り2で12です。'),
  (19, 18, 1, '4 + 9 は？', '4+9=13 です。9に6を足して…ではなく、4に6を足して10、残り3で13です。'),
  (20, 19, 1, '6 + 6 は？', '6+6=12 です。6に4を足して10、残り2で12です。'),
  (21, 20, 1, '7 + 9 は？', '7+9=16 です。9に3を足して…ではなく、7に3を足して10、残り6で16です。'),
  (22, 21, 1, '5 - 2 は？', '5-2=3 です。'),
  (23, 22, 1, '8 - 3 は？', '8-3=5 です。'),
  (24, 23, 1, '9 - 4 は？', '9-4=5 です。'),
  (25, 24, 1, '7 - 1 は？', '7-1=6 です。'),
  (26, 25, 1, '6 - 2 は？', '6-2=4 です。'),
  (27, 26, 1, '9 - 5 は？', '9-5=4 です。'),
  (28, 27, 1, '8 - 6 は？', '8-6=2 です。'),
  (29, 28, 1, '7 - 3 は？', '7-3=4 です。'),
  (30, 29, 1, '5 - 1 は？', '5-1=4 です。'),
  (31, 30, 1, '9 - 2 は？', '9-2=7 です。くり下がりはありません。'),
  (32, 31, 1, '「山」の読みは？', '「山」は「やま」と読みます。'),
  (33, 32, 1, '「川」の読みは？', '「川」は「かわ」と読みます。'),
  (34, 33, 1, '「空」の読みは？', '「空」は「そら」と読みます。'),
  (35, 34, 1, '「海」の読みは？', '「海」は「うみ」と読みます。'),
  (36, 35, 1, '「花」の読みは？', '「花」は「はな」と読みます。'),
  (37, 36, 1, '「犬」の読みは？', '「犬」は「いぬ」と読みます。'),
  (38, 37, 1, '「月」の読みは？', '「月」は「つき」と読みます。'),
  (39, 38, 1, '「日」の読みは？', '「日」は「ひ」と読みます。'),
  (40, 39, 1, '「木」の読みは？', '「木」は「き」と読みます。'),
  (41, 40, 1, '「天」の読みは？', '「天」は「あま（てん）」と読みます。空のことです。'),
  (42, 41, 1, '「猿も木から落ちる」の意味は？', '得意なことでも失敗はある、という戒めです。'),
  (43, 42, 1, '「石の上にも三年」の意味は？', '辛いことも我慢して続ければ成果が出る、という意味です。'),
  (44, 43, 1, '「塵も積もれば山となる」の意味は？', '小さなことでも積み重ねれば大きくなる、という意味です。'),
  (45, 44, 1, '「七転び八起き」の意味は？', '失敗しても諦めず立ち上がることの大切さです。'),
  (46, 45, 1, '「井の中の蛙」の意味は？', '狭い世界しか知らず、他を知らないことの例えです。'),
  (47, 46, 1, '「時は金なり」の意味は？', '時間はお金と同じくらい貴重だ、という意味です。'),
  (48, 47, 1, '「棚からぼた餅」の意味は？', '思いがけず良いことが起きることです。'),
  (49, 48, 1, '「猫に小判」の意味は？', '価値の分からない人に貴重な物を与えても意味がない、という例えです。'),
  (50, 49, 1, '「花より団子」の意味は？', '風流より実用を取ることです。'),
  (51, 50, 1, '「笑う門には福来る」の意味は？', '明るく笑いのある所には幸せが寄ってくる、という意味です。'),
  (52, 51, 1, '2 × 3 は？', '2×3=6 です。'),
  (53, 52, 1, '4 × 2 は？', '4×2=8 です。');
INSERT INTO question_choices (question_version_id, position, choice_text, is_correct) VALUES
  (1, 1, '4', 0),
  (1, 2, '5', 1),
  (1, 3, '6', 0),
  (1, 4, '7', 0),
  (2, 1, '4', 0),
  (2, 2, '5', 1),
  (2, 3, '6', 0),
  (2, 4, '7', 0),
  (3, 1, '3', 0),
  (3, 2, '4', 0),
  (3, 3, '5', 1),
  (3, 4, '6', 0),
  (4, 1, '2', 0),
  (4, 2, '4', 0),
  (4, 3, '5', 0),
  (4, 4, '3', 1),
  (5, 1, '6', 1),
  (5, 2, '5', 0),
  (5, 3, '7', 0),
  (5, 4, '8', 0),
  (6, 1, '6', 0),
  (6, 2, '7', 1),
  (6, 3, '8', 0),
  (6, 4, '9', 0),
  (7, 1, '6', 0),
  (7, 2, '8', 0),
  (7, 3, '7', 1),
  (7, 4, '9', 0),
  (8, 1, '2', 0),
  (8, 2, '4', 0),
  (8, 3, '5', 0),
  (8, 4, '3', 1),
  (9, 1, '8', 1),
  (9, 2, '7', 0),
  (9, 3, '9', 0),
  (9, 4, '6', 0),
  (10, 1, '6', 0),
  (10, 2, '7', 1),
  (10, 3, '8', 0),
  (10, 4, '9', 0),
  (11, 1, '8', 0),
  (11, 2, '7', 0),
  (11, 3, '9', 1),
  (11, 4, '6', 0),
  (12, 1, '12', 0),
  (12, 2, '14', 0),
  (12, 3, '15', 0),
  (12, 4, '13', 1),
  (13, 1, '13', 1),
  (13, 2, '12', 0),
  (13, 3, '14', 0),
  (13, 4, '11', 0),
  (14, 1, '12', 0),
  (14, 2, '13', 1),
  (14, 3, '14', 0),
  (14, 4, '15', 0),
  (15, 1, '12', 0),
  (15, 2, '14', 0),
  (15, 3, '13', 1),
  (15, 4, '15', 0),
  (16, 1, '15', 0),
  (16, 2, '17', 0),
  (16, 3, '14', 0),
  (16, 4, '16', 1),
  (17, 1, '18', 1),
  (17, 2, '17', 0),
  (17, 3, '16', 0),
  (17, 4, '19', 0),
  (18, 1, '11', 0),
  (18, 2, '12', 1),
  (18, 3, '13', 0),
  (18, 4, '10', 0),
  (19, 1, '12', 0),
  (19, 2, '14', 0),
  (19, 3, '13', 1),
  (19, 4, '15', 0),
  (20, 1, '11', 0),
  (20, 2, '13', 0),
  (20, 3, '10', 0),
  (20, 4, '12', 1),
  (21, 1, '16', 1),
  (21, 2, '15', 0),
  (21, 3, '17', 0),
  (21, 4, '14', 0),
  (22, 1, '2', 0),
  (22, 2, '3', 1),
  (22, 3, '4', 0),
  (22, 4, '5', 0),
  (23, 1, '4', 0),
  (23, 2, '6', 0),
  (23, 3, '5', 1),
  (23, 4, '7', 0),
  (24, 1, '4', 0),
  (24, 2, '6', 0),
  (24, 3, '7', 0),
  (24, 4, '5', 1),
  (25, 1, '6', 1),
  (25, 2, '5', 0),
  (25, 3, '7', 0),
  (25, 4, '8', 0),
  (26, 1, '3', 0),
  (26, 2, '4', 1),
  (26, 3, '5', 0),
  (26, 4, '6', 0),
  (27, 1, '3', 0),
  (27, 2, '5', 0),
  (27, 3, '4', 1),
  (27, 4, '6', 0),
  (28, 1, '1', 0),
  (28, 2, '3', 0),
  (28, 3, '4', 0),
  (28, 4, '2', 1),
  (29, 1, '4', 1),
  (29, 2, '3', 0),
  (29, 3, '5', 0),
  (29, 4, '6', 0),
  (30, 1, '3', 0),
  (30, 2, '4', 1),
  (30, 3, '5', 0),
  (30, 4, '6', 0),
  (31, 1, '6', 0),
  (31, 2, '8', 0),
  (31, 3, '7', 1),
  (31, 4, '9', 0),
  (32, 1, 'かわ', 0),
  (32, 2, 'うみ', 0),
  (32, 3, 'そら', 0),
  (32, 4, 'やま', 1),
  (33, 1, 'かわ', 1),
  (33, 2, 'やま', 0),
  (33, 3, 'うみ', 0),
  (33, 4, 'もり', 0),
  (34, 1, 'うみ', 0),
  (34, 2, 'そら', 1),
  (34, 3, 'やま', 0),
  (34, 4, 'ほし', 0),
  (35, 1, 'かわ', 0),
  (35, 2, 'そら', 0),
  (35, 3, 'うみ', 1),
  (35, 4, 'やま', 0),
  (36, 1, 'くさ', 0),
  (36, 2, 'き', 0),
  (36, 3, 'もり', 0),
  (36, 4, 'はな', 1),
  (37, 1, 'いぬ', 1),
  (37, 2, 'ねこ', 0),
  (37, 3, 'とり', 0),
  (37, 4, 'うし', 0),
  (38, 1, 'ひ', 0),
  (38, 2, 'つき', 1),
  (38, 3, 'ほし', 0),
  (38, 4, 'たいよう', 0),
  (39, 1, 'つき', 0),
  (39, 2, 'ほし', 0),
  (39, 3, 'ひ', 1),
  (39, 4, 'そら', 0),
  (40, 1, 'はな', 0),
  (40, 2, 'くさ', 0),
  (40, 3, 'もり', 0),
  (40, 4, 'き', 1),
  (41, 1, 'あま', 1),
  (41, 2, 'そら', 0),
  (41, 3, 'うみ', 0),
  (41, 4, 'かわ', 0),
  (42, 1, '努力は必ず報われる', 0),
  (42, 2, '得意な人でも失敗する', 1),
  (42, 3, '急いでも良いことはない', 0),
  (42, 4, '皆で協力すべき', 0),
  (43, 1, '石は冷たい', 0),
  (43, 2, '三年で飽きる', 0),
  (43, 3, '辛抱すれば報われる', 1),
  (43, 4, '急げば失敗する', 0),
  (44, 1, '掃除をしよう', 0),
  (44, 2, '山に登ろう', 0),
  (44, 3, 'ゴミは捨てよう', 0),
  (44, 4, '小さな積み重ねが大きくなる', 1),
  (45, 1, '何度失敗しても立ち上がる', 1),
  (45, 2, '七回転がる', 0),
  (45, 3, '起きるのは八時', 0),
  (45, 4, '諦めが肝心', 0),
  (46, 1, 'カエルは泳げる', 0),
  (46, 2, '視野が狭い', 1),
  (46, 3, '井戸は深い', 0),
  (46, 4, '蛙は跳ぶ', 0),
  (47, 1, 'お金が一番', 0),
  (47, 2, '時計を買おう', 0),
  (47, 3, '時間は大切だ', 1),
  (47, 4, '金は光る', 0),
  (48, 1, 'お餅を食べよう', 0),
  (48, 2, '棚は高い', 0),
  (48, 3, '努力の結果', 0),
  (48, 4, '思いがけない幸運', 1),
  (49, 1, '価値が分からない人に与えても無駄', 1),
  (49, 2, '猫は金が好き', 0),
  (49, 3, '小判は丸い', 0),
  (49, 4, '猫を飼おう', 0),
  (50, 1, '花が好き', 0),
  (50, 2, '見た目より実利', 1),
  (50, 3, '団子は甘い', 0),
  (50, 4, '春が来た', 0),
  (51, 1, '笑ってはいけない', 0),
  (51, 2, '門は木製', 0),
  (51, 3, '明るい家には幸せが来る', 1),
  (51, 4, '福は買える', 0),
  (52, 1, '5', 0),
  (52, 2, '7', 0),
  (52, 3, '9', 0),
  (52, 4, '6', 1),
  (53, 1, '8', 1),
  (53, 2, '6', 0),
  (53, 3, '7', 0),
  (53, 4, '9', 0);
UPDATE questions SET current_version_id = 2 WHERE id = 1;
UPDATE questions SET current_version_id = 3 WHERE id = 2;
UPDATE questions SET current_version_id = 4 WHERE id = 3;
UPDATE questions SET current_version_id = 5 WHERE id = 4;
UPDATE questions SET current_version_id = 6 WHERE id = 5;
UPDATE questions SET current_version_id = 7 WHERE id = 6;
UPDATE questions SET current_version_id = 8 WHERE id = 7;
UPDATE questions SET current_version_id = 9 WHERE id = 8;
UPDATE questions SET current_version_id = 10 WHERE id = 9;
UPDATE questions SET current_version_id = 11 WHERE id = 10;
UPDATE questions SET current_version_id = 12 WHERE id = 11;
UPDATE questions SET current_version_id = 13 WHERE id = 12;
UPDATE questions SET current_version_id = 14 WHERE id = 13;
UPDATE questions SET current_version_id = 15 WHERE id = 14;
UPDATE questions SET current_version_id = 16 WHERE id = 15;
UPDATE questions SET current_version_id = 17 WHERE id = 16;
UPDATE questions SET current_version_id = 18 WHERE id = 17;
UPDATE questions SET current_version_id = 19 WHERE id = 18;
UPDATE questions SET current_version_id = 20 WHERE id = 19;
UPDATE questions SET current_version_id = 21 WHERE id = 20;
UPDATE questions SET current_version_id = 22 WHERE id = 21;
UPDATE questions SET current_version_id = 23 WHERE id = 22;
UPDATE questions SET current_version_id = 24 WHERE id = 23;
UPDATE questions SET current_version_id = 25 WHERE id = 24;
UPDATE questions SET current_version_id = 26 WHERE id = 25;
UPDATE questions SET current_version_id = 27 WHERE id = 26;
UPDATE questions SET current_version_id = 28 WHERE id = 27;
UPDATE questions SET current_version_id = 29 WHERE id = 28;
UPDATE questions SET current_version_id = 30 WHERE id = 29;
UPDATE questions SET current_version_id = 31 WHERE id = 30;
UPDATE questions SET current_version_id = 32 WHERE id = 31;
UPDATE questions SET current_version_id = 33 WHERE id = 32;
UPDATE questions SET current_version_id = 34 WHERE id = 33;
UPDATE questions SET current_version_id = 35 WHERE id = 34;
UPDATE questions SET current_version_id = 36 WHERE id = 35;
UPDATE questions SET current_version_id = 37 WHERE id = 36;
UPDATE questions SET current_version_id = 38 WHERE id = 37;
UPDATE questions SET current_version_id = 39 WHERE id = 38;
UPDATE questions SET current_version_id = 40 WHERE id = 39;
UPDATE questions SET current_version_id = 41 WHERE id = 40;
UPDATE questions SET current_version_id = 42 WHERE id = 41;
UPDATE questions SET current_version_id = 43 WHERE id = 42;
UPDATE questions SET current_version_id = 44 WHERE id = 43;
UPDATE questions SET current_version_id = 45 WHERE id = 44;
UPDATE questions SET current_version_id = 46 WHERE id = 45;
UPDATE questions SET current_version_id = 47 WHERE id = 46;
UPDATE questions SET current_version_id = 48 WHERE id = 47;
UPDATE questions SET current_version_id = 49 WHERE id = 48;
UPDATE questions SET current_version_id = 50 WHERE id = 49;
UPDATE questions SET current_version_id = 51 WHERE id = 50;
UPDATE questions SET current_version_id = 52 WHERE id = 51;
UPDATE questions SET current_version_id = 53 WHERE id = 52;

INSERT INTO attempts (id, quiz_id, score, total, completed_at, created_at) VALUES
  (1, 1, 10, 10, '2026-09-10 10:05:00', '2026-09-10 10:00:00'),
  (2, 1, 7, 10, '2026-09-12 18:07:00', '2026-09-12 18:00:00'),
  (3, 2, 8, 10, '2026-09-13 09:06:00', '2026-09-13 09:00:00');
INSERT INTO attempt_questions (id, attempt_id, question_version_id, position) VALUES
  (1, 1, 2, 1),
  (2, 1, 3, 2),
  (3, 1, 4, 3),
  (4, 1, 5, 4),
  (5, 1, 6, 5),
  (6, 1, 7, 6),
  (7, 1, 8, 7),
  (8, 1, 9, 8),
  (9, 1, 10, 9),
  (10, 1, 11, 10),
  (11, 2, 2, 1),
  (12, 2, 3, 2),
  (13, 2, 4, 3),
  (14, 2, 5, 4),
  (15, 2, 6, 5),
  (16, 2, 7, 6),
  (17, 2, 8, 7),
  (18, 2, 9, 8),
  (19, 2, 10, 9),
  (20, 2, 11, 10),
  (21, 3, 12, 1),
  (22, 3, 13, 2),
  (23, 3, 14, 3),
  (24, 3, 15, 4),
  (25, 3, 16, 5),
  (26, 3, 17, 6),
  (27, 3, 18, 7),
  (28, 3, 19, 8),
  (29, 3, 20, 9),
  (30, 3, 21, 10);
INSERT INTO attempt_answers (attempt_question_id, choice_position, choice_text_snapshot, correct) VALUES
  (1, 2, '5', 1),
  (2, 3, '5', 1),
  (3, 4, '3', 1),
  (4, 1, '6', 1),
  (5, 2, '7', 1),
  (6, 3, '7', 1),
  (7, 4, '3', 1),
  (8, 1, '8', 1),
  (9, 2, '7', 1),
  (10, 3, '9', 1),
  (11, 2, '5', 1),
  (12, 3, '5', 1),
  (13, 1, '2', 0),
  (14, 1, '6', 1),
  (15, 2, '7', 1),
  (16, 3, '7', 1),
  (17, 1, '2', 0),
  (18, 1, '8', 1),
  (19, 3, '8', 0),
  (20, 3, '9', 1),
  (21, 4, '13', 1),
  (22, 2, '12', 0),
  (23, 2, '13', 1),
  (24, 3, '13', 1),
  (25, 1, '15', 0),
  (26, 1, '18', 1),
  (27, 2, '12', 1),
  (28, 3, '13', 1),
  (29, 4, '12', 1),
  (30, 1, '16', 1);

-- Golang基礎 (quiz 7: questions 53-62 / versions 54-63)。問題文は ```go フェンス付き。
INSERT INTO question_versions (id, question_id, version, statement, explanation) VALUES
  (54, 53, 1, '次のプログラムを実行すると何が出力される？
```go
package main

import "fmt"

func main() {
    fmt.Println(1 + 2)
}
```', '1 + 2 は整数の足し算なので 3 が出力されます。'),
  (55, 54, 1, '次のプログラムを実行すると何が出力される？
```go
package main

import "fmt"

func main() {
    var x int
    fmt.Println(x)
}
```', 'var x int のように初期値なしで宣言すると、int のゼロ値 0 が入ります。'),
  (56, 55, 1, '次のプログラムを実行すると何が出力される？
```go
package main

import "fmt"

func main() {
    a := 5
    fmt.Printf("%T", a)
}
```', '5 は整数リテラルなので、短縮変数宣言では int 型と推論されます。%T は型名を出力します。'),
  (57, 56, 1, '次のプログラムを実行すると何が出力される？
```go
package main

import "fmt"

func main() {
    sum := 0
    for i := 0; i < 5; i++ {
        sum += i
    }
    fmt.Println(sum)
}
```', 'i は 0 から 4 まで進むので、0 + 1 + 2 + 3 + 4 = 10 です。'),
  (58, 57, 1, '次のプログラムを実行すると何が出力される？
```go
package main

import "fmt"

func main() {
    s := []int{1, 2, 3}
    fmt.Println(len(s))
}
```', 'スライスの要素数は 3 なので、len は 3 を返します。'),
  (59, 58, 1, '次のプログラムを実行すると何が出力される？
```go
package main

import "fmt"

func main() {
    s := []int{1, 2}
    s = append(s, 3)
    fmt.Println(len(s))
}
```', 'append で要素が 1 つ増えるので、長さは 3 になります。'),
  (60, 59, 1, '次のプログラムを実行すると何が出力される？
```go
package main

import "fmt"

func main() {
    m := map[string]int{}
    fmt.Println(m["a"])
}
```', '存在しないキーを読むと、値の型のゼロ値が返ります。int のゼロ値は 0 です。'),
  (61, 60, 1, '次のプログラムを実行すると何が出力される？
```go
package main

import "fmt"

func add(a int, b int) int {
    return a + b
}

func main() {
    fmt.Println(add(2, 3))
}
```', 'add(2, 3) は 2 + 3 = 5 を返すので、5 が出力されます。'),
  (62, 61, 1, '次のプログラムを実行すると何が出力される？
```go
package main

import "fmt"

func main() {
    x := 7
    if x%2 == 0 {
        fmt.Println("偶数")
    } else {
        fmt.Println("奇数")
    }
}
```', '7 % 2 は 1 なので条件は真にならず、else 側の「奇数」が出力されます。'),
  (63, 62, 1, '次のプログラムを実行すると何が出力される？
```go
package main

import "fmt"

type P struct {
    Name string
}

func main() {
    p := P{Name: "go"}
    fmt.Println(p.Name)
}
```', '構造体のフィールド Name に設定した go が出力されます。');
INSERT INTO question_choices (question_version_id, position, choice_text, is_correct) VALUES
  (54, 1, '2', 0),
  (54, 2, '3', 1),
  (54, 3, '12', 0),
  (54, 4, 'エラーになる', 0),
  (55, 1, '0', 1),
  (55, 2, '1', 0),
  (55, 3, '空文字', 0),
  (55, 4, 'エラーになる', 0),
  (56, 1, 'string', 0),
  (56, 2, 'float64', 0),
  (56, 3, 'int', 1),
  (56, 4, 'bool', 0),
  (57, 1, '15', 0),
  (57, 2, '10', 1),
  (57, 3, '5', 0),
  (57, 4, '14', 0),
  (58, 1, '2', 0),
  (58, 2, '4', 0),
  (58, 3, '1', 0),
  (58, 4, '3', 1),
  (59, 1, '3', 1),
  (59, 2, '2', 0),
  (59, 3, '4', 0),
  (59, 4, '5', 0),
  (60, 1, 'コンパイルエラー', 0),
  (60, 2, '空文字', 0),
  (60, 3, '0', 1),
  (60, 4, 'パニックになる', 0),
  (61, 1, '23', 0),
  (61, 2, '6', 0),
  (61, 3, '0', 0),
  (61, 4, '5', 1),
  (62, 1, '偶数', 0),
  (62, 2, '奇数', 1),
  (62, 3, '7', 0),
  (62, 4, 'コンパイルエラー', 0),
  (63, 1, 'P', 0),
  (63, 2, '空文字', 0),
  (63, 3, 'go', 1),
  (63, 4, 'コンパイルエラー', 0);
UPDATE questions SET current_version_id = 54 WHERE id = 53;
UPDATE questions SET current_version_id = 55 WHERE id = 54;
UPDATE questions SET current_version_id = 56 WHERE id = 55;
UPDATE questions SET current_version_id = 57 WHERE id = 56;
UPDATE questions SET current_version_id = 58 WHERE id = 57;
UPDATE questions SET current_version_id = 59 WHERE id = 58;
UPDATE questions SET current_version_id = 60 WHERE id = 59;
UPDATE questions SET current_version_id = 61 WHERE id = 60;
UPDATE questions SET current_version_id = 62 WHERE id = 61;
UPDATE questions SET current_version_id = 63 WHERE id = 62;
