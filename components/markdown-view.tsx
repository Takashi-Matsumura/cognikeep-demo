import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";

// 変換パイプラインが生成する Markdown には `<br>`（セル内改行）等の生 HTML が
// 混じる（exceljs のセル内改行、AI変換の出力など）。react-markdown は既定で
// 生 HTML をエスケープしてそのまま表示してしまうため、rehype-raw でパースし、
// rehype-sanitize（既定スキーマ = GitHub 相当の許可リスト）で無害化してから
// レンダリングする。LLM が生成した Markdown が混じるルートなので必須の対策。
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    "*": [...(defaultSchema.attributes?.["*"] ?? []), "className"],
  },
};

export function MarkdownView({ children, className }: { children: string; className?: string }) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
