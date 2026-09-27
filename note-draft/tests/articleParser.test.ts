import { describe, it, expect, beforeAll } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArticle } from '../src/articleParser.js';

const TMP = resolve(process.cwd(), 'tests/.tmp-parser');

beforeAll(() => {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(resolve(TMP, 'images'), { recursive: true });
  writeFileSync(resolve(TMP, 'images/a.png'), 'x');
  writeFileSync(resolve(TMP, 'images/b.jpg'), 'x');
  writeFileSync(
    resolve(TMP, 'article.md'),
    [
      '---',
      'title: テスト記事',
      'thumbnail: ./thumb.png',
      'tags:',
      '  - AI',
      '  - 副業',
      '---',
      '',
      '# 見出し1',
      '',
      'これは**本文**です。',
      '',
      '![alt1](./images/a.png)',
      '',
      '## 見出し2',
      '',
      '- 項目1',
      '- 項目2',
      '',
      '![alt2](./images/b.jpg)',
      '',
      '終わりの段落。',
    ].join('\n'),
  );
});

describe('parseArticle', () => {
  it('frontmatter を読み取る', () => {
    const a = parseArticle(TMP);
    expect(a.frontmatter.title).toBe('テスト記事');
    expect(a.frontmatter.tags).toEqual(['AI', '副業']);
    expect(a.thumbnailAbsPath).toContain('thumb.png');
  });

  it('本文画像を出現順に抽出する', () => {
    const a = parseArticle(TMP);
    expect(a.images).toHaveLength(2);
    expect(a.images[0].alt).toBe('alt1');
    expect(a.images[0].absPath).toContain('images/a.png');
    expect(a.images[1].rawPath).toBe('./images/b.jpg');
  });

  it('見出し#や太字**を落としてプレーンテキスト化する', () => {
    const a = parseArticle(TMP);
    expect(a.bodyText).toContain('見出し1');
    expect(a.bodyText).not.toContain('#');
    expect(a.bodyText).not.toContain('**');
    expect(a.bodyText).toContain('・項目1');
  });

  it('ブロックはテキストと画像が交互に並ぶ', () => {
    const a = parseArticle(TMP);
    const types = a.blocks.map((b) => b.type);
    expect(types).toContain('image');
    expect(types.filter((t) => t === 'image')).toHaveLength(2);
  });
});
