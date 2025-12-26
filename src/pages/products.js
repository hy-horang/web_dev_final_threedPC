// 상품 목록 페이지
import { productAPI, categoryAPI } from '../api.js';
import { formatPrice, formatNumber, debounce, flattenCategories } from '../utils.js';
import { showError } from '../utils.js';

let currentPage = 1;
let currentFilters = {
  search: '',
  categoryId: '',
  sortBy: 'createdAt',
  order: 'desc'
};
let categories = [];

export async function render() {
  return `
    <div class="page-container">
      <div class="page-header">
        <h1>상품 목록</h1>
      </div>

      <div class="products-page">
        <aside class="products-sidebar">
          <div class="filter-section">
            <h3>검색</h3>
            <input 
              type="text" 
              id="searchInput" 
              placeholder="상품명 또는 제조사 검색..." 
              class="filter-input"
            />
          </div>

          <div class="filter-section">
            <h3>카테고리</h3>
            <select id="categorySelect" class="filter-select">
              <option value="">전체</option>
            </select>
          </div>

          <div class="filter-section">
            <h3>정렬</h3>
            <select id="sortSelect" class="filter-select">
              <option value="createdAt-desc">최신순</option>
              <option value="createdAt-asc">오래된순</option>
              <option value="price-asc">가격 낮은순</option>
              <option value="price-desc">가격 높은순</option>
              <option value="viewCount-desc">인기순</option>
              <option value="name-asc">이름순</option>
            </select>
          </div>
        </aside>

        <main class="products-main">
          <div id="productsContainer" class="product-grid">
            <div class="loading-spinner">로딩 중...</div>
          </div>

          <div id="paginationContainer" class="pagination"></div>
        </main>
      </div>
    </div>
  `;
}

export async function init() {
  // 카테고리 로드
  await loadCategories();

  // 필터 이벤트 리스너
  setupFilters();

  // 상품 로드
  await loadProducts();
}

async function loadCategories() {
  try {
    const data = await categoryAPI.getList();
    categories = flattenCategories(data.categories || []);
    
    const categorySelect = document.getElementById('categorySelect');
    if (categorySelect) {
      categories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat.id;
        option.textContent = '  '.repeat(cat.level || 0) + cat.name;
        categorySelect.appendChild(option);
      });
    }
  } catch (error) {
    console.error('Failed to load categories:', error);
  }
}

function setupFilters() {
  // 검색 입력
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    const debouncedSearch = debounce(() => {
      currentFilters.search = searchInput.value;
      currentPage = 1;
      loadProducts();
    }, 500);
    
    searchInput.addEventListener('input', debouncedSearch);
    
    // URL 파라미터에서 검색어 복원
    const params = new URLSearchParams(window.location.search);
    if (params.get('search')) {
      searchInput.value = params.get('search');
      currentFilters.search = params.get('search');
    }
  }

  // 카테고리 선택
  const categorySelect = document.getElementById('categorySelect');
  if (categorySelect) {
    categorySelect.addEventListener('change', () => {
      currentFilters.categoryId = categorySelect.value;
      currentPage = 1;
      loadProducts();
    });
    
    // URL 파라미터에서 카테고리 복원
    const params = new URLSearchParams(window.location.search);
    if (params.get('categoryId')) {
      categorySelect.value = params.get('categoryId');
      currentFilters.categoryId = params.get('categoryId');
    }
  }

  // 정렬 선택
  const sortSelect = document.getElementById('sortSelect');
  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      const [sortBy, order] = sortSelect.value.split('-');
      currentFilters.sortBy = sortBy;
      currentFilters.order = order;
      currentPage = 1;
      loadProducts();
    });
    
    // URL 파라미터에서 정렬 복원
    const params = new URLSearchParams(window.location.search);
    if (params.get('sortBy')) {
      const sortBy = params.get('sortBy');
      const order = params.get('order') || 'desc';
      sortSelect.value = `${sortBy}-${order}`;
      currentFilters.sortBy = sortBy;
      currentFilters.order = order;
    }
  }
}

async function loadProducts() {
  const container = document.getElementById('productsContainer');
  if (!container) return;

  container.innerHTML = '<div class="loading-spinner">로딩 중...</div>';

  try {
    const params = {
      page: currentPage,
      limit: 20,
      ...currentFilters
    };

    // 빈 문자열 제거
    Object.keys(params).forEach(key => {
      if (params[key] === '') delete params[key];
    });

    const data = await productAPI.getList(params);

    if (data.products && data.products.length > 0) {
      container.innerHTML = data.products.map(product => `
        <div class="product-card" onclick="window.navigate('/products/${product.id}')">
          ${product.imageUrl ? 
            `<img src="${product.imageUrl}" alt="${product.name}" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';" />
             <div class="product-placeholder" style="display:none;">이미지 없음</div>` :
            '<div class="product-placeholder">이미지 없음</div>'
          }
          <div class="product-info">
            <h3>${product.name}</h3>
            <p class="product-manufacturer">${product.manufacturer}</p>
            <p class="product-price">${formatPrice(product.price)}</p>
            <div class="product-meta">
              <span>조회수: ${formatNumber(product.viewCount)}</span>
              ${product.category ? `<span>${product.category.name}</span>` : ''}
            </div>
          </div>
        </div>
      `).join('');

      // 페이지네이션
      renderPagination(data.pagination);
    } else {
      container.innerHTML = '<p class="empty-message">상품이 없습니다.</p>';
    }
  } catch (error) {
    console.error('Failed to load products:', error);
    container.innerHTML = '<p class="error-message">상품을 불러오는데 실패했습니다.</p>';
    showError('상품을 불러오는데 실패했습니다.');
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
  
  // 이전 페이지
  if (pagination.page > 1) {
    html += `<button class="pagination-btn" onclick="goToPage(${pagination.page - 1})">이전</button>`;
  }

  // 페이지 번호
  const startPage = Math.max(1, pagination.page - 2);
  const endPage = Math.min(pagination.totalPages, pagination.page + 2);

  if (startPage > 1) {
    html += `<button class="pagination-btn" onclick="goToPage(1)">1</button>`;
    if (startPage > 2) html += '<span class="pagination-ellipsis">...</span>';
  }

  for (let i = startPage; i <= endPage; i++) {
    html += `<button class="pagination-btn ${i === pagination.page ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
  }

  if (endPage < pagination.totalPages) {
    if (endPage < pagination.totalPages - 1) html += '<span class="pagination-ellipsis">...</span>';
    html += `<button class="pagination-btn" onclick="goToPage(${pagination.totalPages})">${pagination.totalPages}</button>`;
  }

  // 다음 페이지
  if (pagination.page < pagination.totalPages) {
    html += `<button class="pagination-btn" onclick="goToPage(${pagination.page + 1})">다음</button>`;
  }

  html += '</div>';
  container.innerHTML = html;
}

// 전역 함수로 노출
window.goToPage = function(page) {
  currentPage = page;
  loadProducts();
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

