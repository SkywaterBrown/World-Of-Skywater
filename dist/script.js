let originalContent = '';
const pages = [
  {
    "title": "Markdown Test",
    "date": "2026-03-25",
    "category": "essays",
    "tags": [
      "meta",
      "testing"
    ],
    "url": "2026-03-25-markdown-test.html",
    "readingTime": 1,
    "excerpt": "Heading One This is a paragraph with bold and italic text. Also some inline code . Heading Two Here is a link to home . Heading Three List item one List item tw…"
  },
  {
    "title": "Lake Reflection",
    "date": "2026-03-24",
    "category": "pictures",
    "tags": [
      "photo",
      "water",
      "silence"
    ],
    "url": "2026-03-24-lake-reflection.html",
    "readingTime": 1,
    "excerpt": "[A photograph of still water, mirroring clouds that are not there.] The lake does not distinguish between sky and shore. It reflects what passes overhead and wh…"
  },
  {
    "title": "The Topology of Coffee",
    "date": "2026-03-23",
    "category": "essays",
    "tags": [
      "physics",
      "topology",
      "morning"
    ],
    "url": "2026-03-23-the-topology-of-coffee.html",
    "readingTime": 1,
    "excerpt": "The cup is a manifold. The handle, a torus. When you drink, you traverse a homeomorphism between the liquid state and your internal geometry. This is not metaph…"
  },
  {
    "title": "Fibonacci in Nature",
    "date": "2026-03-22",
    "category": "math",
    "tags": [
      "math",
      "nature",
      "geometry"
    ],
    "url": "2026-03-22-fibonacci-in-nature.html",
    "readingTime": 1,
    "excerpt": "The spiral of a nautilus shell does not follow the Fibonacci sequence. This is the first thing they do not teach you. What it does follow is a logarithmic spira…"
  },
  {
    "title": "Static",
    "date": "2026-03-21",
    "category": "poems",
    "tags": [
      "noise",
      "signal",
      "loss"
    ],
    "url": "2026-03-21-static.html",
    "readingTime": 1,
    "excerpt": "The radio hums between stations. Not silence, but the shape of silence— white noise wearing a collar of static, pretending to be a voice. I have grown accustome…"
  }
];

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
      li.innerHTML = '<a href="' + page.url + '">' + page.title + '</a><span class="date">' + page.date + '</span>';
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
});