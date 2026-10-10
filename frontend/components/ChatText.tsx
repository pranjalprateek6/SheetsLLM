import { Fragment, type ReactNode } from "react";

/* Chef answers in light markdown: paragraphs, numbered and bulleted lists,
   **bold** and `code`. This renders exactly that subset as React elements
   (never as HTML), so a model reply cannot inject markup. Anything else
   shows as the plain text it is. */

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    out.push(
      tok.startsWith("**") ? (
        <strong key={`${key}-${n++}`} className="font-semibold">{tok.slice(2, -2)}</strong>
      ) : (
        <code key={`${key}-${n++}`} className="rounded bg-muted px-1 py-px font-mono text-[0.92em]">{tok.slice(1, -1)}</code>
      ),
    );
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Block = { kind: "p"; lines: string[] } | { kind: "ol" | "ul"; items: string[] };

function blocks(src: string): Block[] {
  const out: Block[] = [];
  for (const raw of src.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const ul = /^\s*[-*•]\s+(.*)$/.exec(line);
    const prev = out[out.length - 1];
    if (ol || ul) {
      const kind = ol ? "ol" : "ul";
      const item = (ol ?? ul)![1];
      if (prev && prev.kind === kind) prev.items.push(item);
      else out.push({ kind, items: [item] });
    } else if (!line.trim()) {
      out.push({ kind: "p", lines: [] });
    } else if (prev && prev.kind === "p") {
      prev.lines.push(line);
    } else {
      out.push({ kind: "p", lines: [line] });
    }
  }
  return out.filter((b) => (b.kind === "p" ? b.lines.length > 0 : true));
}

export default function ChatText({ text }: { text: string }) {
  return (
    <div className="space-y-2">
      {blocks(text).map((b, i) =>
        b.kind === "p" ? (
          <p key={i}>
            {b.lines.map((l, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {inline(l, `${i}-${j}`)}
              </Fragment>
            ))}
          </p>
        ) : b.kind === "ol" ? (
          <ol key={i} className="list-decimal space-y-1 pl-5 marker:text-muted-foreground">
            {b.items.map((it, j) => <li key={j}>{inline(it, `${i}-${j}`)}</li>)}
          </ol>
        ) : (
          <ul key={i} className="list-disc space-y-1 pl-5 marker:text-muted-foreground">
            {b.items.map((it, j) => <li key={j}>{inline(it, `${i}-${j}`)}</li>)}
          </ul>
        ),
      )}
    </div>
  );
}
