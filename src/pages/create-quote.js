// 견적서 생성 페이지
import { quoteAPI, productAPI, categoryAPI } from '../api.js';
import { formatPrice, showError, showSuccess, flattenCategories } from '../utils.js';
import { tokenManager } from '../api.js';

let selectedProducts = [];
let categories = [];

export async function render() {
  if (!tokenManager.isAuthenticated()) {
    return `
      <div class="page-container">
        <div class="error-page">
          <h1>로그인이 필요합니다</h1>
          <p>견적서를 만들려면 로그인해주세요.</p>
          <a href="/login" class="btn btn-primary">로그인하기</a>
        </div>
      </div>
    `;
  }

  return `
    <div class="page-container">
      <div class="page-header">
        <h1>새 견적서 만들기</h1>
      </div>

      <div class="create-quote-page">
        <div class="quote-form-section">
          <div class="form-group">
            <label>견적서 제목 *</label>
            <input type="text" id="quoteTitle" placeholder="예: 게이밍 PC 견적" required />
          </div>

          <div class="form-group">
            <label>설명</label>
            <textarea id="quoteDescription" placeholder="견적서에 대한 설명을 입력하세요..." rows="4"></textarea>
          </div>

          <div class="form-group">
            <label>공개 설정</label>
            <label class="checkbox-label">
              <input type="checkbox" id="quoteIsPublic" />
              <span>커뮤니티에 공개하기</span>
            </label>
          </div>
        </div>

        <div class="quote-items-section">
          <div class="section-header">
            <h2>부품 추가</h2>
            <button class="btn btn-secondary" id="addProductBtn">상품 검색</button>
          </div>

          <div id="selectedProductsList" class="selected-products">
            <p class="empty-message">추가된 부품이 없습니다. 상품 검색 버튼을 클릭하여 부품을 추가하세요.</p>
          </div>

          <div class="quote-summary">
            <div class="summary-row">
              <span>총 가격:</span>
              <span id="totalPrice" class="total-price">0원</span>
            </div>
          </div>
        </div>

        <div class="quote-actions">
          <button class="btn btn-secondary" onclick="window.navigate('/my-quotes')">취소</button>
          <button class="btn btn-primary" id="saveQuoteBtn">견적서 저장</button>
        </div>
      </div>
    </div>

    <!-- 상품 검색 모달 -->
    <div class="modal-overlay" id="productSearchModal" style="display: none;">
      <div class="modal-content large">
        <div class="modal-header">
          <h2>상품 검색</h2>
          <button class="modal-close" onclick="closeProductSearch()">×</button>
        </div>
        <div class="modal-body">
          <div class="search-controls">
            <input type="text" id="productSearchInput" placeholder="상품명 또는 제조사 검색..." />
            <select id="productCategorySelect">
              <option value="">전체 카테고리</option>
            </select>
          </div>
          <div id="productSearchResults" class="product-search-results">
            <div class="loading-spinner">검색어를 입력하세요...</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

export async function init() {
  if (!tokenManager.isAuthenticated()) {
    return;
  }

  // 카테고리 로드
  await loadCategories();

  // 이벤트 리스너 설정
  setupEventListeners();

  // 선택된 상품 목록 업데이트
  updateSelectedProductsList();
}

async function loadCategories() {
  try {
    const data = await categoryAPI.getList();
    categories = flattenCategories(data.categories || []);
    
    const categorySelect = document.getElementById('productCategorySelect');
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

function setupEventListeners() {
  // 상품 검색 버튼
  const addProductBtn = document.getElementById('addProductBtn');
  if (addProductBtn) {
    addProductBtn.addEventListener('click', () => {
      document.getElementById('productSearchModal').style.display = 'flex';
      document.getElementById('productSearchInput').focus();
    });
  }

  // 상품 검색
  const searchInput = document.getElementById('productSearchInput');
  if (searchInput) {
    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        searchProducts(e.target.value);
      }, 500);
    });
  }

  // 카테고리 필터
  const categorySelect = document.getElementById('productCategorySelect');
  if (categorySelect) {
    categorySelect.addEventListener('change', () => {
      const searchValue = searchInput?.value || '';
      searchProducts(searchValue);
    });
  }

  // 견적서 저장
  const saveBtn = document.getElementById('saveQuoteBtn');
  if (saveBtn) {
    saveBtn.addEventListener('click', handleSaveQuote);
  }
}

async function searchProducts(query) {
  const container = document.getElementById('productSearchResults');
  if (!container) return;

  container.innerHTML = '<div class="loading-spinner">검색 중...</div>';

  try {
    const params = {
      page: 1,
      limit: 20,
      isActive: true
    };

    if (query) {
      params.search = query;
    }

    const categoryId = document.getElementById('productCategorySelect')?.value;
    if (categoryId) {
      params.categoryId = categoryId;
    }

    const data = await productAPI.getList(params);

    if (data.products && data.products.length > 0) {
      container.innerHTML = data.products.map(product => {
        const isSelected = selectedProducts.some(p => p.id === product.id);
        return `
          <div class="product-search-item ${isSelected ? 'selected' : ''}" data-product-id="${product.id}">
            <div class="product-search-info">
              <h4>${product.name}</h4>
              <p>${product.manufacturer} - ${formatPrice(product.price)}</p>
            </div>
            <button 
              class="btn btn-sm ${isSelected ? 'btn-secondary' : 'btn-primary'}" 
              data-product='${JSON.stringify(product)}'
              onclick="toggleProductFromButton(this)"
              ${isSelected ? 'disabled' : ''}
            >
              ${isSelected ? '추가됨' : '추가'}
            </button>
          </div>
        `;
      }).join('');
    } else {
      container.innerHTML = '<p class="empty-message">검색 결과가 없습니다.</p>';
    }
  } catch (error) {
    console.error('Failed to search products:', error);
    container.innerHTML = '<p class="error-message">상품 검색에 실패했습니다.</p>';
  }
}

window.toggleProductFromButton = function(button) {
  const productData = button.getAttribute('data-product');
  if (!productData) return;
  
  const product = JSON.parse(productData);
  
  const index = selectedProducts.findIndex(p => p.id === product.id);
  if (index === -1) {
    selectedProducts.push({ ...product, quantity: 1 });
  } else {
    selectedProducts.splice(index, 1);
  }

  updateSelectedProductsList();
  searchProducts(document.getElementById('productSearchInput')?.value || '');
};

function updateSelectedProductsList() {
  const container = document.getElementById('selectedProductsList');
  if (!container) return;

  if (selectedProducts.length === 0) {
    container.innerHTML = '<p class="empty-message">추가된 부품이 없습니다. 상품 검색 버튼을 클릭하여 부품을 추가하세요.</p>';
    document.getElementById('totalPrice').textContent = '0원';
    return;
  }

  const total = selectedProducts.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  container.innerHTML = selectedProducts.map((product, index) => `
    <div class="selected-product-item">
      <div class="product-item-info">
        <h4>${product.name}</h4>
        <p>${product.manufacturer}</p>
        <p class="product-item-price">${formatPrice(product.price)} × ${product.quantity} = ${formatPrice(product.price * product.quantity)}</p>
      </div>
      <div class="product-item-controls">
        <button class="btn-icon" onclick="decreaseQuantity(${index})">-</button>
        <span class="quantity-display">${product.quantity}</span>
        <button class="btn-icon" onclick="increaseQuantity(${index})">+</button>
        <button class="btn-icon btn-remove" onclick="removeProduct(${index})">🗑️</button>
      </div>
    </div>
  `).join('');

  document.getElementById('totalPrice').textContent = formatPrice(total);
}

window.increaseQuantity = function(index) {
  selectedProducts[index].quantity++;
  updateSelectedProductsList();
};

window.decreaseQuantity = function(index) {
  if (selectedProducts[index].quantity > 1) {
    selectedProducts[index].quantity--;
    updateSelectedProductsList();
  }
};

window.removeProduct = function(index) {
  selectedProducts.splice(index, 1);
  updateSelectedProductsList();
};

window.closeProductSearch = function() {
  document.getElementById('productSearchModal').style.display = 'none';
};

async function handleSaveQuote() {
  const title = document.getElementById('quoteTitle')?.value.trim();
  if (!title) {
    showError('견적서 제목을 입력해주세요.');
    return;
  }

  if (selectedProducts.length === 0) {
    showError('최소 하나의 부품을 추가해주세요.');
    return;
  }

  const description = document.getElementById('quoteDescription')?.value.trim() || null;
  const isPublic = document.getElementById('quoteIsPublic')?.checked || false;

  try {
    const items = selectedProducts.map(p => ({
      productId: p.id,
      quantity: p.quantity
    }));

    const quote = await quoteAPI.create({
      title,
      description,
      isPublic,
      items
    });

    showSuccess('견적서가 생성되었습니다.');
    window.navigate(`/quotes/${quote.id}`);
  } catch (error) {
    showError(error.message || '견적서 생성에 실패했습니다.');
  }
}

