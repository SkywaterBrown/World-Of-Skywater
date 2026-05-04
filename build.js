const fs = require('fs');
const path = require('path');
const CONFIG = require('./config');

const ROOT = __dirname;
const CONTENT_DIR = path.join(ROOT, CONFIG.dirs.content);
const TEMPLATES_DIR = path.join(ROOT, CONFIG.dirs.templates);
const STATIC_DIR = path.join(ROOT, CONFIG.dirs.static);
const OUTPUT_DIR = path.join(ROOT, CONFIG.dirs.output);

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function render(template, data) {
  let result = template.replace(/\\\{\{/g, '__LIT_BRACE__');
  result = result.replace(/\{\{([-@.\w]+)\}\}/g, (match, key) => {
    if (data[key] !== undefined) return data[key];
    console.warn(`render(): missing key "${key}"`);
    return match;
  });
  result = result.replace(/__LIT_BRACE__/g, '{{');
  return result;
}

function baseData(overrides = {}) {
  const pageUrl = overrides.pageUrl || 'index.html';
  let canonicalPath = pageUrl;
  if (canonicalPath === 'index.html') canonicalPath = '';
  else canonicalPath = canonicalPath.replace(/\.html$/, '');
  const canonicalUrl = CONFIG.siteUrl.replace(/\/$/, '') + '/' + canonicalPath;
  return {
    siteUrl: CONFIG.siteUrl,
    siteTitle: CONFIG.siteTitle,
    siteTitleUpper: CONFIG.siteTitle.toUpperCase(),
    siteDescription: CONFIG.siteDescription,
    siteAuthor: CONFIG.siteAuthor,
    footerText: CONFIG.footerText,
    themeKey: CONFIG.themeKey,
    defaultTheme: CONFIG.defaultTheme,
    searchPlaceholder: CONFIG.searchPlaceholder,
    rssPageTitle: CONFIG.rssPageTitle,
    sitemapPageTitle: CONFIG.sitemapPageTitle,
    aboutPageTitle: CONFIG.aboutPageTitle,
    randomPageTitle: CONFIG.randomPageTitle,
    canonicalUrl,
    ...overrides
  };
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readTemplate(name) {
  return fs.readFileSync(path.join(TEMPLATES_DIR, `${name}.html`), 'utf8');
}

function escapeXml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/`/g, '&#96;')
    .replace(/\\/g, '&#92;')
    .replace(/\u0000/g, '\\0');
}

function slugify(text) {
  return text
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    || 'section';
}

// ---------------------------------------------------------------------------
// Markdown renderer (zero-dependency, basic but functional)
// ---------------------------------------------------------------------------

function renderMarkdown(md) {
  const lines = md.split('\n');
  let html = '';
  let inPre = false;
  let preLines = [];
  let inList = false;
  let listType = '';
  let listItems = [];

  const flushList = () => {
    if (!inList) return;
    const tag = listType === 'ol' ? 'ol' : 'ul';
    html += `<${tag}>\n` + listItems.join('') + `</${tag}>\n`;
    inList = false;
    listItems = [];
  };

  const inline = (text) => {
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');
  };

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    if (line.trim().startsWith('```')) {
      if (inPre) {
        html += `<pre><code>${escapeXml(preLines.join('\n'))}</code></pre>\n`;
        preLines = [];
        inPre = false;
      } else {
        flushList();
        inPre = true;
      }
      continue;
    }

    if (inPre) {
      preLines.push(line);
      continue;
    }

    const trimmed = line.trim();

    if (!trimmed) {
      flushList();
      continue;
    }

    // Headers
    if (trimmed.startsWith('### ')) {
      flushList();
      html += `<h3>${inline(trimmed.slice(4))}</h3>\n`;
      continue;
    }
    if (trimmed.startsWith('## ')) {
      flushList();
      html += `<h2>${inline(trimmed.slice(3))}</h2>\n`;
      continue;
    }
    if (trimmed.startsWith('# ')) {
      flushList();
      html += `<h1>${inline(trimmed.slice(2))}</h1>\n`;
      continue;
    }

    // Lists
    if (/^[-*]\s+/.test(trimmed)) {
      if (!inList) { inList = true; listType = 'ul'; }
      const item = trimmed.replace(/^[-*]\s+/, '');
      listItems.push(`<li>${inline(item)}</li>\n`);
      continue;
    }
    if (/^\d+\.\s+/.test(trimmed)) {
      if (!inList) { inList = true; listType = 'ol'; }
      const item = trimmed.replace(/^\d+\.\s+/, '');
      listItems.push(`<li>${inline(item)}</li>\n`);
      continue;
    }

    flushList();
    html += `<p>${inline(trimmed)}</p>\n`;
  }

  if (inPre) {
    html += `<pre><code>${escapeXml(preLines.join('\n'))}</code></pre>\n`;
  }
  flushList();

  return html;
}

// ---------------------------------------------------------------------------
// Content parser
// ---------------------------------------------------------------------------

function parsePage(category, filename, content) {
  let meta = {};
  let body = content;
  let fmEnd = 0;

  // Support HTML comment frontmatter: <!-- ... -->
  const htmlFmMatch = content.match(/^<!--\s*\n?([\s\S]*?)\n?\s*-->/);
  // Support YAML-style frontmatter for markdown: --- ... ---
  const yamlFmMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);

  if (htmlFmMatch) {
    const fm = htmlFmMatch[1];
    fm.split('\n').forEach(line => {
      const m = line.match(/^(\w+):\s*(.+)$/);
      if (m) meta[m[1]] = escapeXml(m[2].trim());
    });
    body = content.slice(htmlFmMatch[0].length).trim();
  } else if (yamlFmMatch) {
    const fm = yamlFmMatch[1];
    fm.split('\n').forEach(line => {
      const m = line.match(/^(\w+):\s*(.+)$/);
      if (m) meta[m[1]] = escapeXml(m[2].trim());
    });
    body = content.slice(yamlFmMatch[0].length).trim();
  }

  const basename = path.basename(filename, path.extname(filename));
  const dateSlugMatch = basename.match(/^(\d{4}-\d{2}-\d{2})-(.+)$/);

  const date = meta.date || (dateSlugMatch ? dateSlugMatch[1] : new Date().toISOString().split('T')[0]);
  const slug = meta.slug ? escapeXml(meta.slug) : (dateSlugMatch ? dateSlugMatch[2] : basename);
  const title = meta.title ? escapeXml(meta.title) : slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  let tags = [];
  if (meta.tags) {
    tags = meta.tags.split(/[,\\s]+/).map(t => escapeXml(t.trim().toLowerCase())).filter(Boolean);
  }

  const draft = meta.draft === 'true' || meta.draft === 'yes';

  // Render markdown if needed
  const isMarkdown = filename.endsWith('.md');
  if (isMarkdown) {
    body = renderMarkdown(body);
  }

  const plain = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const wordCount = plain.split(/\s+/).filter(Boolean).length;
  const readingTime = Math.max(1, Math.ceil(wordCount / CONFIG.wordsPerMinute));
  const excerpt = plain.length > 160 ? plain.slice(0, 160) + '…' : plain;

  return {
    title,
    date,
    category,
    slug,
    tags,
    draft,
    filename: `${basename}.html`,
    body,
    plain,
    wordCount,
    readingTime,
    excerpt
  };
}

// ---------------------------------------------------------------------------
// Content scanner
// ---------------------------------------------------------------------------

function scanContent() {
  const pages = [];
  const drafts = [];
  const categories = [];

  if (!fs.existsSync(CONTENT_DIR)) {
    console.log('No content/ directory found. Create one and add folders.');
    return { pages, drafts, categories };
  }

  fs.readdirSync(CONTENT_DIR).forEach(cat => {
    const catPath = path.join(CONTENT_DIR, cat);
    if (!fs.statSync(catPath).isDirectory()) return;
    if (CONFIG.ignoredCategories.includes(cat)) {
      console.log(`  Ignoring category: ${cat}`);
      return;
    }

    categories.push(cat);

    fs.readdirSync(catPath).forEach(file => {
      if (!file.endsWith('.html') && !file.endsWith('.md')) return;
      const filePath = path.join(catPath, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const page = parsePage(cat, file, content);
      if (page.draft) {
        drafts.push(page);
      } else {
        pages.push(page);
      }
    });
  });

  pages.sort((a, b) => new Date(b.date) - new Date(a.date));

  const seen = new Set();
  pages.forEach(p => {
    const key = `${p.category}/${p.filename}`;
    if (seen.has(key)) {
      console.warn(`WARNING: Duplicate file "${key}" will overwrite earlier file.`);
    }
    seen.add(key);
  });

  if (drafts.length > 0) {
    console.log(`  Skipped ${drafts.length} draft(s): ${drafts.map(d => d.title).join(', ')}`);
  }

  return { pages, drafts, categories };
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

function cleanOutput() {
  if (fs.existsSync(OUTPUT_DIR)) {
    fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
  }
  ensureDir(OUTPUT_DIR);
}

function generatePagination(pageNum, totalPages, pageUrlPrefix) {
  if (totalPages <= 1) return '';

  let html = '<div class="pagination">';

  if (pageNum > 1) {
    const prev = pageNum === 2 ? `${pageUrlPrefix}.html` : `${pageUrlPrefix}-page-${pageNum - 1}.html`;
    html += `<a href="${prev}">&larr;</a>`;
  }

  for (let i = 1; i <= totalPages; i++) {
    if (i === 1) {
      const url = `${pageUrlPrefix}.html`;
      html += i === pageNum ? `<span class="current">${i}</span>` : `<a href="${url}">${i}</a>`;
    } else {
      const url = `${pageUrlPrefix}-page-${i}.html`;
      html += i === pageNum ? `<span class="current">${i}</span>` : `<a href="${url}">${i}</a>`;
    }
  }

  if (pageNum < totalPages) {
    const next = `${pageUrlPrefix}-page-${pageNum + 1}.html`;
    html += `<a href="${next}">&rarr;</a>`;
  }

  html += '</div>';
  return html;
}

function generateArchive(pages, baseTpl, categoryLinks) {
  const archiveTpl = readTemplate('archive');

  const byYear = {};
  pages.forEach(p => {
    const year = p.date.slice(0, 4);
    if (!byYear[year]) byYear[year] = [];
    byYear[year].push(p);
  });

  const yearSections = Object.keys(byYear).sort((a, b) => b - a).map(year => {
    const items = byYear[year].map(p =>
      `<li><a href="${p.filename}">${escapeXml(p.title)}</a><span class="date">${p.date}</span></li>`
    ).join('\n                ');
    return `<div class="category">\n            <h2 class="category-title">${year}</h2>\n            <ul class="category-list">\n                ${items}\n            </ul>\n        </div>`;
  }).join('\n');

  const archiveContent = render(archiveTpl, {
    count: pages.length,
    years: yearSections
  });

  const html = render(baseTpl, baseData({
    pageTitle: `Archive - ${CONFIG.siteTitle}`,
    pageUrl: 'archive.html',
    categoryLinks,
    mainClass: 'content',
    mainContent: archiveContent
  }));

  fs.writeFileSync(path.join(OUTPUT_DIR, 'archive.html'), html);
}

function generateRSS(pages) {
  const now = new Date().toUTCString();
  const items = pages.map(p => {
    const desc = p.excerpt || p.plain.slice(0, 280) + (p.plain.length > 280 ? '…' : '');
    return `    <item>\n      <title>${escapeXml(p.title)}</title>\n      <link>${CONFIG.siteUrl}/${p.filename}</link>\n      <pubDate>${new Date(p.date).toUTCString()}</pubDate>\n      <description>${escapeXml(desc)}</description>\n      <category>${escapeXml(p.category)}</category>\n      ${p.tags.map(t => `<category>${escapeXml(t)}</category>`).join('\n      ')}\n      <guid isPermaLink="false">${escapeXml(p.filename)}</guid>\n    </item>`;
  }).join('\n');

  const rss = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n  <channel>\n    <title>${escapeXml(CONFIG.siteTitle)}</title>\n    <link>${CONFIG.siteUrl}</link>\n    <description>${escapeXml(CONFIG.siteDescription)}</description>\n    <language>${CONFIG.language}</language>\n    <lastBuildDate>${now}</lastBuildDate>\n    <atom:link href="${CONFIG.siteUrl}/rss.xml" rel="self" type="application/rss+xml" />\n${items}\n  </channel>\n</rss>`;

  fs.writeFileSync(path.join(OUTPUT_DIR, 'rss.xml'), rss.trim());

  // Human-readable HTML page (wrapped in base template)
  const rssTpl = readTemplate('rss');
  const feedItems = pages.map(p => {
    const cats = p.tags.length ? `<div class="feed-cats">${p.tags.map(t => `<span>${escapeXml(t)}</span>`).join('')}</div>` : '';
    return `<div class="feed-item">\n      <h3><a href="${p.filename}">${escapeXml(p.title)}</a></h3>\n      <div class="feed-meta">${p.date} | ${p.category} | ${p.readingTime} min read</div>\n      ${cats}\n    </div>`;
  }).join('\n');

  const rssContent = render(rssTpl, baseData({
    count: pages.length,
    items: feedItems,
    pageTitle: `${CONFIG.rssPageTitle} — ${CONFIG.siteTitle}`,
    pageUrl: 'rss.html',
    rssPageTitle: CONFIG.rssPageTitle
  }));

  const rssHtml = render(baseTpl, baseData({
    pageTitle: `${CONFIG.rssPageTitle} — ${CONFIG.siteTitle}`,
    pageUrl: 'rss.html',
    categoryLinks,
    mainClass: 'content',
    mainContent: rssContent
  }));
  fs.writeFileSync(path.join(OUTPUT_DIR, 'rss.html'), rssHtml);
}

function generateSitemap(pages, categories, tags) {
  const urls = [];
  urls.push({ loc: `${CONFIG.siteUrl}/`, lastmod: new Date().toISOString().split('T')[0] });

  categories.forEach(c => {
    urls.push({ loc: `${CONFIG.siteUrl}/${c}.html`, lastmod: new Date().toISOString().split('T')[0] });
  });

  tags.forEach(t => {
    urls.push({ loc: `${CONFIG.siteUrl}/tag-${t}.html`, lastmod: new Date().toISOString().split('T')[0] });
  });

  pages.forEach(p => {
    urls.push({ loc: `${CONFIG.siteUrl}/${p.filename}`, lastmod: p.date });
  });

  // Raw XML for crawlers
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n  </url>`).join('\n')}\n</urlset>`;
  fs.writeFileSync(path.join(OUTPUT_DIR, 'sitemap.xml'), xml.trim());

  // Human-readable HTML page (wrapped in base template)
  const mapTpl = readTemplate('sitemap');
  const rows = urls.map(u => {
    let relativePath = u.loc.replace(CONFIG.siteUrl + '/', '');
    if (!relativePath) relativePath = 'index.html';
    return `<tr>\n    <td><a href="${relativePath}">${escapeXml(u.loc)}</a></td>\n    <td>${u.lastmod}</td>\n  </tr>`;
  }).join('\n');

  const mapContent = render(mapTpl, {
    count: urls.length,
    rows,
    sitemapPageTitle: CONFIG.sitemapPageTitle
  });

  const mapHtml = render(baseTpl, baseData({
    pageTitle: `${CONFIG.sitemapPageTitle} — ${CONFIG.siteTitle}`,
    pageUrl: 'sitemap.html',
    categoryLinks,
    mainClass: 'content',
    mainContent: mapContent
  }));
  fs.writeFileSync(path.join(OUTPUT_DIR, 'sitemap.html'), mapHtml);
}

function buildCategoryContent(cat, pageList, pageNum, totalPages) {
  const catPages = pageList.filter(p => p.category === cat);
  const items = catPages.map(p =>
    `<li><a href="${p.filename}">${escapeXml(p.title)}</a><span class="date">${p.date}</span></li>`
  ).join('\n                ');

  const pagination = generatePagination(pageNum, totalPages, cat);

  return render(readTemplate('category'), {
    categoryName: cat,
    count: catPages.length,
    items,
    pagination
  });
}

function buildTagContent(tag, pageList, pageNum, totalPages) {
  const tagPages = pageList.filter(p => p.tags.includes(tag));
  const items = tagPages.map(p =>
    `<li><a href="${p.filename}">${escapeXml(p.title)}</a><span class="date">${p.date}</span></li>`
  ).join('\n                ');

  const pagination = generatePagination(pageNum, totalPages, `tag-${tag}`);

  return render(readTemplate('category'), {
    categoryName: `tag: ${tag}`,
    count: tagPages.length,
    items,
    pagination
  });
}

function writePaginatedPages(prefix, count, buildFn, pageTitleFn, baseTpl, categoryLinks, mainClass = 'content') {
  const totalPages = Math.ceil(count / CONFIG.postsPerPage) || 1;

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const content = buildFn(pageNum, totalPages);
    const pageUrl = pageNum === 1 ? `${prefix}.html` : `${prefix}-page-${pageNum}.html`;
    const html = render(baseTpl, baseData({
      pageTitle: pageTitleFn(pageNum, totalPages),
      pageUrl,
      categoryLinks,
      mainClass,
      mainContent: content
    }));
    fs.writeFileSync(path.join(OUTPUT_DIR, pageUrl), html);
  }
}

// ---------------------------------------------------------------------------
// Main build
// ---------------------------------------------------------------------------

let baseTpl, categoryLinks;

function build() {
  cleanOutput();

  const { pages, drafts, categories } = scanContent();
  if (pages.length === 0) {
    console.log('No content found. Add files to content/ folders.');
    return;
  }

  baseTpl = readTemplate('base');
  const postTpl = readTemplate('post');

  const allTags = new Set();
  pages.forEach(p => p.tags.forEach(t => allTags.add(t)));
  const tags = Array.from(allTags).sort();

  categoryLinks = categories.map(c =>
    `<a href="${c}.html">${c.charAt(0).toUpperCase() + c.slice(1)}</a>`
  ).join('\n            ');

  // Category pages (paginated)
  categories.forEach(cat => {
    const catPages = pages.filter(p => p.category === cat);
    const totalPages = Math.ceil(catPages.length / CONFIG.postsPerPage) || 1;

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const start = (pageNum - 1) * CONFIG.postsPerPage;
      const pageList = catPages.slice(start, start + CONFIG.postsPerPage);
      const content = buildCategoryContent(cat, pageList, pageNum, totalPages);
      const pageUrl = pageNum === 1 ? `${cat}.html` : `${cat}-page-${pageNum}.html`;
      const html = render(baseTpl, baseData({
        pageTitle: `${cat.charAt(0).toUpperCase() + cat.slice(1)} - ${CONFIG.siteTitle}`,
        pageUrl,
        categoryLinks,
        mainClass: 'content',
        mainContent: content
      }));
      fs.writeFileSync(path.join(OUTPUT_DIR, pageUrl), html);
    }
  });

  // Tag pages (paginated)
  tags.forEach(tag => {
    const tagPages = pages.filter(p => p.tags.includes(tag));
    const totalPages = Math.ceil(tagPages.length / CONFIG.postsPerPage) || 1;

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const start = (pageNum - 1) * CONFIG.postsPerPage;
      const pageList = tagPages.slice(start, start + CONFIG.postsPerPage);
      const content = buildTagContent(tag, pageList, pageNum, totalPages);
      const pageUrl = pageNum === 1 ? `tag-${tag}.html` : `tag-${tag}-page-${pageNum}.html`;
      const html = render(baseTpl, baseData({
        pageTitle: `Tag: ${tag} - ${CONFIG.siteTitle}`,
        pageUrl,
        categoryLinks,
        mainClass: 'content',
        mainContent: content
      }));
      fs.writeFileSync(path.join(OUTPUT_DIR, pageUrl), html);
    }
  });

  // Homepage
  const nowPages = pages.slice(0, 2);
  const nowItems = nowPages.map(p => {
    return `\n        <div class="now-item">\n            <div class="now-meta"><a href="${p.category}.html">${p.category}</a> — ${p.date}</div>\n            <h3 class="now-title"><a href="${p.filename}">${escapeXml(p.title)}</a></h3>\n            <p class="now-excerpt">${escapeXml(p.excerpt)}</p>\n            <div class="now-meta" style="margin-top:0.5rem;font-size:0.75rem;opacity:0.7;">${p.readingTime} min read</div>\n        </div>`;
  }).join('');

  const nowSection = nowItems ? `\n    <section class="now-section">\n        <h2 class="now-heading">Latest</h2>\n        <div class="now-grid">\n            ${nowItems}\n        </div>\n    </section>` : '';

  const indexContent = nowSection + '\n    <section class="categories-section">\n        <h2 class="categories-heading">Categories</h2>\n        <div class="categories-wrapper">\n' + categories.map(c => {
    const catPages = pages.filter(p => p.category === c);
    return buildCategoryContent(c, catPages.slice(0, CONFIG.postsPerPage), 1, Math.ceil(catPages.length / CONFIG.postsPerPage) || 1);
  }).join('\n') + '\n        </div>\n    </section>';

  const indexHtml = render(baseTpl, baseData({
    pageTitle: CONFIG.siteTitle,
    pageUrl: 'index.html',
    categoryLinks,
    mainClass: 'content',
    mainContent: indexContent
  }));
  fs.writeFileSync(path.join(OUTPUT_DIR, 'index.html'), indexHtml);

  // Individual posts
  pages.forEach(page => {
    const tagLinks = page.tags.length
      ? `<div class="tags">${page.tags.map(t => `<a href="tag-${t}.html">${t}</a>`).join('')}</div>`
      : '';

    const bodyWithAnchors = page.body.replace(
      /<h2>(.*?)<\/h2>/g,
      (match, text) => {
        const slug = slugify(text);
        return `<h2 id="${slug}">${text}<a href="#${slug}" class="heading-anchor" aria-label="Link to this section">#</a></h2>`;
      }
    );

    const postContent = render(postTpl, {
      title: escapeXml(page.title),
      date: page.date,
      category: page.category,
      tags: tagLinks,
      body: bodyWithAnchors,
      readingTime: page.readingTime
    });

    const html = render(baseTpl, baseData({
      pageTitle: `${page.title} - ${CONFIG.siteTitle}`,
      pageUrl: page.filename,
      categoryLinks,
      mainClass: 'essay-content',
      mainContent: postContent
    }));

    fs.writeFileSync(path.join(OUTPUT_DIR, page.filename), html);
  });

  // Copy stylesheet
  fs.copyFileSync(path.join(ROOT, 'style.css'), path.join(OUTPUT_DIR, 'style.css'));

  // Recursive copy helper for older Node versions
  function copyRecursive(src, dest) {
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
      ensureDir(dest);
      fs.readdirSync(src).forEach(child => {
        copyRecursive(path.join(src, child), path.join(dest, child));
      });
    } else {
      fs.copyFileSync(src, dest);
    }
  }

  // Copy static files
  if (fs.existsSync(STATIC_DIR)) {
    fs.readdirSync(STATIC_DIR).forEach(file => {
      copyRecursive(path.join(STATIC_DIR, file), path.join(OUTPUT_DIR, file));
    });
  }

  // Search script
  const searchData = pages.map(p => ({
    title: p.title,
    date: p.date,
    category: p.category,
    tags: p.tags,
    url: p.filename,
    readingTime: p.readingTime,
    excerpt: p.excerpt
  }));

  const scriptContent = `let originalContent = '';
const pages = ${JSON.stringify(searchData, null, 2)};

function searchContent() {
  const term = document.getElementById('searchBar').value.toLowerCase().trim();
  const container = document.getElementById('mainContent');
  if (!container) return;

  if (!originalContent) originalContent = container.innerHTML;

  if (!term) {
    container.innerHTML = originalContent;
    return;
  }

  container.innerHTML = '';

  const filtered = pages.filter(p =>
    p.title.toLowerCase().includes(term) ||
    p.category.toLowerCase().includes(term) ||
    p.tags.some(t => t.toLowerCase().includes(term)) ||
    (p.excerpt && p.excerpt.toLowerCase().includes(term))
  );

  if (filtered.length === 0) {
    container.innerHTML = '<p>No entries found.</p>';
    return;
  }

  const grouped = {};
  filtered.forEach(p => {
    if (!grouped[p.category]) grouped[p.category] = [];
    grouped[p.category].push(p);
  });

  Object.keys(grouped).sort().forEach(tag => {
    const section = document.createElement('div');
    section.className = 'category';

    const title = document.createElement('h2');
    title.className = 'category-title';
    title.textContent = tag + ' [' + grouped[tag].length + ']';
    section.appendChild(title);

    const list = document.createElement('ul');
    list.className = 'category-list';

    grouped[tag].forEach(page => {
      const li = document.createElement('li');
      const anchor = document.createElement('a');
      anchor.href = page.url;
      anchor.textContent = page.title;
      const dateSpan = document.createElement('span');
      dateSpan.className = 'date';
      dateSpan.textContent = page.date;
      li.appendChild(anchor);
      li.appendChild(dateSpan);
      list.appendChild(li);
    });

    section.appendChild(list);
    container.appendChild(section);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const searchBar = document.getElementById('searchBar');
  if (searchBar) {
    searchBar.addEventListener('keyup', (e) => {
      if (e.key === 'Enter') searchContent();
    });
  }
});`;

  fs.writeFileSync(path.join(OUTPUT_DIR, 'script.js'), scriptContent);

  // Auxiliary files
  generateRSS(pages);
  generateSitemap(pages, categories, tags);
  generateArchive(pages, baseTpl, categoryLinks);

  // About page
  const aboutTpl = readTemplate('about');
  const aboutContent = render(baseTpl, baseData({
    pageTitle: `${CONFIG.aboutPageTitle} - ${CONFIG.siteTitle}`,
    pageUrl: 'about.html',
    categoryLinks,
    mainClass: 'essay-content',
    mainContent: aboutTpl
  }));
  fs.writeFileSync(path.join(OUTPUT_DIR, 'about.html'), aboutContent);

  // 404 page
  const notFoundTpl = readTemplate('404');
  const notFoundContent = render(baseTpl, baseData({
    pageTitle: `Not Found - ${CONFIG.siteTitle}`,
    pageUrl: '404.html',
    categoryLinks,
    mainClass: 'essay-content',
    mainContent: notFoundTpl
  }));
  fs.writeFileSync(path.join(OUTPUT_DIR, '404.html'), notFoundContent);

  // Random page
  const randomUrls = pages.map(p => p.filename);
  const randomHtml = `<!DOCTYPE html>
<html lang="en" data-theme="${CONFIG.defaultTheme}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${CONFIG.randomPageTitle} - ${CONFIG.siteTitle}</title>
    <link rel="stylesheet" href="style.css">
    <style>
        body { display: flex; align-items: center; justify-content: center; min-height: 100vh; flex-direction: column; gap: 1rem; }
        .random-msg { color: var(--text-muted); font-size: 0.9rem; }
        .random-link { color: var(--accent-orange); text-decoration: none; border-bottom: 1px solid transparent; transition: border-color 0.2s; }
        .random-link:hover { border-bottom-color: var(--accent-orange-bright); }
    </style>
</head>
<body>
    <p class="random-msg">Selecting a random post...</p>
    <script>
    (function() {
        const urls = ${JSON.stringify(randomUrls)};
        const pick = urls[Math.floor(Math.random() * urls.length)];
        window.location.replace(pick);
    })();
    </script>
</body>
</html>`;
  fs.writeFileSync(path.join(OUTPUT_DIR, 'random.html'), randomHtml);

  // Vercel config for clean URLs
  const vercelConfig = { cleanUrls: true, trailingSlash: false };
  fs.writeFileSync(path.join(OUTPUT_DIR, 'vercel.json'), JSON.stringify(vercelConfig, null, 2));

  console.log('\n✓ Build complete');
  console.log(`  Categories: ${categories.join(', ')}`);
  console.log(`  Tags:       ${tags.join(', ') || '(none)'}`);
  console.log(`  Pages:      ${pages.length}`);
  console.log(`  Drafts:     ${drafts.length}`);
  console.log(`  Output:     ${OUTPUT_DIR}\n`);
}

if (process.argv.includes('--watch')) {
  console.log('Watching content/ for changes... (Ctrl+C to stop)');
  build();

  if (fs.existsSync(CONTENT_DIR)) {
    fs.watch(CONTENT_DIR, { recursive: true }, (eventType, filename) => {
      if (filename && (filename.endsWith('.html') || filename.endsWith('.md'))) {
        console.log(`\n[${new Date().toLocaleTimeString()}] Change detected: ${filename}`);
        build();
      }
    });
  }
} else {
  build();
}
