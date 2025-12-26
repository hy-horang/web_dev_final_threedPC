// 클라이언트용 Firebase Auth 예제 (module 형태)
// 사용: <script type="module">import { signInWithGoogle } from '/firebase-auth.js';</script>
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDp9mX7tQP-0UJwM9HJSZt1giQvrq_3kaM",
  authDomain: "threedpc-adacf.firebaseapp.com",
  projectId: "threedpc-adacf",
  storageBucket: "threedpc-adacf.firebasestorage.app",
  messagingSenderId: "556480805044",
  appId: "1:556480805044:web:091ab0cec565a71883bfe1",
  measurementId: "G-H8RBFDRWZE"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

export async function signInWithGoogle() {
  try {
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    const idToken = await user.getIdToken();

    // 서버로 ID 토큰 전송
    const resp = await fetch('/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    if (!resp.ok) throw new Error('Server verification failed');
    const data = await resp.json();
    
    // 토큰을 localStorage에 저장
    if (data.accessToken && data.refreshToken) {
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
    }
    
    return data;
  } catch (err) {
    console.error('Client sign-in error', err);
    throw err;
  }
}

export async function signOutGoogle() {
  await signOut(auth);
  // 로그아웃 시 localStorage 정리
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
}

// 서버 로그아웃 (JWT 토큰 무효화)
export async function logout() {
  const accessToken = localStorage.getItem('accessToken');
  
  try {
    // 서버에 로그아웃 요청 (토큰이 있는 경우)
    if (accessToken) {
      const resp = await fetch('/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        }
      });
      
      // 서버 응답이 실패해도 클라이언트 토큰은 정리
      if (!resp.ok) {
        console.warn('Server logout failed, but clearing local tokens');
      }
    }
    
    // 클라이언트에서 토큰 제거
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    
    // Firebase 로그아웃도 함께 수행 (Google 로그인 사용 시)
    try {
      await signOut(auth);
    } catch (err) {
      // Firebase 로그아웃 실패는 무시 (이미 로그아웃된 경우 등)
    }
    
    return { message: 'Logged out successfully' };
  } catch (err) {
    // 에러가 발생해도 로컬 토큰은 정리
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    console.error('Logout error', err);
    throw err;
  }
}

// JWT 토큰 갱신 (카카오와 동일한 방식: /auth/refresh 사용)
export async function refreshToken() {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) {
    throw new Error('No refresh token found');
  }
  
  try {
    const resp = await fetch('/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    
    if (!resp.ok) throw new Error('Token refresh failed');
    const data = await resp.json();
    
    // 갱신된 accessToken을 localStorage에 저장
    if (data.accessToken) {
      localStorage.setItem('accessToken', data.accessToken);
    }
    
    return data;
  } catch (err) {
    console.error('Token refresh error', err);
    throw err;
  }
}
