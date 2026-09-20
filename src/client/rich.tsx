// リッチテキスト描画 (```fence コードブロック + `inline` 対応 / XSS-safe)。
// ユーザー入力を innerHTML に渡さず、テキストノードの組み立てのみで描画する。
import { useEffect, useState } from "react";
import type { MouseEvent, ReactNode } from "react";

/** statement中の {{n}} マーカーで分割する (コード内は対象外にするためInlinePartsから呼ぶ) */
export const splitClozeParts = (text: string): ({ text: string } | { blank: number })[] => {
  const out: ({ text: string } | { blank: number })[] = [];
  const re = /\{\{(\d+)\}\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    out.push({ blank: Number(m[1]) });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
};

const InlineParts = ({
  text,
  renderBlank,
}: {
  text: string;
  renderBlank?: ((blankIndex: number) => ReactNode) | undefined;
}): ReactNode => {
  const parts = String(text).split(/(`[^`\n]+`)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (!part) return null;
        if (part.length >= 2 && part.charAt(0) === "`" && part.charAt(part.length - 1) === "`") {
          const inner = part.slice(1, -1);
          // inlineコード内の {{n}} も空欄として扱う
          // （例: `--network {{4}}`）。renderBlank未指定時は従来通りcode表示のみ。
          if (renderBlank && /\{\{\d+\}\}/.test(inner)) {
            let c = 0;
            return (
              <span key={i}>
                {splitClozeParts(inner).map((seg) =>
                  "blank" in seg ? (
                    <span key={c++}>{renderBlank(seg.blank)}</span>
                  ) : seg.text ? (
                    <code key={c++} className="inline-code">
                      {seg.text}
                    </code>
                  ) : null,
                )}
              </span>
            );
          }
          return (
            <code key={i} className="inline-code">
              {inner}
            </code>
          );
        }
        if (renderBlank) {
          let k = 0;
          return (
            <span key={i}>
              {splitClozeParts(part).map((seg) =>
                "blank" in seg ? (
                  <span key={k++}>{renderBlank(seg.blank)}</span>
                ) : (
                  <InlineLines key={k++} text={seg.text} />
                ),
              )}
            </span>
          );
        }
        return <InlineLines key={i} text={part} />;
      })}
    </>
  );
};

const InlineLines = ({ text }: { text: string }): ReactNode => {
  const lines = text.split("\n");
  return (
    <span>
      {lines.map((line, j) => (
        <span key={j}>
          {j > 0 && <br />}
          {line}
        </span>
      ))}
    </span>
  );
};

const CodeBlock = ({ lang, code }: { lang: string; code: string }) => {
  const [copied, setCopied] = useState(false);
  const body = code.replace(/\n$/, "");
  const label = lang.trim() || "code";
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1200);
    return () => clearTimeout(t);
  }, [copied]);
  const copy = (e: MouseEvent) => {
    e.stopPropagation();
    // 失敗 (非セキュアコンテキスト等) でも操作の手応えは返す
    void navigator.clipboard
      ?.writeText(body)
      .catch(() => {})
      .finally(() => setCopied(true));
  };
  return (
    <div className="code-block">
      <div className="code-head">
        <span className="code-lang">{label}</span>
        <button type="button" className="code-copy" aria-label="コードをコピー" onClick={copy}>
          {copied ? "コピー済み" : "コピー"}
        </button>
      </div>
      <pre className="code-pre">
        <code data-lang={label}>{body}</code>
      </pre>
    </div>
  );
};

export const RichText = ({
  text,
  className,
  renderBlank,
}: {
  text: string | null | undefined;
  className?: string;
  /** {{n}} マーカーの描画 (未指定ならマーカーをそのまま表示) */
  renderBlank?: ((blankIndex: number) => ReactNode) | undefined;
}) => {
  const src = text == null ? "" : String(text);
  const re = /```([A-Za-z0-9_+\-#.]*)\s*\n([\s\S]*?)```/g;
  const nodes: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  let found = false;
  while ((m = re.exec(src))) {
    found = true;
    if (m.index > last) {
      nodes.push(
        <InlineParts key={k++} text={src.slice(last, m.index)} renderBlank={renderBlank} />,
      );
    }
    nodes.push(<CodeBlock key={k++} lang={m[1] ?? ""} code={m[2] ?? ""} />);
    last = m.index + m[0].length;
  }
  if (!found) {
    return (
      <span className={className}>
        <InlineParts text={src} renderBlank={renderBlank} />
      </span>
    );
  }
  if (last < src.length) {
    nodes.push(<InlineParts key={k++} text={src.slice(last)} renderBlank={renderBlank} />);
  }
  return <span className={className}>{nodes}</span>;
};
