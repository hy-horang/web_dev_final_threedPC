// 프로필 페이지
import { authAPI } from '../api.js';
import { showError, showSuccess } from '../utils.js';
import { tokenManager } from '../api.js';

export async function render() {
  const user = window.currentUser();
  
  if (!user) {
    return `
      <div class="page-container">
        <div class="error-message">
          <p>로그인이 필요합니다.</p>
          <a href="/login" class="btn">로그인하기</a>
        </div>
      </div>
    `;
  }

  return `
    <div class="page-container">
      <div class="profile-container">
        <h1>프로필</h1>
        
        <div class="profile-card">
          <div class="profile-info">
            <div class="profile-field">
              <label>이메일</label>
              <p>${user.email || '-'}</p>
            </div>
            
            <div class="profile-field">
              <label>닉네임</label>
              <div class="profile-edit">
                <input type="text" id="nicknameInput" value="${user.nickname || ''}" placeholder="닉네임을 입력하세요" />
                <button class="btn btn-primary" id="saveNicknameBtn">저장</button>
              </div>
            </div>
            
            <div class="profile-field">
              <label>역할</label>
              <p>${user.role === 'ADMIN' ? '관리자' : '사용자'}</p>
            </div>
            
            <div class="profile-field">
              <label>가입일</label>
              <p>${new Date(user.createdAt).toLocaleDateString('ko-KR')}</p>
            </div>
          </div>
        </div>
        
        <div class="profile-actions">
          <button class="btn btn-secondary" id="logoutBtn">로그아웃</button>
        </div>
      </div>
    </div>
  `;
}

export async function init() {
  if (!tokenManager.isAuthenticated()) {
    window.navigate('/login');
    return;
  }

  // 닉네임 저장 버튼
  const saveBtn = document.getElementById('saveNicknameBtn');
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const nicknameInput = document.getElementById('nicknameInput');
      const nickname = nicknameInput.value.trim();
      
      if (!nickname) {
        showError('닉네임을 입력해주세요.');
        return;
      }

      try {
        const user = window.currentUser();
        const updated = await authAPI.updateProfile(user.id, { nickname });
        window.setCurrentUser(updated);
        showSuccess('닉네임이 변경되었습니다.');
        
        // 페이지 다시 렌더링
        const mainContent = document.getElementById('mainContent');
        mainContent.innerHTML = await render();
        await init();
      } catch (error) {
        showError(error.message || '닉네임 변경에 실패했습니다.');
      }
    });
  }

  // 로그아웃 버튼
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      if (confirm('로그아웃하시겠습니까?')) {
        try {
          const { logout } = await import('../firebase-auth.js');
          await logout();
          await authAPI.logout();
          window.setCurrentUser(null);
          showSuccess('로그아웃되었습니다.');
          window.navigate('/');
        } catch (error) {
          console.error('Logout error:', error);
          window.setCurrentUser(null);
          window.navigate('/');
        }
      }
    });
  }
}

