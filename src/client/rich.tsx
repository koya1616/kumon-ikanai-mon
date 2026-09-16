// リッチテキスト描画 (```fence コードブロック + `inline` 対応 / XSS-safe)。
// ユーザー入力を innerHTML に渡さず、テキストノードの組み立てのみで描画する。
import { useState } from "react";
import type { ReactNode } from "react";

const InlineParts = ({ text }: { text: string }): ReactNode => {
  const parts = String(text).split(/(`[^`\n]+`)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (!part) return null;
        if (part.length >= 2 && part.charAt(0) === "`" && part.charAt(part.length - 1) === "`") {
          return (
            <code key={i} className="inline-code">
              {part.slice(1, -1)}
            </code>
          );
        }
        const lines = part.split("\n");
        return (
          <span key={i}>
            {lines.map((line, j) => (
              <span key={j}>
                {j > 0 && <br />}
                {line}
              </span>
            ))}
          </span>
        );
      })}
    </>
  );
};

const CodeBlock = ({ lang, code }: { lang: string; code: string }) => {
  const [copied, setCopied] = useState(false);
  const body = code.replace(/\n$/, "");
  const label = lang.trim() || "code";
  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const done = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    };
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(body);
        done();
      } else {
        const ta = document.createElement("textarea");
        ta.value = body;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        done();
      }
    } catch {
      done();
    }
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
}: {
  text: string | null | undefined;
  className?: string;
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
      nodes.push(<InlineParts key={k++} text={src.slice(last, m.index)} />);
    }
    nodes.push(<CodeBlock key={k++} lang={m[1] ?? ""} code={m[2] ?? ""} />);
    last = m.index + m[0].length;
  }
  if (!found) {
    return (
      <span className={className}>
        <InlineParts text={src} />
      </span>
    );
  }
  if (last < src.length) {
    nodes.push(<InlineParts key={k++} text={src.slice(last)} />);
  }
  return <span className={className}>{nodes}</span>;
};
