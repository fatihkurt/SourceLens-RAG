export function chunkText(text, { chunkSize = 800, overlap = 150 } = {}) {
  const clean = text.replace(/\r\n/g, '\n').trim();
  const chunks = [];
  let i = 0;

  while (i < clean.length) {
    const start = i;
    const end = Math.min(i + chunkSize, clean.length);
    const chunk = clean.slice(start, end).trim();
    if (chunk) chunks.push({ chunk, start, end });
    i = end - overlap;
    if (i < 0) i = 0;
    if (end === clean.length) break;
  }

  return chunks;
}
