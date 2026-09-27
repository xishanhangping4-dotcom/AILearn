import { z } from 'zod';

/**
 * 実行時オプション。値の検証は zod で行う（依頼書 §10）。
 * パスワード等の秘密情報はここに置かない。
 */
export const RuntimeOptionsSchema = z.object({
  headed: z.boolean().default(true), // MVPは headed を基本にする（依頼書 §14.1）
  pauseOnError: z.boolean().default(false),
  slowMo: z.number().int().min(0).max(2000).default(120),
  /** 画像を本文中の位置に挿入するか。false なら本文末尾にまとめる（安定重視） */
  inlineImages: z.boolean().default(true),
});

export type RuntimeOptions = z.infer<typeof RuntimeOptionsSchema>;

export function resolveRuntimeOptions(partial: Partial<RuntimeOptions>): RuntimeOptions {
  return RuntimeOptionsSchema.parse({
    ...partial,
    headed: partial.headed ?? (process.env.NOTE_HEADED ? process.env.NOTE_HEADED === '1' : true),
  });
}
