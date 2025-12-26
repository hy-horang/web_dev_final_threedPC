// 메인 애플리케이션 진입점
import { tokenManager } from './api.js';
import { showError, showSuccess } from './utils.js';
import { signInWithGoogle, logout as firebaseLogout } from './firebase-auth.js';
import { authAPI } from './api.js';

// 전역 상태
let currentUser = null;

// 라우트 정의
const routes = {
  '/': () => import('./pages/home.js'),
  '/products': () => import('./pages/products.js'),
  '/products/:id': () => import('./pages/product-detail.js'),
  '/quotes': () => import('./pages/quotes.js'),
  '/quotes/:id': () => import('./pages/quote-detail.js'),
  '/my-quotes': () => import('./pages/my-quotes.js'),
  '/create-quote': () => import('./pages/create-quote.js'),
  '/login': () => import('./pages/login.js'),
  '/profile': () => import('./pages/profile.js'),
  '/admin': () => import('./pages/admin.js')
};

// 네비게이션 링크 이벤트 리스너 등록 함수
function attachNavListeners() {
  document.querySelectorAll('.nav-link').forEach(link => {
    // 로그아웃 버튼은 제외 (별도로 처리)
    if (link.id === 'logoutBtn' || link.classList.contains('btn-logout')) {
      return;
    }
    
    // 기존 리스너 제거 (중복 방지)
    const newLink = link.cloneNode(true);
    link.parentNode.replaceChild(newLink, link);
    
    newLink.addEventListener('click', (e) => {
      e.preventDefault();
      let route = newLink.getAttribute('data-route') || newLink.getAttribute('href');
      // href가 있으면 그것을 사용, 없으면 data-route 사용
      if (newLink.getAttribute('href')) {
        route = newLink.getAttribute('href');
      }
      navigate(route);
    });
  });
}

// 라우터 초기화
async function initRouter() {
  // 현재 사용자 정보 로드
  if (tokenManager.isAuthenticated()) {
    try {
      currentUser = await authAPI.getProfile();
      updateNavbar();
    } catch (error) {
      console.error('Failed to load user profile:', error);
      tokenManager.clearTokens();
    }
  }

  attachNavListeners();

  // 브라우저 뒤로/앞으로 버튼 처리
  window.addEventListener('popstate', () => {
    renderRoute(window.location.pathname);
  });

  // 초기 라우트 렌더링
  renderRoute(window.location.pathname);
}

// 라우트 렌더링
async function renderRoute(path) {
  const mainContent = document.getElementById('mainContent');
  const loadingContainer = document.getElementById('loadingContainer');
  
  // 로딩 표시
  loadingContainer.style.display = 'flex';
  mainContent.innerHTML = '';

  try {
    // 라우트 매칭
    let routeHandler = null;
    let params = {};

    for (const [pattern, handler] of Object.entries(routes)) {
      const regex = new RegExp('^' + pattern.replace(/:\w+/g, '([^/]+)') + '$');
      const match = path.match(regex);
      
      if (match) {
        routeHandler = handler;
        // 파라미터 추출
        const paramNames = pattern.match(/:\w+/g) || [];
        paramNames.forEach((param, index) => {
          const paramName = param.substring(1);
          params[paramName] = match[index + 1];
        });
        break;
      }
    }

    if (!routeHandler) {
      mainContent.innerHTML = '<div class="error-page"><h1>404</h1><p>페이지를 찾을 수 없습니다.</p></div>';
      return;
    }

    // 페이지 모듈 로드 및 렌더링
    const pageModule = await routeHandler();
    const pageContent = await pageModule.render(params);
    
    mainContent.innerHTML = pageContent;
    
    // 페이지 초기화 함수 호출
    if (pageModule.init) {
      await pageModule.init(params);
    }
  } catch (error) {
    console.error('Route rendering error:', error);
    mainContent.innerHTML = `
      <div class="error-page">
        <h1>오류 발생</h1>
        <p>${error.message}</p>
        <button onclick="location.reload()">새로고침</button>
      </div>
    `;
  } finally {
    loadingContainer.style.display = 'none';
  }
}

// 네비게이션
export function navigate(path) {
  // 경로 정규화: 상대 경로를 절대 경로로 변환
  if (!path.startsWith('/')) {
    path = '/' + path;
  }
  window.history.pushState({}, '', path);
  renderRoute(path);
}

// 네비게이션 바 업데이트
function updateNavbar() {
  const navAuth = document.getElementById('navAuth');
  
  if (currentUser) {
    const isAdmin = currentUser.role === 'ADMIN';
    navAuth.innerHTML = `
      <span class="nav-user">${currentUser.nickname || currentUser.email}</span>
      ${isAdmin ? '<a href="/admin" class="nav-link" data-route="admin">관리자</a>' : ''}
      <a href="/profile" class="nav-link" data-route="profile">프로필</a>
      <button class="nav-link btn-logout" id="logoutBtn">로그아웃</button>
    `;
  } else {
    navAuth.innerHTML = '<a href="/login" class="nav-link" data-route="login">로그인</a>';
  }
  
  // 네비게이션 링크 이벤트 리스너 재등록
  attachNavListeners();
  
  // 로그아웃 버튼 이벤트 리스너 등록 (attachNavListeners 이후에 추가해야 함)
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
  }
}

// 로그아웃 처리
async function handleLogout() {
  try {
    await firebaseLogout();
    await authAPI.logout();
    currentUser = null;
    updateNavbar();
    showSuccess('로그아웃되었습니다.');
    navigate('/');
  } catch (error) {
    console.error('Logout error:', error);
    currentUser = null;
    tokenManager.clearTokens();
    updateNavbar();
    navigate('/');
  }
}

// Google 로그인 처리 (전역 함수로 노출)
window.handleGoogleLogin = async function() {
  try {
    const data = await signInWithGoogle();
    currentUser = data.user;
    updateNavbar();
    showSuccess('로그인되었습니다.');
    navigate('/');
  } catch (error) {
    console.error('Login error:', error);
    showError(error.message || '로그인에 실패했습니다.');
  }
};

// Kakao 로그인 처리
window.handleKakaoLogin = function() {
  window.location.href = '/auth/kakao';
};

// 전역으로 navigate 함수 노출
window.navigate = navigate;
window.currentUser = () => currentUser;
window.setCurrentUser = (user) => {
  currentUser = user;
  updateNavbar();
};

// 카카오 로그인 콜백 처리
async function handleKakaoCallback() {
  // URL 쿼리 파라미터에서 토큰 확인 (서버에서 쿼리 파라미터로 리다이렉트한 경우)
  const urlParams = new URLSearchParams(window.location.search);
  const accessToken = urlParams.get('accessToken');
  const refreshToken = urlParams.get('refreshToken');
  
  if (accessToken && refreshToken) {
    // 쿼리 파라미터로 토큰을 받은 경우 (카카오 로그인 성공)
    tokenManager.setTokens(accessToken, refreshToken);
    try {
      // 사용자 프로필 정보 가져오기
      currentUser = await authAPI.getProfile();
      updateNavbar();
      showSuccess('로그인되었습니다.');
      // URL에서 토큰 제거 (보안 및 깔끔한 URL을 위해)
      window.history.replaceState({}, '', '/');
      navigate('/');
    } catch (error) {
      console.error('Failed to load user profile after Kakao login:', error);
      showError('로그인 후 프로필을 불러오는데 실패했습니다.');
      // URL에서 토큰 제거
      window.history.replaceState({}, '', '/');
    }
  }
}

// 앱 초기화
async function init() {
  // DOM이 완전히 로드될 때까지 대기
  if (document.readyState === 'loading') {
    await new Promise(resolve => {
      document.addEventListener('DOMContentLoaded', resolve);
    });
  }
  
  // 카카오 콜백 처리
  await handleKakaoCallback();
  
  // 라우터 초기화
  initRouter();
}

init();

