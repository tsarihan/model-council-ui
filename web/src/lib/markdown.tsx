import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({ gfm: true, breaks: true });

export function Markdown({ text, className }: { text: string; className?: string }) {
  const html = DOMPurify.sanitize(marked.parse(text ?? '', { async: false }) as string);
  return <div className={`md ${className ?? ''}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
