// Heading-aware Markdown chunker (MVP)
// 1) Split by headings into sections (keeps semantic grouping)
// 2) If a section is too long, window-chunk it with overlap

function normalizeNewlines(s) {
  return s.replace(/\r\n/g, '\n');
}

function isHeadingLine(line) {
  // Markdown ATX headings: #, ##, ### ...
  return /^#{1,6}\s+\S/.test(line);
}

function headingLevel(line) {
  const m = line.match(/^(#{1,6})\s+/);
  return m ? m[1].length : null;
}

function headingText(line) {
  return line.replace(/^#{1,6}\s+/, '').trim();
}

export function splitMarkdownIntoSections(md) {
  const text = normalizeNewlines(md).trim();
  const lines = text.split('\n');

  const sections = [];
  let current = {
    headingPath: [],      // e.g. ["Customer Management Service", "Customer"]
    headingLine: null,    // actual heading line
    level: 0,
    contentLines: [],
  };

  const stack = []; // { level, title }

  const flush = () => {
    const content = current.contentLines.join('\n').trim();
    if (content) {
      sections.push({
        headingPath: current.headingPath.slice(),
        headingLine: current.headingLine,
        content,
      });
    }
    current.contentLines = [];
  };

  for (const line of lines) {
    if (isHeadingLine(line)) {
      // new section begins
      flush();

      const lvl = headingLevel(line);
      const title = headingText(line);

      // maintain heading stack (path)
      while (stack.length && stack[stack.length - 1].level >= lvl) {
        stack.pop();
      }
      stack.push({ level: lvl, title });

      current.headingLine = line.trim();
      current.headingPath = stack.map((x) => x.title);
      current.level = lvl;
      continue;
    }

    current.contentLines.push(line);
  }

  flush();

  // If there were no headings, treat whole doc as one section
  if (!sections.length && text) {
    sections.push({ headingPath: [], headingLine: null, content: text });
  }

  return sections;
}

export function windowChunkText(text, { chunkSize = 800, overlap = 150 } = {}) {
  const clean = normalizeNewlines(text).trim();
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

export function chunkMarkdown(md, { chunkSize = 900, overlap = 180 } = {}) {
  const sections = splitMarkdownIntoSections(md);

  const out = [];
  let globalChunkIndex = 0;

  for (const sec of sections) {
    // include heading path as a short prefix (helps both embeddings and LLM grounding)
    const headingPrefix =
      sec.headingPath.length ? `Section: ${sec.headingPath.join(' > ')}\n` : '';

    const full = `${headingPrefix}${sec.content}`.trim();

    // If section is short enough, keep it as one chunk
    if (full.length <= chunkSize) {
      out.push({
        chunk: full,
        section: sec.headingPath,
        local_start: 0,
        local_end: full.length,
        chunk_index: globalChunkIndex++,
      });
      continue;
    }

    // Otherwise, window-chunk within the section
    const win = windowChunkText(full, { chunkSize, overlap });
    for (const w of win) {
      out.push({
        chunk: w.chunk,
        section: sec.headingPath,
        local_start: w.start,
        local_end: w.end,
        chunk_index: globalChunkIndex++,
      });
    }
  }

  return out;
}
