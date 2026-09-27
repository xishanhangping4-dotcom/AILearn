import matter from 'gray-matter';
import { readFileSync } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';
import type {
  ArticleFrontmatter,
  ArticleImageRef,
  ArticleBlock,
  ParsedArticle,
} from './types.js';

const IMAGE_RE = /!\[([^\]]*)\]\(([^)]+)\)/g;

/** 記事フォルダ基準で画像パスを絶対パスに解決する */
function resolveImagePath(dir: string, rawPath: string): string {
  const clean = rawPath.trim().replace(/^\.\//, '');
  return isAbsolute(clean) ? clean : resolve(dir, clean);
}

/**
 * Markdownを「プレーンテキスト寄り」に整える（MVP第1候補：本文プレーンテキスト入力）。
 * 見出しの # や太字の ** など、note上でそのまま出ると不自然な記号だけ落とす。
 * 画像記法はここでは触らず、呼び出し側でブロック分割してから処理する。
 */
function mdInlineToText(md: string): string {
  return md
    // 見出し「## 1. タイトル」の番号は、noteで番号リストに自動変換されるので番号ごと落とす
    .replace(/^#{1,6}\s+\d+[.．]\s*/gm, '')
    .replace(/^#{1,6}\s+/gm, '') // 見出しマーカー
    .replace(/^\s*>\s?/gm, '') // 引用マーカー
    .replace(/^\s*[-*+]\s+/gm, '・') // 箇条書き→中黒
    .replace(/^\s*\d+\.\s+/gm, (m) => m.replace(/\s+$/, ' ')) // 番号リストは番号を残す
    .replace(/\*\*([^*]+)\*\*/g, '$1') // 太字
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '$1') // 斜体
    .replace(/`([^`]+)`/g, '$1') // インラインコード
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1') // リンクはテキストだけ
    .replace(/^\s*---\s*$/gm, '') // 水平線
    .replace(/\n{3,}/g, '\n\n') // 連続改行を詰める
    .trim();
}

export function parseArticle(articleDir: string): ParsedArticle {
  const dir = resolve(articleDir);
  const mdPath = resolve(dir, 'article.md');
  const raw = readFileSync(mdPath, 'utf8');
  const { data, content } = matter(raw);

  const fm: ArticleFrontmatter = {
    title: typeof data.title === 'string' ? data.title.trim() : '',
    thumbnail: typeof data.thumbnail === 'string' ? data.thumbnail.trim() : undefined,
    tags: Array.isArray(data.tags) ? data.tags.map((t: unknown) => String(t)) : undefined,
  };

  // 本文をブロック（テキスト / 画像）に分割
  const blocks: ArticleBlock[] = [];
  const images: ArticleImageRef[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  IMAGE_RE.lastIndex = 0;

  const pushText = (segment: string) => {
    const text = mdInlineToText(segment);
    if (text.length > 0) blocks.push({ type: 'text', text });
  };

  while ((match = IMAGE_RE.exec(content)) !== null) {
    const [, alt, rawPath] = match;
    pushText(content.slice(lastIndex, match.index));
    const image: ArticleImageRef = {
      alt: alt ?? '',
      rawPath: rawPath.trim(),
      absPath: resolveImagePath(dir, rawPath),
      position: images.length,
    };
    images.push(image);
    blocks.push({ type: 'image', image });
    lastIndex = match.index + match[0].length;
  }
  pushText(content.slice(lastIndex));

  const bodyText = blocks
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map((b) => b.text)
    .join('\n\n');

  const thumbnailAbsPath = fm.thumbnail ? resolveImagePath(dir, fm.thumbnail) : undefined;

  return { dir, frontmatter: fm, bodyText, images, blocks, thumbnailAbsPath };
}
