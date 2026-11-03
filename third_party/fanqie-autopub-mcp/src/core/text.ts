/** 中文正文字数统计：汉字按字计，英文单词折算 */
export function countCjk(text: string): number {
  const cjk = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const words = (text.match(/[A-Za-z]+/g) || []).length;
  return cjk + Math.round(words / 1.6);
}

/**
 * markdown 正文 -> 番茄纯文本。
 * 番茄的 ProseMirror 富文本会把 `**` / `---` / ``` / `>` 当字面字符渲染，
 * 所以上传前必须剥掉 markdown 标记，否则正文里会出现一堆星号、横线。
 */
export function toPlainText(text: string, options: {preserveBlankLines?: boolean} = {}): string {
  let t = text.replace(/\r\n?/g, "\n");
  t = t.replace(/^\s*```.*$/gm, "");
  t = t.replace(/\*\*/g, "");
  t = t.replace(/^\s*>\s?/gm, "");
  t = t.replace(/^\s*---\s*$/gm, "");
  t = t.replace(/[ \t]+\n/g, "\n");
  if (!options.preserveBlankLines) t = t.replace(/\n{3,}/g, "\n\n");
  return t.trim();
}

/**
 * HTML 富文本 -> 纯文本。
 * 番茄短故事 `edit/v1` 返回的 `content` 是 `<p>…</p>` 片段，直接当正文用会把标签带进去。
 */
export function stripHtml(html: string): string {
  return (html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|blockquote|section)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (entity, code: string) => {
      const point = code[0].toLowerCase() === "x" ? parseInt(code.slice(1), 16) : Number(code);
      return point >= 0 && point <= 0x10ffff ? String.fromCodePoint(point) : entity;
    })
    .replace(/&amp;/gi, "&");
}

/** 比较后台草稿与预期内容；保留正文内部空格、换行和空段。 */
export function compareDraft(
  actual: { title: string; content: string },
  expected: { title?: string; content?: string }
): string[] {
  const problems: string[] = [];
  if (expected.title !== undefined && actual.title !== expected.title) problems.push("标题与预期不一致");
  const normalize = (value: string) => value.replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ").trim();
  if (expected.content !== undefined && normalize(stripHtml(actual.content)) !== normalize(expected.content)) {
    problems.push("完整正文或换行与预期不一致");
  }
  return problems;
}

/** 去掉标题里的「第X章」前缀（番茄序号框与标题框是两个独立输入框） */
export function cleanChapterTitle(title: string): string {
  return title.replace(/^第\s*[0-9一二三四五六七八九十百零]+\s*章[\s:：、.]*/u, "").trim();
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
