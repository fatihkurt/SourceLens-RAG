export const retrievalConfig = {
  boosts: [
    {
      name: 'exact_filename_match',
      weight: 0.03,
      test: ({ source, query }) => {
        const base = source.split(/[\\/]/).pop()?.replace('.md', '');
        return base && query.toLowerCase().includes(base.toLowerCase());
      }
    },

    {
      name: 'section_contains_query',
      weight: 0.02,
      test: ({ section, query }) => {
        if (!Array.isArray(section)) return false;
        const q = query.toLowerCase();
        return section.some(s => s.toLowerCase().includes(q));
      }
    },

    {
      name: 'definition_section',
      weight: 0.015,
      test: ({ section }) => {
        if (!Array.isArray(section)) return false;
        return section.some(s =>
          /definition|overview|object/i.test(s)
        );
      }
    }
  ]
};
