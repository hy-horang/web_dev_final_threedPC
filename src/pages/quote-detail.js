// 견적서 상세 페이지
import { quoteAPI, compatibilityAPI } from '../api.js';
import { formatPrice, formatNumber, formatDate, showError, showSuccess } from '../utils.js';
import { tokenManager } from '../api.js';

let quote = null;
let isLiked = false;
let compatibilityResult = null;

export async function render(params) {
  const quoteId = params.id;
  
  return `
    <div class="page-container">
      <div id="quoteDetailContainer">
        <div class="loading-spinner">로딩 중...</div>
      </div>
    </div>
  `;
}

export async function init(params) {
  const quoteId = parseInt(params.id);
  if (isNaN(quoteId)) {
    showError('유효하지 않은 견적서 ID입니다.');
    window.navigate('/quotes');
    return;
  }

  await loadQuote(quoteId);
}

async function loadQuote(id) {
  const container = document.getElementById('quoteDetailContainer');
  if (!container) return;

  try {
    quote = await quoteAPI.getDetail(id);
    
    // 호환성 검사
    try {
      compatibilityResult = await compatibilityAPI.check(id);
    } catch (error) {
      console.error('Compatibility check failed:', error);
    }

    const isOwner = tokenManager.isAuthenticated() && window.currentUser()?.id === quote.userId;
    const isAdmin = tokenManager.isAuthenticated() && window.currentUser()?.role === 'ADMIN';

    container.innerHTML = `
      <div class="quote-detail">
        <div class="quote-detail-header">
          <div>
            <h1>${quote.title}</h1>
            ${quote.description ? `<p class="quote-description">${quote.description}</p>` : ''}
          </div>
          <div class="quote-header-actions">
            ${isOwner || isAdmin ? `
              <button class="btn btn-secondary" onclick="editQuote()">수정</button>
              <button class="btn btn-danger" onclick="deleteQuote()">삭제</button>
            ` : ''}
            ${tokenManager.isAuthenticated() ? `
              <button class="btn btn-primary" id="copyQuoteBtn">복사하기</button>
              <button class="btn btn-secondary" id="likeBtn">${isLiked ? '❤️ 추천 취소' : '🤍 추천하기'}</button>
            ` : ''}
          </div>
        </div>

        <div class="quote-meta-info">
          <div class="meta-item">
            <span class="meta-label">작성자:</span>
            <span>${quote.user?.nickname || '익명'}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">작성일:</span>
            <span>${formatDate(quote.createdAt)}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">총 가격:</span>
            <span class="quote-total-price">${formatPrice(quote.totalPrice)}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">부품 수:</span>
            <span>${quote.items?.length || 0}개</span>
          </div>
          <div class="meta-stats">
            <span>👁 ${formatNumber(quote.viewCount || 0)}</span>
            <span>❤️ ${formatNumber(quote._count?.likes || 0)}</span>
            <span>💬 ${formatNumber(quote._count?.comments || 0)}</span>
          </div>
        </div>

        ${compatibilityResult ? `
          <div class="compatibility-section">
            <h2>호환성 검사</h2>
            ${compatibilityResult.compatible ? `
              <div class="compatibility-status compatible">
                <span class="status-icon">✅</span>
                <span>모든 부품이 호환됩니다.</span>
              </div>
            ` : `
              <div class="compatibility-status incompatible">
                <span class="status-icon">❌</span>
                <span>호환성 문제가 발견되었습니다.</span>
              </div>
            `}
            
            ${compatibilityResult.issues && compatibilityResult.issues.length > 0 ? `
              <div class="compatibility-issues">
                <h3>호환성 문제</h3>
                <ul>
                  ${compatibilityResult.issues.map(issue => `
                    <li class="issue-item error">
                      <strong>${issue.component1?.name}</strong>와 <strong>${issue.component2?.name}</strong>: ${issue.message}
                    </li>
                  `).join('')}
                </ul>
              </div>
            ` : ''}
            
            ${compatibilityResult.warnings && compatibilityResult.warnings.length > 0 ? `
              <div class="compatibility-warnings">
                <h3>주의사항</h3>
                <ul>
                  ${compatibilityResult.warnings.map(warning => `
                    <li class="issue-item warning">
                      ${warning.message}
                    </li>
                  `).join('')}
                </ul>
              </div>
            ` : ''}
          </div>
        ` : ''}

        <div class="quote-items-section">
          <h2>부품 목록</h2>
          <div class="quote-items-list">
            ${quote.items && quote.items.length > 0 ? quote.items.map(item => `
              <div class="quote-item-card">
                <div class="quote-item-info">
                  <h3 onclick="window.navigate('/products/${item.product.id}')">${item.product.name}</h3>
                  <p>${item.product.manufacturer}</p>
                  <p class="quote-item-price">
                    ${formatPrice(item.priceAt)} × ${item.quantity} = ${formatPrice(item.priceAt * item.quantity)}
                  </p>
                  ${item.product.category ? `<span class="category-badge">${item.product.category.name}</span>` : ''}
                </div>
                ${item.product.imageUrl ? `
                  <img src="${item.product.imageUrl}" alt="${item.product.name}" class="quote-item-image" />
                ` : ''}
              </div>
            `).join('') : '<p class="empty-message">부품이 없습니다.</p>'}
          </div>
        </div>

        <div class="quote-comments-section">
          <h2>댓글 (${quote._count?.comments || 0})</h2>
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
    setupEventListeners(isOwner, isAdmin);
    
    // 댓글 로드
    await loadComments(id);
  } catch (error) {
    console.error('Failed to load quote:', error);
    container.innerHTML = `
      <div class="error-page">
        <h1>견적서를 불러올 수 없습니다</h1>
        <p>${error.message || '알 수 없는 오류가 발생했습니다.'}</p>
        <a href="/quotes" class="btn">견적서 목록으로</a>
      </div>
    `;
  }
}

function setupEventListeners(isOwner, isAdmin) {
  // 복사하기
  const copyBtn = document.getElementById('copyQuoteBtn');
  if (copyBtn) {
    copyBtn.addEventListener('click', handleCopyQuote);
  }

  // 추천하기
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

async function handleCopyQuote() {
  if (!tokenManager.isAuthenticated()) {
    showError('로그인이 필요합니다.');
    window.navigate('/login');
    return;
  }

  if (!confirm('이 견적서를 내 견적함으로 복사하시겠습니까?')) return;

  try {
    const result = await quoteAPI.copy(quote.id);
    showSuccess('견적서가 복사되었습니다.');
    window.navigate(`/quotes/${result.quote.id}`);
  } catch (error) {
    showError(error.message || '견적서 복사에 실패했습니다.');
  }
}

async function handleToggleLike() {
  if (!tokenManager.isAuthenticated()) {
    showError('로그인이 필요합니다.');
    window.navigate('/login');
    return;
  }

  try {
    const result = await quoteAPI.toggleLike(quote.id);
    isLiked = result.liked;
    
    const likeBtn = document.getElementById('likeBtn');
    if (likeBtn) {
      likeBtn.textContent = isLiked ? '❤️ 추천 취소' : '🤍 추천하기';
    }
    
    // 페이지 새로고침하여 좋아요 수 업데이트
    await loadQuote(quote.id);
  } catch (error) {
    showError(error.message || '추천 처리에 실패했습니다.');
  }
}

async function loadComments(quoteId) {
  const container = document.getElementById('commentsContainer');
  if (!container) return;

  try {
    const data = await quoteAPI.getComments(quoteId);
    
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
    await quoteAPI.createComment(quote.id, content);
    showSuccess('댓글이 작성되었습니다.');
    commentInput.value = '';
    await loadComments(quote.id);
  } catch (error) {
    showError(error.message || '댓글 작성에 실패했습니다.');
  }
}

window.editQuote = function() {
  // 간단한 수정 모달 또는 페이지로 이동
  const newTitle = prompt('견적서 제목:', quote.title);
  if (!newTitle || newTitle === quote.title) return;

  const newDescription = prompt('설명:', quote.description || '');
  const isPublic = confirm('공개하시겠습니까?');

  quoteAPI.update(quote.id, {
    title: newTitle,
    description: newDescription,
    isPublic
  }).then(() => {
    showSuccess('견적서가 수정되었습니다.');
    loadQuote(quote.id);
  }).catch(error => {
    showError(error.message || '견적서 수정에 실패했습니다.');
  });
};

window.deleteQuote = async function() {
  if (!confirm('이 견적서를 삭제하시겠습니까?')) return;

  try {
    await quoteAPI.delete(quote.id);
    showSuccess('견적서가 삭제되었습니다.');
    window.navigate('/quotes');
  } catch (error) {
    showError(error.message || '견적서 삭제에 실패했습니다.');
  }
};

