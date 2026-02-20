function toLower(v) {
  return String(v ?? '').toLowerCase();
}

function getFileStem(source) {
  const file = String(source ?? '').split(/[\\/]/).pop() ?? '';
  return file.replace(/\.md$/i, '').toLowerCase();
}

function hasEntityMatch(haystack, entityCandidates) {
  const hay = toLower(haystack);
  return (entityCandidates ?? []).some((e) => hay.includes(toLower(e)));
}

const AUTHORITY_DOC_PATTERN = /(data-objects?|value-sets?|reference|service-operations?)/i;
const DEFINITION_QUERY_PATTERN = /\b(define|definition|what\s+is|meaning|represent)\b/i;

export const retrievalConfig = {
  boosts: [
    {
      name: 'exact_filename_in_query',
      weight: 0.03,
      test: ({ source, query }) => {
        const file = source.split(/[\\/]/).pop() ?? '';
        const stem = file.replace(/\.md$/i, '');
        return stem.length >= 3 && query.toLowerCase().includes(stem.toLowerCase());
      },
    },
    {
      name: 'section_contains_query',
      weight: 0.02,
      test: ({ section, query }) => {
        if (!Array.isArray(section)) return false;
        const q = query.toLowerCase();
        return section.some((s) => s.toLowerCase().includes(q));
      },
    },
    {
      name: 'definition_like_section',
      weight: 0.015,
      test: ({ section }) => {
        if (!Array.isArray(section)) return false;
        return section.some((s) => /(definition|overview|object|concept)/i.test(s));
      },
    },
    {
      name: 'entity_lexical_match',
      weight: 0.04,
      test: ({ source, entityCandidates }) => {
        if (!entityCandidates?.length) return false;
        // Only match against filename stem, not full path.
        return hasEntityMatch(getFileStem(source), entityCandidates);
      }
    },
    {
      name: 'definition_entity_filename_match',
      weight: 0.03,
      test: ({ source, query, entityCandidates }) => {
        if (!entityCandidates?.length) return false;
        if (!DEFINITION_QUERY_PATTERN.test(String(query ?? ''))) return false;
        return hasEntityMatch(getFileStem(source), entityCandidates);
      }
    },
    {
      name: 'entity_section_match',
      weight: 0.03,
      test: ({ source, section, entityCandidates }) => {
        if (!entityCandidates?.length) return false;

        const sourceHay = getFileStem(source);
        const sectionHay = Array.isArray(section) ? section.join(' ').toLowerCase() : '';
        return entityCandidates.some((e) => {
          const entity = String(e).toLowerCase();
          return !sourceHay.includes(entity) && sectionHay.includes(entity);
        });
      }
    },
    {
      name: 'entity_text_match',
      weight: 0.02,
      test: ({ source, section, entityCandidates, text }) => {
        if (!entityCandidates?.length) return false;

        const sourceHay = getFileStem(source);
        const sectionHay = Array.isArray(section) ? section.join(' ').toLowerCase() : '';
        const textHay = String(text ?? '').toLowerCase();
        return entityCandidates.some((e) => {
          const entity = String(e).toLowerCase();
          return !sourceHay.includes(entity) && !sectionHay.includes(entity) && textHay.includes(entity);
        });
      }
    },
    {
      name: 'authority_doc_for_definition_query',
      weight: 0.015,
      test: ({ source, query, entityCandidates, section, text }) => {
        if (!entityCandidates?.length) return false;
        if (!DEFINITION_QUERY_PATTERN.test(String(query ?? ''))) return false;

        const sourceText = String(source ?? '');
        if (!AUTHORITY_DOC_PATTERN.test(sourceText)) return false;

        const sectionText = Array.isArray(section) ? section.join(' ') : '';
        const textSample = String(text ?? '').slice(0, 1200);
        const hay = `${getFileStem(sourceText)} ${sectionText} ${textSample}`;
        return hasEntityMatch(hay, entityCandidates);
      }
    }
  ],
};
