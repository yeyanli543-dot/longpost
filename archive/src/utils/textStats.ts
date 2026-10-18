export function extractTitleFromContent(content: string): string {
  if (!content) return '无标题文档';
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Strip markdown header symbols
    const clean = trimmed.replace(/^#+\s*/, '').trim();
    if (clean) {
      return clean.length > 50 ? clean.slice(0, 50) + '...' : clean;
    }
  }
  return '无标题文档';
}
