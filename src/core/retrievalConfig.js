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
  ],
};
