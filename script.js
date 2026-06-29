(function() {
  let documents = [];
  let activeTag = null;
  let activeAuthor = null;
  let activePlatform = null;

  const searchInput = document.getElementById('search-input');
  const tagsContainer = document.getElementById('tags-container');
  const documentsList = document.getElementById('documents-list');
  const noResults = document.getElementById('no-results');
  const authorFilter = document.getElementById('author-filter');
  const platformFilter = document.getElementById('platform-filter');
  const clearFiltersBtn = document.getElementById('clear-filters-btn');

  // Fetch and initialize
  async function init() {
    try {
      const documentsPath = window.DOCUMENTS_PATH || 'documents.json';
      const response = await fetch(documentsPath);
      documents = await response.json();
      renderTags();
      renderFilterOptions();
      renderDocuments();
    } catch (error) {
      console.error('Failed to load documents:', error);
      documentsList.innerHTML = '<p class="error">Failed to load documents.</p>';
    }
  }

  // Get all unique tags
  function getAllTags() {
    const tagSet = new Set();
    documents.forEach(doc => {
      doc.tags.forEach(tag => tagSet.add(tag));
    });
    return Array.from(tagSet).sort();
  }

  // Get all unique authors
  function getAllAuthors() {
    const authorSet = new Set();
    documents.forEach(doc => {
      if (doc.author) {
        // Handle both string and array authors
        if (Array.isArray(doc.author)) {
          doc.author.forEach(a => authorSet.add(a));
        } else if (doc.author.trim()) {
          authorSet.add(doc.author);
        }
      }
    });
    return Array.from(authorSet).sort();
  }

  // Get all unique platforms
  function getAllPlatforms() {
    const platformSet = new Set();
    documents.forEach(doc => {
      if (doc.platform) {
        platformSet.add(doc.platform);
      }
    });
    return Array.from(platformSet).sort();
  }

  // Render filter dropdown options
  function renderFilterOptions() {
    const authors = getAllAuthors();
    const platforms = getAllPlatforms();

    authorFilter.innerHTML = '<option value="" disabled selected>Author</option>' +
      authors.map(author => `<option value="${author}">${author}</option>`).join('');

    platformFilter.innerHTML = '<option value="" disabled selected>Type</option>' +
      platforms.map(platform => `<option value="${platform}">${formatPlatform(platform)}</option>`).join('');
  }

  // Render tag filter buttons
  function renderTags() {
    const tags = getAllTags();
    tagsContainer.innerHTML = tags.map(tag =>
      `<button class="tag-filter" data-tag="${tag}">${tag}</button>`
    ).join('');

    tagsContainer.querySelectorAll('.tag-filter').forEach(btn => {
      btn.addEventListener('click', () => handleTagClick(btn.dataset.tag));
    });
  }

  // Handle tag filter click
  function handleTagClick(tag) {
    if (activeTag === tag) {
      activeTag = null;
    } else {
      activeTag = tag;
    }
    updateTagButtons();
    renderDocuments();
    updateClearButton();
  }

  // Update tag button states
  function updateTagButtons() {
    tagsContainer.querySelectorAll('.tag-filter').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tag === activeTag);
    });
  }

  // Update clear button visibility
  function updateClearButton() {
    const hasFilters = activeTag || activeAuthor || activePlatform || searchInput.value.trim();
    clearFiltersBtn.classList.toggle('hidden', !hasFilters);
  }

  // Filter documents based on search, tag, author, and platform
  function getFilteredDocuments() {
    const query = searchInput.value.toLowerCase().trim();

    return documents.filter(doc => {
      // Tag filter
      if (activeTag && !doc.tags.includes(activeTag)) {
        return false;
      }

      // Author filter
      if (activeAuthor) {
        if (Array.isArray(doc.author)) {
          if (!doc.author.includes(activeAuthor)) return false;
        } else if (doc.author !== activeAuthor) {
          return false;
        }
      }

      // Platform filter
      if (activePlatform && doc.platform !== activePlatform) {
        return false;
      }

      // Search filter
      if (query) {
        const matchesTitle = doc.title.toLowerCase().includes(query);
        const matchesDescription = doc.description.toLowerCase().includes(query);
        const matchesTags = doc.tags.some(tag => tag.toLowerCase().includes(query));
        const authorStr = Array.isArray(doc.author) ? doc.author.join(' ') : (doc.author || '');
        const matchesAuthor = authorStr.toLowerCase().includes(query);
        if (!matchesTitle && !matchesDescription && !matchesTags && !matchesAuthor) {
          return false;
        }
      }

      return true;
    });
  }

  // Sort documents by order field (docs without order go first, then by order)
  function sortDocuments(docs) {
    return [...docs].sort((a, b) => {
      const orderA = a.order ?? -Infinity;
      const orderB = b.order ?? -Infinity;
      return orderB - orderA;
    });
  }

  // Format platform name for display
  function formatPlatform(platform) {
    const names = {
      'google-docs': 'Google Docs',
      'google-slides': 'Google Slides',
      'notion': 'Notion',
      'airtable': 'Airtable',
      'lesswrong': 'LessWrong',
      'other': 'Other'
    };
    return names[platform] || platform;
  }

  // Google Docs icon SVG
  function getGoogleDocsIcon() {
    return `<svg class="platform-icon" width="18" height="22" viewBox="0 0 16 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M10 0H2C0.9 0 0 0.9 0 2V18C0 19.1 0.9 20 2 20H14C15.1 20 16 19.1 16 18V6L10 0Z" fill="#4285F4"/>
      <path d="M10 0V6H16L10 0Z" fill="#A1C2FA"/>
      <rect x="3" y="9" width="10" height="1.5" rx="0.75" fill="white"/>
      <rect x="3" y="12" width="10" height="1.5" rx="0.75" fill="white"/>
      <rect x="3" y="15" width="6" height="1.5" rx="0.75" fill="white"/>
    </svg>`;
  }

  // Google Slides icon SVG
  function getGoogleSlidesIcon() {
    return `<svg class="platform-icon" width="18" height="22" viewBox="0 0 16 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M10 0H2C0.9 0 0 0.9 0 2V18C0 19.1 0.9 20 2 20H14C15.1 20 16 19.1 16 18V6L10 0Z" fill="#FBBC04"/>
      <path d="M10 0V6H16L10 0Z" fill="#FDE293"/>
      <rect x="3" y="8" width="10" height="8" rx="1" fill="white"/>
      <rect x="4.5" y="10" width="7" height="4" rx="0.5" fill="#FBBC04"/>
    </svg>`;
  }

  // Notion icon SVG
  function getNotionIcon() {
    return `<svg class="platform-icon" width="18" height="18" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6.017 4.313l55.333 -4.087c6.797 -0.583 8.543 -0.19 12.817 2.917l17.663 12.443c2.913 2.14 3.883 2.723 3.883 5.053v68.243c0 4.277 -1.553 6.807 -6.99 7.193L24.467 99.967c-4.08 0.193 -6.023 -0.39 -8.16 -3.113L3.3 79.94c-2.333 -3.113 -3.3 -5.443 -3.3 -8.167V11.113c0 -3.497 1.553 -6.413 6.017 -6.8z" fill="#fff"/>
      <path fill-rule="evenodd" clip-rule="evenodd" d="M61.35 0.227l-55.333 4.087C1.553 4.7 0 7.617 0 11.113v60.66c0 2.723 0.967 5.053 3.3 8.167l13.007 16.913c2.137 2.723 4.08 3.307 8.16 3.113l64.257 -3.89c5.433 -0.387 6.99 -2.917 6.99 -7.193V20.64c0 -2.21 -0.873 -2.847 -3.443 -4.733L74.167 3.143c-4.273 -3.107 -6.02 -3.5 -12.817 -2.917zM25.92 19.523c-5.247 0.353 -6.437 0.433 -9.417 -1.99L8.927 11.507c-0.77 -0.78 -0.383 -1.753 1.557 -1.947l53.193 -3.887c4.467 -0.39 6.793 1.167 8.54 2.527l9.123 6.61c0.39 0.197 1.36 1.36 0.193 1.36l-54.933 3.307 -0.68 0.047zM19.803 88.3V30.367c0 -2.53 0.777 -3.697 3.103 -3.893L86 22.78c2.14 -0.193 3.107 1.167 3.107 3.693v57.547c0 2.53 -0.39 4.67 -3.883 4.863l-60.377 3.5c-3.493 0.193 -5.043 -0.97 -5.043 -4.083zm59.6 -54.827c0.387 1.75 0 3.5 -1.75 3.7l-2.91 0.577v42.773c-2.527 1.36 -4.853 2.137 -6.797 2.137 -3.107 0 -3.883 -0.973 -6.21 -3.887l-19.03 -29.94v28.967l6.02 1.363s0 3.5 -4.857 3.5l-13.39 0.777c-0.39 -0.78 0 -2.723 1.357 -3.11l3.497 -0.97v-38.3L30.48 40.667c-0.39 -1.75 0.58 -4.277 3.3 -4.473l14.367 -0.967 19.8 30.327v-26.83l-5.047 -0.58c-0.39 -2.143 1.163 -3.7 3.103 -3.89l13.4 -0.78z" fill="#37352F"/>
    </svg>`;
  }

  // Airtable icon SVG
  function getAirtableIcon() {
    return `<svg class="platform-icon" width="20" height="18" viewBox="0 0 200 170" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M90.039 12.368L24.079 35.088c-4.88 1.682-4.895 8.554-.022 10.253l66.276 23.003c5.456 1.893 11.41 1.893 16.866 0l65.953-23.003c4.873-1.7 4.857-8.571-.022-10.253L107.19 12.368c-5.285-1.818-11.033-1.818-17.152 0z" fill="#FCB400"/>
      <path d="M107.313 93.314v59.686c0 4.097 4.091 6.973 8.019 5.641l57.862-19.569c2.227-.754 3.72-2.833 3.72-5.186V74.2c0-4.097-4.091-6.973-8.019-5.641l-57.862 19.569c-2.227.754-3.72 2.833-3.72 5.186z" fill="#18BFFF"/>
      <path d="M85.313 95.314v57.686c0 4.097-3.759 7.044-7.687 6.031L11.763 141.56c-2.477-.638-4.204-2.879-4.204-5.458V78.2c0-4.097 3.759-7.044 7.687-6.031l65.863 17.471c2.477.638 4.204 2.879 4.204 5.458z" fill="#F82B60"/>
    </svg>`;
  }

  // LessWrong icon SVG (compass-rose mark)
  function getLessWrongIcon() {
    return `<svg class="platform-icon" width="18" height="18" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M 50 50 L 40.82 27.83 L 50 2 Z M 50 50 L 59.18 27.83 L 73.33 26.67 Z M 50 50 L 72.17 40.82 L 98 50 Z M 50 50 L 72.17 59.18 L 73.33 73.33 Z M 50 50 L 59.18 72.17 L 50 98 Z M 50 50 L 40.82 72.17 L 26.67 73.33 Z M 50 50 L 27.83 59.18 L 2 50 Z M 50 50 L 27.83 40.82 L 26.67 26.67 Z" fill="#fff"/>
      <path d="M 50 50 L 50 2 L 59.18 27.83 Z M 50 50 L 73.33 26.67 L 72.17 40.82 Z M 50 50 L 98 50 L 72.17 59.18 Z M 50 50 L 73.33 73.33 L 59.18 72.17 Z M 50 50 L 50 98 L 40.82 72.17 Z M 50 50 L 26.67 73.33 L 27.83 59.18 Z M 50 50 L 2 50 L 27.83 40.82 Z M 50 50 L 26.67 26.67 L 40.82 27.83 Z" fill="#13161a"/>
    </svg>`;
  }

  // Get icon for platform
  function getPlatformIcon(platform) {
    switch (platform) {
      case 'google-docs': return getGoogleDocsIcon();
      case 'google-slides': return getGoogleSlidesIcon();
      case 'notion': return getNotionIcon();
      case 'airtable': return getAirtableIcon();
      case 'lesswrong': return getLessWrongIcon();
      default: return '';
    }
  }

  // Format author for display
  // Note: This formatAuthor duplicates lib/utils.js intentionally.
  // The frontend runs in browser without Node.js, so cannot import lib/.
  // Keep implementations in sync if behavior changes.
  function formatAuthor(author) {
    if (!author) return '';
    if (Array.isArray(author)) {
      return author.join(', ');
    }
    return author;
  }

  // Render document cards
  function renderDocuments() {
    const filtered = getFilteredDocuments();
    const sorted = sortDocuments(filtered);

    if (sorted.length === 0) {
      documentsList.innerHTML = '';
      noResults.classList.add('visible');
      return;
    }

    noResults.classList.remove('visible');

    documentsList.innerHTML = sorted.map(doc => {
      const icon = getPlatformIcon(doc.platform);
      const hasPill = icon !== '';

      let titleContent;
      if (hasPill) {
        titleContent = `<a href="${doc.url}" target="_blank" rel="noopener noreferrer" class="platform-pill ${doc.platform}-pill">${icon}<span>${doc.title}</span></a>`;
      } else {
        titleContent = `<a href="${doc.url}" target="_blank" rel="noopener noreferrer">${doc.title}</a>`;
      }

      return `
      <article class="document-card">
        <div class="document-header">
          <h2 class="document-title">
            ${titleContent}
          </h2>
          ${!hasPill ? `<span class="platform-badge">${formatPlatform(doc.platform)}</span>` : ''}
        </div>
        <p class="document-author">${formatAuthor(doc.author)}</p>
        <p class="document-description">${doc.description || ''}</p>
        <div class="document-tags">
          ${doc.tags.map(tag => `<span class="tag" data-tag="${tag}">${tag}</span>`).join('')}
        </div>
      </article>
    `}).join('');

    // Add click handlers to inline tags
    documentsList.querySelectorAll('.tag').forEach(tagEl => {
      tagEl.addEventListener('click', () => handleTagClick(tagEl.dataset.tag));
    });
  }

  // Search input handler with debounce
  let debounceTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      renderDocuments();
      updateClearButton();
    }, 150);
  });

  // Filter handlers
  authorFilter.addEventListener('change', () => {
    activeAuthor = authorFilter.value || null;
    authorFilter.classList.toggle('has-value', !!activeAuthor);
    renderDocuments();
    updateClearButton();
  });

  platformFilter.addEventListener('change', () => {
    activePlatform = platformFilter.value || null;
    platformFilter.classList.toggle('has-value', !!activePlatform);
    renderDocuments();
    updateClearButton();
  });

  // Clear all filters
  clearFiltersBtn.addEventListener('click', () => {
    activeTag = null;
    activeAuthor = null;
    activePlatform = null;
    searchInput.value = '';
    authorFilter.value = '';
    platformFilter.value = '';
    authorFilter.classList.remove('has-value');
    platformFilter.classList.remove('has-value');
    updateTagButtons();
    renderDocuments();
    updateClearButton();
  });

  // Initialize on load
  init();
  updateClearButton();

  // Modal functionality
  const subscribeBtn = document.getElementById('subscribe-btn');
  const modalOverlay = document.getElementById('modal-overlay');
  const modalClose = document.getElementById('modal-close');
  const subscribeForm = document.getElementById('subscribe-form');

  subscribeBtn.addEventListener('click', () => {
    modalOverlay.classList.add('visible');
  });

  modalClose.addEventListener('click', () => {
    modalOverlay.classList.remove('visible');
  });

  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) {
      modalOverlay.classList.remove('visible');
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      modalOverlay.classList.remove('visible');
    }
  });

  subscribeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const email = form.email.value;
    const frequency = form.frequency.value;
    const button = form.querySelector('button');
    const originalText = button.textContent;
    const supabaseUrl = form.dataset.supabaseUrl;

    button.textContent = 'Subscribing...';
    button.disabled = true;

    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, frequency })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        if (data.requiresVerification) {
          button.textContent = 'Check your email!';
          form.email.value = '';
          setTimeout(() => {
            modalOverlay.classList.remove('visible');
            button.textContent = originalText;
            button.disabled = false;
          }, 2500);
        } else {
          button.textContent = data.message || 'Subscribed!';
          form.email.value = '';
          setTimeout(() => {
            modalOverlay.classList.remove('visible');
            button.textContent = originalText;
            button.disabled = false;
          }, 1500);
        }
      } else {
        throw new Error(data.error || 'Subscription failed');
      }
    } catch (error) {
      button.textContent = 'Error - try again';
      button.disabled = false;
      setTimeout(() => {
        button.textContent = originalText;
      }, 2000);
    }
  });
})();
