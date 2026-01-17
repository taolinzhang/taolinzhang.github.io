
document.addEventListener('DOMContentLoaded', () => {
  const searchButton = document.querySelector('.search-button');
  const searchContainer = document.querySelector('.search-container');
  const searchBar = document.querySelector('.search-bar');
  const searchLayout = document.querySelector('.search-layout');
  let searchIndex = [];
  let isIndexLoaded = false;

  // Function to load the search index
  async function loadIndex() {
    if (isIndexLoaded) return;
    try {
      const searchUrl = (window.siteConfig && window.siteConfig.searchIndex) ? window.siteConfig.searchIndex : '/index.json';
      const response = await fetch(searchUrl);
      searchIndex = await response.json();
      isIndexLoaded = true;
    } catch (error) {
      console.error('Failed to load search index:', error);
    }
  }

  // Toggle search modal
  function toggleSearch() {
    const isActive = searchContainer.classList.contains('active');
    if (!isActive) {
      searchContainer.classList.add('active');
      searchBar.focus();
      loadIndex();
    } else {
      searchContainer.classList.remove('active');
      searchBar.value = '';
      searchLayout.innerHTML = '';
      searchLayout.classList.remove('display-results');
    }
  }

  // Search logic
  function performSearch(query) {
    if (!query) {
      searchLayout.innerHTML = '';
      searchLayout.classList.remove('display-results');
      return;
    }

    const lowerQuery = query.toLowerCase();
    const results = searchIndex.filter(item => {
      const titleMatch = item.title.toLowerCase().includes(lowerQuery);
      const tagsMatch = item.tags ? item.tags.some(tag => tag.toLowerCase().includes(lowerQuery)) : false;
      const contentMatch = item.content.toLowerCase().includes(lowerQuery);
      return titleMatch || tagsMatch || contentMatch;
    });

    renderResults(results);
  }

  // Render results
  function renderResults(results) {
    searchLayout.classList.add('display-results');
    
    if (results.length === 0) {
      searchLayout.innerHTML = `
        <div class="results-container">
           <div class="result-card">
             <p>No results found</p>
           </div>
        </div>`;
      return;
    }

    const resultsHtml = results.map(item => `
      <a href="${item.permalink}" class="result-card" tabindex="0">
        <h3>${item.title}</h3>
        ${item.tags ? `
          <ul class="tags">
            ${item.tags.map(tag => `<li><p>${tag}</p></li>`).join('')}
          </ul>
        ` : ''}
        <p>${new Date(item.date * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' })}</p>
      </a>
    `).join('');

    searchLayout.innerHTML = `<div class="results-container">${resultsHtml}</div>`;
  }

  // Event Listeners
  searchButton.addEventListener('click', toggleSearch);

  // Close when clicking outside
  searchContainer.addEventListener('click', (e) => {
    if (e.target === searchContainer) {
      toggleSearch();
    }
  });

  // Hotkey support (Cmd+K or Ctrl+K)
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      toggleSearch();
    }
    if (e.key === 'Escape' && searchContainer.classList.contains('active')) {
      toggleSearch();
    }
  });

  // Search input handler
  searchBar.addEventListener('input', (e) => {
    performSearch(e.target.value);
  });
});
