// 상품 상세 페이지
import { productAPI, quoteAPI, compatibilityAPI } from '../api.js';
import { formatPrice, formatNumber, formatDate, showError, showSuccess } from '../utils.js';
import { tokenManager } from '../api.js';

let product = null;
let isLiked = false;
let currentQuoteId = null;

export async function render(params) {
  const productId = params.id;
  
  return `
    <div class="page-container">
      <div id="productDetailContainer">
        <div class="loading-spinner">로딩 중...</div>
      </div>
    </div>
  `;
}

export async function init(params) {
  const productId = parseInt(params.id);
  if (isNaN(productId)) {
    showError('유효하지 않은 상품 ID입니다.');
    window.navigate('/products');
    return;
  }

  await loadProduct(productId);
}

async function loadProduct(id) {
  const container = document.getElementById('productDetailContainer');
  if (!container) return;

  try {
    product = await productAPI.getDetail(id);
    
    // 가격 이력 로드
    const priceHistory = await productAPI.getPriceHistory(id, { limit: 30 });
    
    // 연관 상품 로드
    const related = await productAPI.getRelated(id, { limit: 4 });
    
    // 좋아요 상태 확인 (로그인된 경우)
    if (tokenManager.isAuthenticated()) {
      try {
        const likes = await productAPI.getComments(id); // 임시로 comments API 사용
        // 실제로는 좋아요 상태를 확인하는 별도 API가 필요할 수 있음
      } catch (error) {
        // 무시
      }
    }

    container.innerHTML = `
      <div class="product-detail">
        <div class="product-detail-main">
          <div class="product-image-section">
            ${product.imageUrl ? 
              `<img src="${product.imageUrl}" alt="${product.name}" class="product-detail-image" />` :
              '<div class="product-placeholder large">이미지 없음</div>'
            }
          </div>

          <div class="product-info-section">
            <h1>${product.name}</h1>
            <p class="product-manufacturer">${product.manufacturer}</p>
            <p class="product-price-large">${formatPrice(product.price)}</p>
            
            <div class="product-actions">
              ${tokenManager.isAuthenticated() ? `
                <button class="btn btn-primary" id="addToQuoteBtn">견적서에 추가</button>
                <button class="btn btn-secondary" id="likeBtn">
                  ${isLiked ? '❤️ 찜 해제' : '🤍 찜하기'}
                </button>
              ` : `
                <a href="/login" class="btn btn-primary">로그인하여 견적서에 추가</a>
              `}
            </div>

            <div class="product-meta">
              <div class="meta-item">
                <span class="meta-label">카테고리:</span>
                <span>${product.category?.name || '-'}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">조회수:</span>
                <span>${formatNumber(product.viewCount)}</span>
              </div>
            </div>
          </div>
        </div>

        ${product.specs && product.specs.length > 0 ? `
          <div class="product-specs">
            <h2>상세 스펙</h2>
            <table class="spec-table">
              <tbody>
                ${product.specs.map(spec => `
                  <tr>
                    <td class="spec-key">${spec.key}</td>
                    <td class="spec-value">${spec.value}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : ''}

        ${priceHistory.priceHistory && priceHistory.priceHistory.length > 0 ? `
          <div class="product-price-history">
            <h2>가격 변동</h2>
            <div class="price-chart">
              ${priceHistory.priceHistory.map(item => `
                <div class="price-item">
                  <span class="price-date">${formatDate(item.recordedAt)}</span>
                  <span class="price-value">${formatPrice(item.price)}</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        ${related.relatedProducts && related.relatedProducts.length > 0 ? `
          <div class="related-products">
            <h2>연관 상품</h2>
            <div class="product-grid">
              ${related.relatedProducts.map(p => `
                <div class="product-card" onclick="window.navigate('/products/${p.id}')">
                  ${p.imageUrl ? `<img src="${p.imageUrl}" alt="${p.name}" />` : '<div class="product-placeholder">이미지 없음</div>'}
                  <div class="product-info">
                    <h3>${p.name}</h3>
                    <p class="product-price">${formatPrice(p.price)}</p>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <div class="product-comments">
          <h2>댓글</h2>
          <div id="commentsContainer">
            <div class="loading-spinner">로딩 중...</div>
          </div>
          ${tokenManager.isAuthenticated() ? `
            <div class="comment-form">
              <textarea id="commentInput" placeholder="댓글을 입력하세요..." rows="3"></textarea>
              <button class="btn btn-primary" id="submitCommentBtn">댓글 작성</button>
            </div>
          ` : `
            <p class="login-prompt">댓글을 작성하려면 <a href="/login">로그인</a>이 필요합니다.</p>
          `}
        </div>
      </div>
    `;

    // 이벤트 리스너 설정
    setupEventListeners();
    
    // 댓글 로드
    await loadComments(id);
  } catch (error) {
    console.error('Failed to load product:', error);
    container.innerHTML = `
      <div class="error-page">
        <h1>상품을 불러올 수 없습니다</h1>
        <p>${error.message || '알 수 없는 오류가 발생했습니다.'}</p>
        <a href="/products" class="btn">상품 목록으로</a>
      </div>
    `;
  }
}

function setupEventListeners() {
  // 견적서에 추가
  const addToQuoteBtn = document.getElementById('addToQuoteBtn');
  if (addToQuoteBtn) {
    addToQuoteBtn.addEventListener('click', handleAddToQuote);
  }

  // 찜하기
  const likeBtn = document.getElementById('likeBtn');
  if (likeBtn) {
    likeBtn.addEventListener('click', handleToggleLike);
  }

  // 댓글 작성
  const submitCommentBtn = document.getElementById('submitCommentBtn');
  if (submitCommentBtn) {
    submitCommentBtn.addEventListener('click', handleSubmitComment);
  }
}

async function handleAddToQuote() {
  if (!tokenManager.isAuthenticated()) {
    showError('로그인이 필요합니다.');
    window.navigate('/login');
    return;
  }

  // 견적서 선택 모달 표시 (간단한 구현)
  const quoteId = prompt('견적서 ID를 입력하거나, 새 견적서를 만들려면 "new"를 입력하세요:');
  
  if (!quoteId) return;

  if (quoteId === 'new') {
    window.navigate('/create-quote');
    return;
  }

  try {
    await quoteAPI.addItem(parseInt(quoteId), product.id, 1);
    showSuccess('견적서에 추가되었습니다.');
  } catch (error) {
    showError(error.message || '견적서에 추가하는데 실패했습니다.');
  }
}

async function handleToggleLike() {
  if (!tokenManager.isAuthenticated()) {
    showError('로그인이 필요합니다.');
    window.navigate('/login');
    return;
  }

  try {
    const result = await productAPI.toggleLike(product.id);
    isLiked = result.liked;
    
    const likeBtn = document.getElementById('likeBtn');
    if (likeBtn) {
      likeBtn.textContent = isLiked ? '❤️ 찜 해제' : '🤍 찜하기';
    }
    
    if (isLiked) {
      showSuccess('찜 목록에 추가되었습니다.');
    } else {
      showSuccess('찜 목록에서 제거되었습니다.');
    }
  } catch (error) {
    showError(error.message || '찜하기 처리에 실패했습니다.');
  }
}

async function loadComments(productId) {
  const container = document.getElementById('commentsContainer');
  if (!container) return;

  try {
    const data = await productAPI.getComments(productId);
    
    if (data.comments && data.comments.length > 0) {
      container.innerHTML = data.comments.map(comment => `
        <div class="comment-item">
          <div class="comment-header">
            <span class="comment-author">${comment.user?.nickname || '익명'}</span>
            <span class="comment-date">${formatDate(comment.createdAt)}</span>
          </div>
          <div class="comment-content">${comment.content}</div>
        </div>
      `).join('');
    } else {
      container.innerHTML = '<p class="empty-message">댓글이 없습니다.</p>';
    }
  } catch (error) {
    console.error('Failed to load comments:', error);
    container.innerHTML = '<p class="error-message">댓글을 불러오는데 실패했습니다.</p>';
  }
}

async function handleSubmitComment() {
  const commentInput = document.getElementById('commentInput');
  if (!commentInput) return;

  const content = commentInput.value.trim();
  if (!content) {
    showError('댓글 내용을 입력해주세요.');
    return;
  }

  try {
    await productAPI.createComment(product.id, content);
    showSuccess('댓글이 작성되었습니다.');
    commentInput.value = '';
    await loadComments(product.id);
  } catch (error) {
    showError(error.message || '댓글 작성에 실패했습니다.');
  }
}

