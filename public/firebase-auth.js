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
    return await resp.json();
  } catch (err) {
    console.error('Client sign-in error', err);
    throw err;
  }
}

export async function signOutGoogle() {
  await signOut(auth);
}
