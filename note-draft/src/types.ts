// 共通の型定義

export interface ArticleFrontmatter {
  title: string;
  thumbnail?: string;
  tags?: string[];
}

export interface ArticleImageRef {
  /** Markdown内の alt テキスト */
  alt: string;
  /** article.md に書かれた元のパス（相対） */
  rawPath: string;
  /** 記事フォルダ基準で解決した絶対パス */
  absPath: string;
  /** 本文中で画像が出現した文字位置（本文プレーンテキスト内のインデックス） */
  position: number;
}

/** 本文を「テキスト塊」と「画像」の並びに分解したもの（画像位置を保つため） */
export type ArticleBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; image: ArticleImageRef };

export interface ParsedArticle {
  /** 記事フォルダの絶対パス */
  dir: string;
  frontmatter: ArticleFrontmatter;
  /** 画像記法を除いた本文プレーンテキスト（文字数計算・確認表示に使う） */
  bodyText: string;
  /** 本文中の画像参照一覧（出現順） */
  images: ArticleImageRef[];
  /** 本文の並び（テキストと画像が交互に並ぶ）。inlineImages 挿入に使う */
  blocks: ArticleBlock[];
  /** サムネイル画像の絶対パス（存在すれば） */
  thumbnailAbsPath?: string;
}

export interface ValidationIssue {
  level: 'error' | 'warn';
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
  article: ParsedArticle;
}

export const SUPPORTED_IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.webp'] as const;
