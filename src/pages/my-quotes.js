// 내 견적서 목록 페이지
import { quoteAPI } from '../api.js';
import { formatPrice, formatNumber, formatDate } from '../utils.js';
import { showError } from '../utils.js';
import { tokenManager } from '../api.js';

let currentPage = 1;

export async function render() {
  if (!tokenManager.isAuthenticated()) {
    return `
      <div class="page-container">
        <div class="error-page">
          <h1>로그인이 필요합니다</h1>
          <p>내 견적서를 보려면 로그인해주세요.</p>
          <a href="/login" class="btn btn-primary">로그인하기</a>
        </div>
      </div>
    `;
  }

  return `
    <div class="page-container">
      <div class="page-header">
        <h1>내 견적서</h1>
        <a href="/create-quote" class="btn btn-primary">새 견적서 만들기</a>
      </div>

      <div id="quotesContainer" class="quote-grid">
        <div class="loading-spinner">로딩 중...</div>
      </div>

      <div id="paginationContainer" class="pagination"></div>
    </div>
  `;
}

export async function init() {
  if (!tokenManager.isAuthenticated()) {
    return;
  }

  await loadMyQuotes();
}

async function loadMyQuotes() {
  const container = document.getElementById('quotesContainer');
  if (!container) return;

  container.innerHTML = '<div class="loading-spinner">로딩 중...</div>';

  try {
    const data = await quoteAPI.getMyQuotes({
      page: currentPage,
      limit: 20
    });

    if (data.quotes && data.quotes.length > 0) {
      container.innerHTML = data.quotes.map(quote => `
        <div class="quote-card">
          <div class="quote-card-header">
            <h3 onclick="window.navigate('/quotes/${quote.id}')">${quote.title}</h3>
            <div class="quote-actions">
              <button class="btn-icon" onclick="editQuote(${quote.id})" title="수정">✏️</button>
              <button class="btn-icon" onclick="deleteQuote(${quote.id})" title="삭제">🗑️</button>
            </div>
          </div>
          ${quote.description ? `<p class="quote-description">${quote.description.substring(0, 100)}${quote.description.length > 100 ? '...' : ''}</p>` : ''}
          <div class="quote-meta">
            <span class="quote-price">${formatPrice(quote.totalPrice)}</span>
            <div class="quote-stats">
              <span>📦 ${formatNumber(quote._count?.items || 0)}개 부품</span>
              <span>💬 ${formatNumber(quote._count?.comments || 0)}</span>
              <span>❤️ ${formatNumber(quote._count?.likes || 0)}</span>
            </div>
          </div>
          <div class="quote-footer">
            <span class="quote-date">${formatDate(quote.createdAt)}</span>
            ${quote.isPublic ? '<span class="badge badge-public">공개</span>' : '<span class="badge badge-private">비공개</span>'}
          </div>
        </div>
      `).join('');

      renderPagination(data.pagination);
    } else {
      container.innerHTML = `
        <div class="empty-state">
          <p>아직 만든 견적서가 없습니다.</p>
          <a href="/create-quote" class="btn btn-primary">첫 견적서 만들기</a>
        </div>
      `;
    }
  } catch (error) {
    console.error('Failed to load my quotes:', error);
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
    html += `<button class="pagination-btn" onclick="goToMyQuotePage(${pagination.page - 1})">이전</button>`;
  }

  const startPage = Math.max(1, pagination.page - 2);
  const endPage = Math.min(pagination.totalPages, pagination.page + 2);

  for (let i = startPage; i <= endPage; i++) {
    html += `<button class="pagination-btn ${i === pagination.page ? 'active' : ''}" onclick="goToMyQuotePage(${i})">${i}</button>`;
  }

  if (pagination.page < pagination.totalPages) {
    html += `<button class="pagination-btn" onclick="goToMyQuotePage(${pagination.page + 1})">다음</button>`;
  }

  html += '</div>';
  container.innerHTML = html;
}

window.goToMyQuotePage = function(page) {
  currentPage = page;
  loadMyQuotes();
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.editQuote = function(quoteId) {
  window.navigate(`/quotes/${quoteId}`);
};

window.deleteQuote = async function(quoteId) {
  if (!confirm('이 견적서를 삭제하시겠습니까?')) return;

  try {
    await quoteAPI.delete(quoteId);
    showSuccess('견적서가 삭제되었습니다.');
    await loadMyQuotes();
  } catch (error) {
    showError(error.message || '견적서 삭제에 실패했습니다.');
  }
};

