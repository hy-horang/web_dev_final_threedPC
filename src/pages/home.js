// 홈 페이지
import { productAPI, quoteAPI } from '../api.js';
import { formatPrice, formatNumber } from '../utils.js';

export async function render() {
  return `
    <div class="page-container">
      <div class="hero-section">
        <h1>3D PC 견적 시스템</h1>
        <p>나만의 PC를 구성하고 견적을 받아보세요</p>
        <div class="hero-actions">
          <a href="/create-quote" class="btn btn-primary btn-large">견적서 만들기</a>
          <a href="/products" class="btn btn-secondary btn-large">상품 둘러보기</a>
        </div>
      </div>

      <div class="home-sections">
        <section class="home-section">
          <h2>인기 상품</h2>
          <div id="popularProducts" class="product-grid">
            <div class="loading-spinner">로딩 중...</div>
          </div>
        </section>

        <section class="home-section">
          <h2>인기 견적서</h2>
          <div id="popularQuotes" class="quote-grid">
            <div class="loading-spinner">로딩 중...</div>
          </div>
        </section>
      </div>
    </div>
  `;
}

export async function init() {
  // 인기 상품 로드
  loadPopularProducts();
  
  // 인기 견적서 로드
  loadPopularQuotes();
}

async function loadPopularProducts() {
  const container = document.getElementById('popularProducts');
  if (!container) return;

  try {
    const data = await productAPI.getList({
      page: 1,
      limit: 8,
      sortBy: 'viewCount',
      order: 'desc'
    });

    if (data.products && data.products.length > 0) {
      container.innerHTML = data.products.map(product => `
        <div class="product-card" onclick="window.navigate('/products/${product.id}')">
          ${product.imageUrl ? `<img src="${product.imageUrl}" alt="${product.name}" />` : '<div class="product-placeholder">이미지 없음</div>'}
          <div class="product-info">
            <h3>${product.name}</h3>
            <p class="product-manufacturer">${product.manufacturer}</p>
            <p class="product-price">${formatPrice(product.price)}</p>
            <div class="product-meta">
              <span>조회수: ${formatNumber(product.viewCount)}</span>
            </div>
          </div>
        </div>
      `).join('');
    } else {
      container.innerHTML = '<p class="empty-message">상품이 없습니다.</p>';
    }
  } catch (error) {
    console.error('Failed to load popular products:', error);
    container.innerHTML = '<p class="error-message">상품을 불러오는데 실패했습니다.</p>';
  }
}

async function loadPopularQuotes() {
  const container = document.getElementById('popularQuotes');
  if (!container) return;

  try {
    const data = await quoteAPI.getList({
      page: 1,
      limit: 6,
      sortBy: 'likes',
      order: 'desc'
    });

    if (data.quotes && data.quotes.length > 0) {
      container.innerHTML = data.quotes.map(quote => `
        <div class="quote-card" onclick="window.navigate('/quotes/${quote.id}')">
          <h3>${quote.title}</h3>
          <p class="quote-description">${quote.description ? quote.description.substring(0, 100) + '...' : ''}</p>
          <div class="quote-meta">
            <span class="quote-price">${formatPrice(quote.totalPrice)}</span>
            <div class="quote-stats">
              <span>👁 ${formatNumber(quote.viewCount)}</span>
              <span>❤️ ${formatNumber(quote._count?.likes || 0)}</span>
              <span>💬 ${formatNumber(quote._count?.comments || 0)}</span>
            </div>
          </div>
          <div class="quote-author">
            <span>작성자: ${quote.user?.nickname || '익명'}</span>
          </div>
        </div>
      `).join('');
    } else {
      container.innerHTML = '<p class="empty-message">견적서가 없습니다.</p>';
    }
  } catch (error) {
    console.error('Failed to load popular quotes:', error);
    container.innerHTML = '<p class="error-message">견적서를 불러오는데 실패했습니다.</p>';
  }
}

