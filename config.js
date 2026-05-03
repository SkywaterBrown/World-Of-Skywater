module.exports = {
  // Site identity
  siteUrl: 'https://world-of-skywater.vercel.app',
  siteTitle: 'World of Skywater',
  siteDescription: 'A personal archive of essays, poems, mathematics, pictures, and stray thoughts.',
  siteAuthor: 'Skywater',
  language: 'en-us',

  // Theme
  themeKey: 'skywater-theme',
  defaultTheme: 'dark',

  // UI text
  footerText: 'World of Skywater',
  rssPageTitle: 'RSS Feed',
  sitemapPageTitle: 'Sitemap',
  aboutPageTitle: 'About',
  randomPageTitle: 'Random',
  searchPlaceholder: 'Search...',

  // Directories (relative to project root)
  dirs: {
    content: 'content',
    templates: 'templates',
    static: 'static',
    output: 'dist'
  },

  // Build behaviour
  ignoredCategories: ['test'],
  wordsPerMinute: 200,
  postsPerPage: 10
};
