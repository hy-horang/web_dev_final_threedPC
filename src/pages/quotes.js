// 견적서 목록 페이지 (공개 견적서)
import { quoteAPI } from '../api.js';
import { formatPrice, formatNumber, formatDate } from '../utils.js';
import { showError } from '../utils.js';

let currentPage = 1;
let currentSort = 'createdAt';
let currentOrder = 'desc';

export async function render() {
  return `
    <div class="page-container">
      <div class="page-header">
        <h1>견적서 커뮤니티</h1>
        <p>다른 사용자들의 견적서를 둘러보세요</p>
      </div>

      <div class="quotes-page">
        <div class="quotes-controls">
          <select id="sortSelect" class="filter-select">
            <option value="createdAt-desc">최신순</option>
            <option value="createdAt-asc">오래된순</option>
            <option value="viewCount-desc">조회수 높은순</option>
            <option value="totalPrice-asc">가격 낮은순</option>
            <option value="totalPrice-desc">가격 높은순</option>
            <option value="likes-desc">인기순</option>
          </select>
        </div>

        <div id="quotesContainer" class="quote-grid">
          <div class="loading-spinner">로딩 중...</div>
        </div>

        <div id="paginationContainer" class="pagination"></div>
      </div>
    </div>
  `;
}

export async function init() {
  // 정렬 선택 이벤트
  const sortSelect = document.getElementById('sortSelect');
  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      const [sortBy, order] = sortSelect.value.split('-');
      currentSort = sortBy;
      currentOrder = order;
      currentPage = 1;
      loadQuotes();
    });
  }

  await loadQuotes();
}

async function loadQuotes() {
  const container = document.getElementById('quotesContainer');
  if (!container) return;

  container.innerHTML = '<div class="loading-spinner">로딩 중...</div>';

  try {
    const data = await quoteAPI.getList({
      page: currentPage,
      limit: 20,
      sortBy: currentSort,
      order: currentOrder
    });

    if (data.quotes && data.quotes.length > 0) {
      container.innerHTML = data.quotes.map(quote => `
        <div class="quote-card" onclick="window.navigate('/quotes/${quote.id}')">
          <h3>${quote.title}</h3>
          ${quote.description ? `<p class="quote-description">${quote.description.substring(0, 150)}${quote.description.length > 150 ? '...' : ''}</p>` : ''}
          <div class="quote-meta">
            <span class="quote-price">${formatPrice(quote.totalPrice)}</span>
            <div class="quote-stats">
              <span>👁 ${formatNumber(quote.viewCount || 0)}</span>
              <span>❤️ ${formatNumber(quote._count?.likes || 0)}</span>
              <span>💬 ${formatNumber(quote._count?.comments || 0)}</span>
              <span>📦 ${formatNumber(quote._count?.items || 0)}</span>
            </div>
          </div>
          <div class="quote-footer">
            <span class="quote-author">${quote.user?.nickname || '익명'}</span>
            <span class="quote-date">${formatDate(quote.createdAt)}</span>
          </div>
        </div>
      `).join('');

      // 페이지네이션
      renderPagination(data.pagination);
    } else {
      container.innerHTML = '<p class="empty-message">견적서가 없습니다.</p>';
    }
  } catch (error) {
    console.error('Failed to load quotes:', error);
    container.innerHTML = '<p class="error-message">견적서를 불러오는데 실패했습니다.</p>';
    showError('견적서를 불러오는데 실패했습니다.');
  }
}

function renderPagination(pagination) {
  const container = document.getElementById('paginationContainer');
  if (!container || !pagination) return;

  if (pagination.totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  let html = '<div class="pagination-controls">';
  
  if (pagination.page > 1) {
    html += `<button class="pagination-btn" onclick="goToQuotePage(${pagination.page - 1})">이전</button>`;
  }

  const startPage = Math.max(1, pagination.page - 2);
  const endPage = Math.min(pagination.totalPages, pagination.page + 2);

  if (startPage > 1) {
    html += `<button class="pagination-btn" onclick="goToQuotePage(1)">1</button>`;
    if (startPage > 2) html += '<span class="pagination-ellipsis">...</span>';
  }

  for (let i = startPage; i <= endPage; i++) {
    html += `<button class="pagination-btn ${i === pagination.page ? 'active' : ''}" onclick="goToQuotePage(${i})">${i}</button>`;
  }

  if (endPage < pagination.totalPages) {
    if (endPage < pagination.totalPages - 1) html += '<span class="pagination-ellipsis">...</span>';
    html += `<button class="pagination-btn" onclick="goToQuotePage(${pagination.totalPages})">${pagination.totalPages}</button>`;
  }

  if (pagination.page < pagination.totalPages) {
    html += `<button class="pagination-btn" onclick="goToQuotePage(${pagination.page + 1})">다음</button>`;
  }

  html += '</div>';
  container.innerHTML = html;
}

window.goToQuotePage = function(page) {
  currentPage = page;
  loadQuotes();
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

