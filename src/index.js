require('dotenv').config();


// prisma orm 세팅
const { PrismaClient } = require('../generated/prisma/client');
const { PrismaMariaDb } = require('@prisma/adapter-mariadb');

const adapter = new PrismaMariaDb({
  host: 'localhost',
  port: 3306,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD ,
  database: process.env.DATABASE_NAME ,
  connectionLimit:  5
});

const prisma = new PrismaClient({ adapter });


// express 세팅
const express = require('express');
const app = express();

app.use(express.json());
// 정적 파일 제공: public 폴더에 있는 클라이언트 예제 파일들 제공
app.use(express.static('public'));

// Firebase 클라이언트 설정을 제공하는 API 엔드포인트
// 클라이언트 설정은 공개되어도 되는 정보입니다 (브라우저에서 사용되므로 어차피 노출됨)
app.get('/api/firebase-config', (req, res) => {
  res.json({
    apiKey: "AIzaSyDp9mX7tQP-0UJwM9HJSZt1giQvrq_3kaM",
    authDomain: "threedpc-adacf.firebaseapp.com",
    projectId: "threedpc-adacf",
    storageBucket: "threedpc-adacf.firebasestorage.app",
    messagingSenderId: "556480805044",
    appId: "1:556480805044:web:091ab0cec565a71883bfe1",
    measurementId: "G-H8RBFDRWZE"
  });
});


// jwt 세팅
const jwt = require('jsonwebtoken');


// passport 세팅
const passport = require('passport'); // Passport 메인
const KakaoStrategy = require('passport-kakao').Strategy; // 카카오 로그인 전략
const { Strategy: JwtStrategy, ExtractJwt } = require('passport-jwt'); // JWT 검증 전략

app.use(passport.initialize()); // Passport 초기화

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    done(null, user);
  } catch (err) {
    done(err);
  }
});

// Kakao Strategy 설정
passport.use(
  new KakaoStrategy(
    {
      clientID: process.env.KAKAO_CLIENT_ID,
      clientSecret: process.env.KAKAO_CLIENT_SECRET,
      callbackURL: process.env.KAKAO_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const kakaoId = String(profile.id);
        const kakaoAccount = profile._json && profile._json.kakao_account;
        const email = kakaoAccount && kakaoAccount.email;
        const nickname =
          profile.username || (profile._json && profile._json.properties && profile._json.properties.nickname) || null;

        // 먼저 snsId로 사용자 찾기
        let user = await prisma.user.findFirst({ where: { provider: 'kakao', snsId: kakaoId } });

        // snsId로 못찾았고 이메일이 있으면 이메일로 기존 유저 연결 시도
        if (!user && email) {
          const existing = await prisma.user.findUnique({ where: { email } });
          if (existing) {
            user = await prisma.user.update({
              where: { email },
              data: { provider: 'kakao', snsId: kakaoId, nickname: existing.nickname || nickname },
            });
          }
        }

        // 아직 유저가 없으면 새로 생성
        if (!user) {
          const createData = {
            email: email || `kakao_${kakaoId}@noemail.local`,
            provider: 'kakao',
            snsId: kakaoId,
            nickname,
          };
          user = await prisma.user.create({ data: createData });
        }

        return done(null, user);
      } catch (err) {
        console.error('Kakao verify error', err);
        return done(err);
      }
    }
  )
);

// JWT Strategy 설정 (Bearer token 검증)
passport.use(
  'jwt',
  new JwtStrategy(
    {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_ACCESS_SECRET || 'dev_secret',
    },
    async (payload, done) => {
      try {
        const user = await prisma.user.findUnique({ where: { id: payload.id } });
        if (!user) return done(null, false);
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }
  )
);








// OAuth 시작 라우트 (브라우저에서 접속)
app.get('/auth/kakao', passport.authenticate('kakao'));

// 콜백 처리: JWT를 발급해 JSON으로 반환 (role 포함)
app.get(
  '/auth/kakao/callback',
  passport.authenticate('kakao', { session: false, failureRedirect: '/login' }),
  (req, res) => {
    const accessToken = jwt.sign(
      { id: req.user.id, email: req.user.email, role: req.user.role },
      process.env.JWT_ACCESS_SECRET || 'dev_secret',
      { expiresIn: '1h' }
    );
    const refreshToken = jwt.sign(
      { id: req.user.id },
      process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret',
      { expiresIn: '7d' }
    );
    res.json({ accessToken, refreshToken, user: req.user });
  }
);



// 보호된 라우트 예시: JWT 인증 필요
app.get('/api/profile', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 토큰 갱신 엔드포인트: refreshToken으로 새로운 accessToken 발급
app.post('/auth/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(401).json({ error: 'Refresh token required' });

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret');
    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!user) return res.status(401).json({ error: 'User not found' });
    
    const newAccessToken = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_ACCESS_SECRET || 'dev_secret',
      { expiresIn: '1h' }
    );
    res.json({ accessToken: newAccessToken });
  } catch (err) {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// Role 기반 인가 미들웨어
const checkRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: insufficient permissions' });
    }
    next();
  };
};

// 관리자만 접근 가능한 라우트 예시
app.get(
  '/api/admin/users',
  passport.authenticate('jwt', { session: false }),
  checkRole('ADMIN'),
  async (req, res) => {
    try {
      const users = await prisma.user.findMany({ select: { id: true, email: true, nickname: true, role: true, createdAt: true } });
      res.json(users);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// 관리자 또는 본인만 프로필 수정 가능
app.put(
  '/api/profile/:userId',
  passport.authenticate('jwt', { session: false }),
  async (req, res) => {
    try {
      const { userId } = req.params;
      // 본인 또는 ADMIN만 수정 가능
      if (req.user.id !== parseInt(userId) && req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Forbidden: cannot modify other users' });
      }
      const { nickname } = req.body;
      const updated = await prisma.user.update({
        where: { id: parseInt(userId) },
        data: { nickname },
      });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// 관리자만 사용자 역할 변경 가능
app.patch(
  '/api/admin/users/:userId/role',
  passport.authenticate('jwt', { session: false }),
  checkRole('ADMIN'),
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { role } = req.body; // 'USER' 또는 'ADMIN'
      if (!['USER', 'ADMIN'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }
      const updated = await prisma.user.update({
        where: { id: parseInt(userId) },
        data: { role },
      });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);



// Firebase admin (server-side) 초기화
// 서버에서 Firebase ID 토큰을 검증하려면 `firebase-admin`을 사용합니다.
const admin = require('firebase-admin');
// 초기화 방법: 로컬 개발에서는 환경변수 `GOOGLE_APPLICATION_CREDENTIALS`에
// 서비스 계정 JSON 경로를 설정하거나, 아래처럼 서비스 계정 JSON을
// `FIREBASE_SERVICE_ACCOUNT` 환경변수로 넣어 초기화할 수 있습니다.
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
    });
  } else {
    admin.initializeApp(); // ADC 또는 환경 설정을 사용
  }
} catch (e) {
  // 이미 초기화된 경우 무시
  if (!/already exists/.test(String(e))) console.error('firebase-admin init error', e);
}

// 클라이언트에서 전달된 Firebase ID 토큰을 검증하고
// 기존 사용자와 연결하거나 새로 생성한 뒤 JWT를 발급합니다.
// 엔드포인트 이름을 /auth/google 로 사용합니다 (kakao와 동일 스타일).
app.post('/auth/google', async (req, res) => {
  const { idToken } = req.body;
  if (!idToken) return res.status(400).json({ error: 'idToken required' });
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    // decoded: { uid, email, name, picture, ... }
    const uid = String(decoded.uid);
    let user = await prisma.user.findFirst({ where: { provider: 'google', snsId: uid } });

    if (!user && decoded.email) {
      const existing = await prisma.user.findUnique({ where: { email: decoded.email } });
      if (existing) {
        user = await prisma.user.update({
          where: { email: decoded.email },
          data: { provider: 'google', snsId: uid, nickname: existing.nickname || decoded.name || null },
        });
      }
    }

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: decoded.email || `google_${uid}@noemail.local`,
          provider: 'google',
          snsId: uid,
          nickname: decoded.name || null,
        },
      });
    }

    const accessToken = jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_ACCESS_SECRET || 'dev_secret', { expiresIn: '1h' });
    const refreshToken = jwt.sign({ id: user.id }, process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret', { expiresIn: '7d' });
    res.json({ accessToken, refreshToken, user });
  } catch (err) {
    console.error('verifyIdToken error', err);
    res.status(401).json({ error: 'Invalid ID token' });
  }
});






const port = 3000;

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});