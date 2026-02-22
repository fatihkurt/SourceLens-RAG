const DEFINITION_QUERY_PATTERN = /\b(define|definition|what is|what's|meaning of)\b/i;
const AUTHORITY_DOC_PATTERN = /(customer-management-data-objects|customer-management-service-reference|customer-management-service-operations)\.md$/i;

function getFileStem(source) {
  const file = String(source ?? '').split(/[\\/]/).pop() ?? '';
  return file.replace(/\.md$/i, '').toLowerCase();
}

function normalizeEntity(e) {
  return String(e ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function hasEntityMatch(haystack, entityCandidates) {
  const hay = String(haystack ?? '').toLowerCase();
  return entityCandidates.some((e) => {
    const ent = normalizeEntity(e);
    if (!ent) return false;

    // allow "customer role" == "customerrole"
    const entNoSpace = ent.replace(/\s+/g, '');
    return hay.includes(ent) || hay.includes(entNoSpace);
  });
}

function textLooksLikeDefinition(sectionArr, text) {
  const section = Array.isArray(sectionArr) ? sectionArr.join(' ').toLowerCase() : '';
  const head = String(text ?? '').slice(0, 600).toLowerCase();

  // cheap heuristic: section has "definition" / "remarks" / "syntax" OR text starts definitional
  const sectionHint = /\b(definition|remarks|summary|description|syntax)\b/.test(section);
  const textHint = /^(\s*)?(a|an|the)\s+\w+(\s+\w+){0,5}\s+(is|are)\b/.test(head);
  return sectionHint || textHint;
}

/**
 * Rerank hits (already have base semantic score) using cheap lexical/entity/definition/authority heuristics.
 *
 * @param {Array} hits Each item should include: { score, metadata: { source, chunk_index, section?, text? } }
 * @param {Object} ctx { query, entityCandidates, debug }
 * @returns {Object} { reranked, traces }
 */
export function rerank(hits, { query, entityCandidates = [], debug = false } = {}) {
  const q = String(query ?? '');
  const qLower = q.toLowerCase();
  const isDefinitionQuery = DEFINITION_QUERY_PATTERN.test(qLower);
  const anyEntity = Array.isArray(entityCandidates) && entityCandidates.length > 0;

  if (!anyEntity) {
    return {
      reranked: hits.map((h) => ({
        ...h,
        rerank: { base: h.score ?? 0, boost: 0, final: h.score ?? 0, reasons: [] },
      })),
      traces: [],
    };
  }

  const hasAnyAnchor = hits.some((h) => {
    const source = h?.metadata?.source ?? '';
    const stem = getFileStem(source);
    return hasEntityMatch(stem, entityCandidates);
  });

  // If no anchor match, DO NOT rerank (prevents generic docs taking over)
  if (!hasAnyAnchor) {
    return {
      reranked: hits.map((h) => ({
        ...h,
        rerank: { base: h.score ?? 0, boost: 0, final: h.score ?? 0, reasons: ['rerank_skipped:no_anchor'] },
      })),
      traces: [],
    };
  }

  const traces = [];

  const scored = hits.map((h) => {
    const source = h?.metadata?.source ?? '';
    const stem = getFileStem(source);
    const section = h?.metadata?.section;
    const text = h?.metadata?.text ?? '';

    const base = Number.isFinite(h.score) ? h.score : 0;

    let boost = 0;
    const reasons = [];

    // 1) entity lexical match on filename stem
    if (entityCandidates?.length && hasEntityMatch(stem, entityCandidates)) {
      boost += 0.08;
      reasons.push('entity_lexical_match:+0.08');
    }

    // 2) definition query + entity match on filename stem
    if (isDefinitionQuery && entityCandidates?.length && hasEntityMatch(stem, entityCandidates)) {
      boost += 0.04;
      reasons.push('definition_entity_filename_match:+0.04');
    }

    // 3) definition-like section/text (very light)
    if (isDefinitionQuery && textLooksLikeDefinition(section, text)) {
      boost += 0.005;
      reasons.push('definition_like_section:+0.005');
    }

    // 4) entity match in section (but not in filename)
    if (entityCandidates?.length) {
      const sectionHay = Array.isArray(section) ? section.join(' ').toLowerCase() : '';
      const inStem = hasEntityMatch(stem, entityCandidates);
      if (!inStem && hasEntityMatch(sectionHay, entityCandidates)) {
        boost += 0.03;
        reasons.push('entity_section_match:+0.03');
      }
    }

    // 5) entity match in text (but not in filename/section)
    if (entityCandidates?.length) {
      const sectionHay = Array.isArray(section) ? section.join(' ').toLowerCase() : '';
      const inStem = hasEntityMatch(stem, entityCandidates);
      const inSection = hasEntityMatch(sectionHay, entityCandidates);
      if (!inStem && !inSection && hasEntityMatch(String(text).toLowerCase(), entityCandidates)) {
        boost += 0.02;
        reasons.push('entity_text_match:+0.02');
      }
    }

    // 6) authority doc preference for definition queries (light)
    if (isDefinitionQuery && AUTHORITY_DOC_PATTERN.test(String(source))) {
      boost += 0.015;
      reasons.push('authority_doc_for_definition_query:+0.015');
    }

    // 7) tiny bonus if query literally contains filename stem (rare but helps)
    if (stem && qLower.includes(stem)) {
      boost += 0.02;
      reasons.push('query_mentions_filename:+0.02');
    }

    const final = base + boost;

    if (debug) {
      traces.push({
        source,
        chunk_index: h?.metadata?.chunk_index,
        base: Number(base.toFixed(4)),
        boost: Number(boost.toFixed(4)),
        final: Number(final.toFixed(4)),
        reasons,
      });
    }

    return { ...h, rerank: { base, boost, final, reasons } };
  });

  scored.sort((a, b) => b.rerank.final - a.rerank.final);

  return { reranked: scored, traces };
}