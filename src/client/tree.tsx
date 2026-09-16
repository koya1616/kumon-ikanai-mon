// ツリー状態 (カテゴリ > トピック > クイズ + 挑戦サマリー) の共有ストア。
// 旧グローバル state.tree / state.summary / loadTree(force) に対応。
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { api, QUESTIONS_PER_QUIZ } from "./api";
import type { AttemptSummary, CategoryTreeNode, Quiz } from "./api";

export interface CategoryStats {
  total: number;
  tried: number;
  perfect: number;
  mastery: number;
}

export const categoryStats = (
  c: CategoryTreeNode,
  summary: Record<number, AttemptSummary>,
): CategoryStats => {
  let total = 0;
  let tried = 0;
  let perfect = 0;
  let best = 0;
  for (const t of c.topics) {
    for (const q of t.quizzes) {
      if (q.questionCount < QUESTIONS_PER_QUIZ) continue;
      total++;
      const s = summary[q.id];
      if (s?.attemptCount) {
        tried++;
        best += s.bestScore;
        if (s.bestScore >= s.bestTotal && s.bestTotal > 0) perfect++;
      }
    }
  }
  return {
    total,
    tried,
    perfect,
    mastery: total ? Math.round((best / (total * QUESTIONS_PER_QUIZ)) * 100) : 0,
  };
};

interface TreeContextValue {
  tree: CategoryTreeNode[] | null;
  summary: Record<number, AttemptSummary>;
  loadTree: (force?: boolean) => Promise<CategoryTreeNode[]>;
  invalidate: () => void;
  findCategory: (id: number) => CategoryTreeNode | null;
  findQuiz: (
    id: number,
  ) => { quiz: Quiz; topic: CategoryTreeNode["topics"][number]; category: CategoryTreeNode } | null;
}

const TreeContext = createContext<TreeContextValue | null>(null);

export const TreeProvider = ({ children }: { children: ReactNode }) => {
  const [tree, setTree] = useState<CategoryTreeNode[] | null>(null);
  const [summary, setSummary] = useState<Record<number, AttemptSummary>>({});

  const loadTree = useCallback(
    async (force = false): Promise<CategoryTreeNode[]> => {
      if (tree && !force) return tree;
      const [t, s] = await Promise.all([
        api<CategoryTreeNode[]>("/api/tree").catch((): CategoryTreeNode[] => []),
        api<AttemptSummary[]>("/api/attempts/summary").catch((): AttemptSummary[] => []),
      ]);
      setTree(t);
      const map: Record<number, AttemptSummary> = {};
      for (const item of s) map[item.quizId] = item;
      setSummary(map);
      return t;
    },
    [tree],
  );

  const invalidate = useCallback(() => setTree(null), []);

  const value = useMemo<TreeContextValue>(
    () => ({
      tree,
      summary,
      loadTree,
      invalidate,
      findCategory: (id) => (tree ?? []).find((c) => c.id === id) ?? null,
      findQuiz: (id) => {
        for (const c of tree ?? []) {
          for (const t of c.topics) {
            for (const q of t.quizzes) {
              if (q.id === id) return { quiz: q, topic: t, category: c };
            }
          }
        }
        return null;
      },
    }),
    [tree, summary, loadTree, invalidate],
  );

  return <TreeContext.Provider value={value}>{children}</TreeContext.Provider>;
};

export const useTree = (): TreeContextValue => {
  const v = useContext(TreeContext);
  if (!v) throw new Error("TreeProvider の外で useTree が呼ばれました");
  return v;
};
