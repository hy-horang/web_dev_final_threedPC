// 관리자 페이지 - 제품 추가/관리
import { productAPI, categoryAPI, adminAPI } from '../api.js';
import { showError, showSuccess, flattenCategories, formatPrice, formatDateTime } from '../utils.js';
import { tokenManager } from '../api.js';

let categories = [];
let specs = []; // [{ key: '', value: '' }]
let currentTab = 'products'; // 'products', 'categories', 'users'
let products = [];
let users = [];
let editingProductId = null;
let editingCategoryId = null;

export async function render() {
  const user = window.currentUser();
  
  // 관리자 권한 확인
  if (!user || user.role !== 'ADMIN') {
    return `
      <div class="page-container">
        <div class="error-page">
          <h1>접근 권한이 없습니다</h1>
          <p>이 페이지는 관리자만 접근할 수 있습니다.</p>
          <button class="btn btn-primary" onclick="window.navigate('/')">홈으로 돌아가기</button>
        </div>
      </div>
    `;
  }

  return `
    <div class="page-container">
      <div class="page-header">
        <h1>관리자 페이지</h1>
        <p>시스템 관리 및 설정</p>
      </div>

      <div class="admin-page">
        <div class="admin-tabs">
          <button class="admin-tab ${currentTab === 'products' ? 'active' : ''}" data-tab="products">
            제품 관리
          </button>
          <button class="admin-tab ${currentTab === 'categories' ? 'active' : ''}" data-tab="categories">
            카테고리 관리
          </button>
          <button class="admin-tab ${currentTab === 'users' ? 'active' : ''}" data-tab="users">
            사용자 관리
          </button>
        </div>

        <!-- 제품 관리 탭 -->
        <div class="admin-tab-content" id="productsTab" style="display: ${currentTab === 'products' ? 'block' : 'none'}">
          <div class="admin-section">
            <h2>제품 목록</h2>
            <div class="admin-actions">
              <button class="btn btn-primary" id="addProductBtn">새 제품 추가</button>
              <input type="text" id="productSearch" class="form-control" placeholder="제품 검색..." style="max-width: 300px; margin-left: 10px;" />
            </div>
            <div id="productsList" class="admin-list"></div>
          </div>

          <div class="admin-form-section" id="productFormSection" style="display: none;">
            <h2 id="productFormTitle">새 제품 추가</h2>
            
            <form id="productForm" class="product-form">
              <div class="form-group">
                <label for="productCategory">카테고리 *</label>
                <select id="productCategory" class="form-control" required>
                  <option value="">카테고리를 선택하세요</option>
                </select>
              </div>

              <div class="form-group">
                <label for="productName">상품명 *</label>
                <input type="text" id="productName" class="form-control" placeholder="예: Intel Core i9-14900K" required />
              </div>

              <div class="form-group">
                <label for="productManufacturer">제조사 *</label>
                <input type="text" id="productManufacturer" class="form-control" placeholder="예: Intel" required />
              </div>

              <div class="form-group">
                <label for="productPrice">가격 (원) *</label>
                <input type="number" id="productPrice" class="form-control" placeholder="예: 650000" min="0" required />
              </div>

              <div class="form-group">
                <label for="productImageUrl">이미지 URL</label>
                <input type="url" id="productImageUrl" class="form-control" placeholder="https://example.com/image.jpg" />
              </div>

              <div class="form-group">
                <label>
                  <input type="checkbox" id="productIsActive" checked />
                  활성화 (판매 중)
                </label>
              </div>

              <div class="form-group">
                <label>제품 스펙</label>
                <div id="specsContainer" class="specs-container">
                  <div class="spec-item">
                    <input type="text" class="spec-key" placeholder="스펙 이름 (예: Socket)" />
                    <input type="text" class="spec-value" placeholder="스펙 값 (예: LGA1700)" />
                    <button type="button" class="btn btn-danger btn-sm remove-spec">삭제</button>
                  </div>
                </div>
                <button type="button" class="btn btn-secondary btn-sm" id="addSpecBtn">스펙 추가</button>
              </div>

              <div class="form-group">
                <label for="productDetailInfo">상세 정보 (JSON, 선택사항)</label>
                <textarea id="productDetailInfo" class="form-control" rows="4" placeholder='{"description": "상품 설명", "warranty": "3년"}'></textarea>
                <small class="form-text">JSON 형식으로 입력하세요. 비워두면 저장되지 않습니다.</small>
              </div>

              <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="cancelProductForm()">취소</button>
                <button type="button" class="btn btn-secondary" onclick="resetProductForm()">초기화</button>
                <button type="submit" class="btn btn-primary">저장</button>
              </div>
            </form>
          </div>
        </div>

        <!-- 카테고리 관리 탭 -->
        <div class="admin-tab-content" id="categoriesTab" style="display: ${currentTab === 'categories' ? 'block' : 'none'}">
          <div class="admin-section">
            <h2>카테고리 목록</h2>
            <div class="admin-actions">
              <button class="btn btn-primary" id="addCategoryBtn">새 카테고리 추가</button>
            </div>
            <div id="categoriesList" class="admin-list"></div>
          </div>

          <div class="admin-form-section" id="categoryFormSection" style="display: none;">
            <h2 id="categoryFormTitle">새 카테고리 추가</h2>
            
            <form id="categoryForm" class="product-form">
              <div class="form-group">
                <label for="categoryName">카테고리명 *</label>
                <input type="text" id="categoryName" class="form-control" placeholder="예: CPU" required />
              </div>

              <div class="form-group">
                <label for="categoryParent">상위 카테고리</label>
                <select id="categoryParent" class="form-control">
                  <option value="">없음 (최상위 카테고리)</option>
                </select>
              </div>

              <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="cancelCategoryForm()">취소</button>
                <button type="submit" class="btn btn-primary">저장</button>
              </div>
            </form>
          </div>
        </div>

        <!-- 사용자 관리 탭 -->
        <div class="admin-tab-content" id="usersTab" style="display: ${currentTab === 'users' ? 'block' : 'none'}">
          <div class="admin-section">
            <h2>사용자 목록</h2>
            <div id="usersList" class="admin-list"></div>
          </div>
        </div>
      </div>
    </div>
  `;
}

export async function init() {
  // 관리자 권한 확인
  const user = window.currentUser();
  if (!user || user.role !== 'ADMIN') {
    return;
  }

  // 탭 전환 이벤트
  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.getAttribute('data-tab');
      switchTab(tabName);
    });
  });

  // 카테고리 로드
  await loadCategories();

  // 제품 관리 탭 초기화
  if (currentTab === 'products') {
    await initProductsTab();
  }

  // 카테고리 관리 탭 초기화
  if (currentTab === 'categories') {
    await initCategoriesTab();
  }

  // 사용자 관리 탭 초기화
  if (currentTab === 'users') {
    await initUsersTab();
  }
}

function switchTab(tabName) {
  currentTab = tabName;
  
  // 탭 버튼 활성화
  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.classList.toggle('active', tab.getAttribute('data-tab') === tabName);
  });

  // 탭 컨텐츠 표시/숨김
  document.querySelectorAll('.admin-tab-content').forEach(content => {
    content.style.display = 'none';
  });
  
  const activeTab = document.getElementById(`${tabName}Tab`);
  if (activeTab) {
    activeTab.style.display = 'block';
  }

  // 각 탭 초기화
  if (tabName === 'products') {
    initProductsTab();
  } else if (tabName === 'categories') {
    initCategoriesTab();
  } else if (tabName === 'users') {
    initUsersTab();
  }
}

async function initProductsTab() {
  // 제품 목록 로드
  await loadProducts();

  // 제품 추가 버튼
  const addProductBtn = document.getElementById('addProductBtn');
  if (addProductBtn) {
    addProductBtn.addEventListener('click', () => {
      editingProductId = null;
      document.getElementById('productFormTitle').textContent = '새 제품 추가';
      document.getElementById('productFormSection').style.display = 'block';
      resetProductForm();
    });
  }

  // 제품 검색
  const productSearch = document.getElementById('productSearch');
  if (productSearch) {
    productSearch.addEventListener('input', (e) => {
      filterProducts(e.target.value);
    });
  }

  // 스펙 추가 버튼
  const addSpecBtn = document.getElementById('addSpecBtn');
  if (addSpecBtn) {
    addSpecBtn.addEventListener('click', () => {
      addSpecRow();
    });
  }

  // 스펙 삭제 버튼들
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('remove-spec')) {
      e.target.closest('.spec-item').remove();
    }
  });

  // 폼 제출
  const form = document.getElementById('productForm');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await submitProduct();
    });
  }
}

async function initCategoriesTab() {
  // 카테고리 목록 렌더링
  await renderCategoriesList();

  // 카테고리 추가 버튼
  const addCategoryBtn = document.getElementById('addCategoryBtn');
  if (addCategoryBtn) {
    addCategoryBtn.addEventListener('click', () => {
      editingCategoryId = null;
      document.getElementById('categoryFormTitle').textContent = '새 카테고리 추가';
      document.getElementById('categoryFormSection').style.display = 'block';
      resetCategoryForm();
    });
  }

  // 카테고리 폼 제출
  const form = document.getElementById('categoryForm');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await submitCategory();
    });
  }
}

async function initUsersTab() {
  await loadUsers();
  await renderUsersList();
}

async function loadCategories() {
  try {
    const data = await categoryAPI.getList();
    const flatCategories = flattenCategories(data.categories || []);
    categories = flatCategories;
    
    // 제품 폼의 카테고리 선택
    const categorySelect = document.getElementById('productCategory');
    if (categorySelect) {
      categorySelect.innerHTML = '<option value="">카테고리를 선택하세요</option>';
      flatCategories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat.id;
        option.textContent = '  '.repeat(cat.level || 0) + cat.name;
        categorySelect.appendChild(option);
      });
    }

    // 카테고리 폼의 상위 카테고리 선택
    const categoryParentSelect = document.getElementById('categoryParent');
    if (categoryParentSelect) {
      categoryParentSelect.innerHTML = '<option value="">없음 (최상위 카테고리)</option>';
      flatCategories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat.id;
        option.textContent = '  '.repeat(cat.level || 0) + cat.name;
        categoryParentSelect.appendChild(option);
      });
    }
  } catch (error) {
    console.error('Failed to load categories:', error);
    showError('카테고리를 불러오는데 실패했습니다.');
  }
}

async function loadProducts() {
  try {
    const data = await productAPI.getList({ limit: 1000 });
    products = data.products || [];
    renderProductsList();
  } catch (error) {
    console.error('Failed to load products:', error);
    showError('제품 목록을 불러오는데 실패했습니다.');
  }
}

function renderProductsList() {
  const productsList = document.getElementById('productsList');
  if (!productsList) return;

  if (products.length === 0) {
    productsList.innerHTML = '<p>등록된 제품이 없습니다.</p>';
    return;
  }

  productsList.innerHTML = products.map(product => `
    <div class="admin-list-item">
      <div class="admin-list-item-content">
        <h3>${product.name}</h3>
        <p>제조사: ${product.manufacturer} | 가격: ${formatPrice(product.price)} | 카테고리: ${product.category?.name || 'N/A'}</p>
        <p class="text-muted">${product.isActive ? '활성화' : '비활성화'} | 조회수: ${product.viewCount || 0}</p>
      </div>
      <div class="admin-list-item-actions">
        <button class="btn btn-sm btn-primary" onclick="editProduct(${product.id})">수정</button>
        <button class="btn btn-sm btn-danger" onclick="deleteProduct(${product.id})">삭제</button>
      </div>
    </div>
  `).join('');
}

function filterProducts(searchTerm) {
  const filtered = products.filter(product => 
    product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.manufacturer.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  const productsList = document.getElementById('productsList');
  if (!productsList) return;

  if (filtered.length === 0) {
    productsList.innerHTML = '<p>검색 결과가 없습니다.</p>';
    return;
  }

  productsList.innerHTML = filtered.map(product => `
    <div class="admin-list-item">
      <div class="admin-list-item-content">
        <h3>${product.name}</h3>
        <p>제조사: ${product.manufacturer} | 가격: ${formatPrice(product.price)} | 카테고리: ${product.category?.name || 'N/A'}</p>
        <p class="text-muted">${product.isActive ? '활성화' : '비활성화'} | 조회수: ${product.viewCount || 0}</p>
      </div>
      <div class="admin-list-item-actions">
        <button class="btn btn-sm btn-primary" onclick="editProduct(${product.id})">수정</button>
        <button class="btn btn-sm btn-danger" onclick="deleteProduct(${product.id})">삭제</button>
      </div>
    </div>
  `).join('');
}

async function renderCategoriesList() {
  const categoriesList = document.getElementById('categoriesList');
  if (!categoriesList) return;

  try {
    const data = await categoryAPI.getList();
    const flatCategories = flattenCategories(data.categories || []);

    if (flatCategories.length === 0) {
      categoriesList.innerHTML = '<p>등록된 카테고리가 없습니다.</p>';
      return;
    }

    categoriesList.innerHTML = flatCategories.map(cat => {
      const indent = '  '.repeat(cat.level || 0);
      return `
        <div class="admin-list-item">
          <div class="admin-list-item-content">
            <h3>${indent}${cat.name}</h3>
            <p class="text-muted">상품 개수: ${cat.productCount || 0}</p>
          </div>
          <div class="admin-list-item-actions">
            <button class="btn btn-sm btn-primary" onclick="editCategory(${cat.id})">수정</button>
          </div>
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error('Failed to render categories:', error);
    categoriesList.innerHTML = '<p>카테고리를 불러오는데 실패했습니다.</p>';
  }
}

async function loadUsers() {
  try {
    users = await adminAPI.getUsers();
  } catch (error) {
    console.error('Failed to load users:', error);
    showError('사용자 목록을 불러오는데 실패했습니다.');
  }
}

function renderUsersList() {
  const usersList = document.getElementById('usersList');
  if (!usersList) return;

  if (users.length === 0) {
    usersList.innerHTML = '<p>등록된 사용자가 없습니다.</p>';
    return;
  }

  usersList.innerHTML = users.map(user => `
    <div class="admin-list-item">
      <div class="admin-list-item-content">
        <h3>${user.nickname || user.email}</h3>
        <p>이메일: ${user.email} | 역할: ${user.role === 'ADMIN' ? '관리자' : '일반 사용자'}</p>
        <p class="text-muted">가입일: ${formatDateTime(user.createdAt)}</p>
      </div>
      <div class="admin-list-item-actions">
        <select class="form-control" style="display: inline-block; width: auto; margin-right: 10px;" 
                onchange="updateUserRole(${user.id}, this.value)" ${user.role === 'ADMIN' && users.filter(u => u.role === 'ADMIN').length === 1 ? 'disabled' : ''}>
          <option value="USER" ${user.role === 'USER' ? 'selected' : ''}>일반 사용자</option>
          <option value="ADMIN" ${user.role === 'ADMIN' ? 'selected' : ''}>관리자</option>
        </select>
      </div>
    </div>
  `).join('');
}

function addSpecRow(key = '', value = '') {
  const container = document.getElementById('specsContainer');
  if (!container) return;

  const specItem = document.createElement('div');
  specItem.className = 'spec-item';
  specItem.innerHTML = `
    <input type="text" class="spec-key" placeholder="스펙 이름 (예: Socket)" value="${key}" />
    <input type="text" class="spec-value" placeholder="스펙 값 (예: LGA1700)" value="${value}" />
    <button type="button" class="btn btn-danger btn-sm remove-spec">삭제</button>
  `;
  container.appendChild(specItem);
}

async function submitProduct() {
  const categoryId = document.getElementById('productCategory').value;
  const name = document.getElementById('productName').value.trim();
  const manufacturer = document.getElementById('productManufacturer').value.trim();
  const price = parseInt(document.getElementById('productPrice').value);
  const imageUrl = document.getElementById('productImageUrl').value.trim();
  const isActive = document.getElementById('productIsActive').checked;
  const detailInfoText = document.getElementById('productDetailInfo').value.trim();

  // 필수 필드 검증
  if (!categoryId || !name || !manufacturer || isNaN(price) || price < 0) {
    showError('필수 항목을 모두 입력해주세요.');
    return;
  }

  // 스펙 수집
  const specs = [];
  document.querySelectorAll('.spec-item').forEach(item => {
    const key = item.querySelector('.spec-key').value.trim();
    const value = item.querySelector('.spec-value').value.trim();
    if (key && value) {
      specs.push({ key, value });
    }
  });

  // 상세 정보 파싱
  let detailInfo = null;
  if (detailInfoText) {
    try {
      detailInfo = JSON.parse(detailInfoText);
    } catch (e) {
      showError('상세 정보가 올바른 JSON 형식이 아닙니다.');
      return;
    }
  }

  try {
    const productData = {
      categoryId: parseInt(categoryId),
      name,
      manufacturer,
      price,
      imageUrl: imageUrl || undefined,
      isActive,
      specs,
      detailInfo: detailInfo || undefined
    };

    if (editingProductId) {
      // 수정
      await productAPI.update(editingProductId, productData);
      showSuccess(`제품 "${name}"이(가) 성공적으로 수정되었습니다!`);
    } else {
      // 생성
      await productAPI.create(productData);
      showSuccess(`제품 "${name}"이(가) 성공적으로 추가되었습니다!`);
    }
    
    cancelProductForm();
    await loadProducts();
  } catch (error) {
    console.error('Failed to save product:', error);
    showError(error.message || '제품 저장에 실패했습니다.');
  }
}

async function editProduct(productId) {
  try {
    const product = await productAPI.getDetail(productId);
    editingProductId = productId;
    
    document.getElementById('productFormTitle').textContent = '제품 수정';
    document.getElementById('productCategory').value = product.categoryId;
    document.getElementById('productName').value = product.name;
    document.getElementById('productManufacturer').value = product.manufacturer;
    document.getElementById('productPrice').value = product.price;
    document.getElementById('productImageUrl').value = product.imageUrl || '';
    document.getElementById('productIsActive').checked = product.isActive;
    
    // 스펙 설정
    const specsContainer = document.getElementById('specsContainer');
    specsContainer.innerHTML = '';
    if (product.specs && product.specs.length > 0) {
      product.specs.forEach(spec => {
        addSpecRow(spec.key, spec.value);
      });
    } else {
      addSpecRow();
    }
    
    // 상세 정보 설정
    if (product.detailInfo) {
      document.getElementById('productDetailInfo').value = JSON.stringify(product.detailInfo, null, 2);
    } else {
      document.getElementById('productDetailInfo').value = '';
    }
    
    document.getElementById('productFormSection').style.display = 'block';
    document.getElementById('productFormSection').scrollIntoView({ behavior: 'smooth' });
  } catch (error) {
    console.error('Failed to load product:', error);
    showError('제품 정보를 불러오는데 실패했습니다.');
  }
}

async function deleteProduct(productId) {
  if (!confirm('정말 이 제품을 삭제하시겠습니까?')) {
    return;
  }

  try {
    await productAPI.delete(productId);
    showSuccess('제품이 삭제되었습니다.');
    await loadProducts();
  } catch (error) {
    console.error('Failed to delete product:', error);
    showError(error.message || '제품 삭제에 실패했습니다.');
  }
}

function resetProductForm() {
  editingProductId = null;
  const form = document.getElementById('productForm');
  if (form) {
    form.reset();
    document.getElementById('productIsActive').checked = true;
    
    // 스펙 초기화
    const specsContainer = document.getElementById('specsContainer');
    if (specsContainer) {
      specsContainer.innerHTML = `
        <div class="spec-item">
          <input type="text" class="spec-key" placeholder="스펙 이름 (예: Socket)" />
          <input type="text" class="spec-value" placeholder="스펙 값 (예: LGA1700)" />
          <button type="button" class="btn btn-danger btn-sm remove-spec">삭제</button>
        </div>
      `;
    }
  }
}

function cancelProductForm() {
  editingProductId = null;
  resetProductForm();
  document.getElementById('productFormSection').style.display = 'none';
}

async function submitCategory() {
  const name = document.getElementById('categoryName').value.trim();
  const parentId = document.getElementById('categoryParent').value;

  if (!name) {
    showError('카테고리명을 입력해주세요.');
    return;
  }

  try {
    const categoryData = {
      name,
      parentId: parentId ? parseInt(parentId) : null
    };

    if (editingCategoryId) {
      // 수정
      await categoryAPI.update(editingCategoryId, categoryData);
      showSuccess(`카테고리 "${name}"이(가) 성공적으로 수정되었습니다!`);
    } else {
      // 생성
      await categoryAPI.create(categoryData);
      showSuccess(`카테고리 "${name}"이(가) 성공적으로 추가되었습니다!`);
    }
    
    cancelCategoryForm();
    await loadCategories();
    await renderCategoriesList();
  } catch (error) {
    console.error('Failed to save category:', error);
    showError(error.message || '카테고리 저장에 실패했습니다.');
  }
}

async function editCategory(categoryId) {
  try {
    const data = await categoryAPI.getList();
    const flatCategories = flattenCategories(data.categories || []);
    const category = flatCategories.find(cat => cat.id === categoryId);
    
    if (!category) {
      showError('카테고리를 찾을 수 없습니다.');
      return;
    }

    editingCategoryId = categoryId;
    
    document.getElementById('categoryFormTitle').textContent = '카테고리 수정';
    document.getElementById('categoryName').value = category.name;
    document.getElementById('categoryParent').value = category.parentId || '';
    
    document.getElementById('categoryFormSection').style.display = 'block';
    document.getElementById('categoryFormSection').scrollIntoView({ behavior: 'smooth' });
  } catch (error) {
    console.error('Failed to load category:', error);
    showError('카테고리 정보를 불러오는데 실패했습니다.');
  }
}

function resetCategoryForm() {
  editingCategoryId = null;
  const form = document.getElementById('categoryForm');
  if (form) {
    form.reset();
  }
}

function cancelCategoryForm() {
  editingCategoryId = null;
  resetCategoryForm();
  document.getElementById('categoryFormSection').style.display = 'none';
}

async function updateUserRole(userId, role) {
  try {
    await adminAPI.updateUserRole(userId, role);
    showSuccess('사용자 역할이 변경되었습니다.');
    await loadUsers();
    await renderUsersList();
  } catch (error) {
    console.error('Failed to update user role:', error);
    showError(error.message || '사용자 역할 변경에 실패했습니다.');
    // 목록 다시 로드하여 원래 상태로 복원
    await loadUsers();
    await renderUsersList();
  }
}

// 전역 함수로 노출
window.resetProductForm = resetProductForm;
window.cancelProductForm = cancelProductForm;
window.editProduct = editProduct;
window.deleteProduct = deleteProduct;
window.editCategory = editCategory;
window.cancelCategoryForm = cancelCategoryForm;
window.updateUserRole = updateUserRole;

