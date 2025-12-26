require('dotenv').config();

// Swagger 설정
const { swaggerUi, getSwaggerSpec } = require('../swagger.js');

// prisma orm 세팅
const { PrismaClient } = require('../generated/prisma/client');
const { PrismaMariaDb } = require('@prisma/adapter-mariadb');

const adapter = new PrismaMariaDb({
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '3306'),
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD ,
  database: process.env.DATABASE_NAME ,
  connectionLimit:  5
});

const prisma = new PrismaClient({ adapter });

// 일관된 오류 응답 헬퍼 함수
function sendErrorResponse(res, status, code, message, details = null) {
  const errorResponse = {
    timestamp: new Date().toISOString(),
    path: res.req.originalUrl || res.req.url,
    status,
    code,
    message
  };
  
  if (details) {
    errorResponse.details = details;
  }
  
  res.status(status).json(errorResponse);
}

// express 세팅
const express = require('express');
const app = express();

app.use(express.json());
// 정적 파일 제공: src 폴더에 있는 클라이언트 파일들 제공
app.use(express.static('src'));

// Swagger UI 설정
const swaggerSpec = getSwaggerSpec();
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Three D PC API Documentation',
  customfavIcon: '/favicon.ico'
}));

// Health check 엔드포인트
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

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

// 콜백 처리: JWT를 발급해 쿼리 파라미터로 토큰을 전달하여 HTML 페이지로 리다이렉트
app.get(
  '/auth/kakao/callback',
  passport.authenticate('kakao', { session: false, failureRedirect: '/login?error=kakao_auth_failed' }),
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
    // 토큰을 쿼리 파라미터로 전달하여 홈으로 리다이렉트 (클라이언트에서 처리)
    const params = new URLSearchParams({
      accessToken,
      refreshToken
    });
    res.redirect(`/?${params.toString()}`);
  }
);



// 보호된 라우트 예시: JWT 인증 필요
app.get('/api/profile', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    res.json(user);
  } catch (err) {
    console.error('Get profile error', err);
    sendErrorResponse(res, 500, 'INTERNAL_SERVER_ERROR', err.message);
  }
});

// 토큰 갱신 엔드포인트: refreshToken으로 새로운 accessToken 발급
app.post('/auth/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return sendErrorResponse(res, 401, 'AUTH_REFRESH_TOKEN_REQUIRED', 'Refresh token required');
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret');
    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!user) {
      return sendErrorResponse(res, 401, 'AUTH_USER_NOT_FOUND', 'User not found');
    }
    
    const newAccessToken = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_ACCESS_SECRET || 'dev_secret',
      { expiresIn: '1h' }
    );
    res.json({ accessToken: newAccessToken });
  } catch (err) {
    sendErrorResponse(res, 401, 'AUTH_INVALID_REFRESH_TOKEN', 'Invalid refresh token');
  }
});

// 로그아웃 엔드포인트: JWT 토큰 무효화 (선택적 인증)
app.post('/auth/logout', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    // 향후 refreshToken을 DB에 저장하는 경우 여기서 무효화할 수 있습니다
    // 현재는 클라이언트에서 토큰을 제거하는 것으로 충분합니다
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    console.error('Logout error', err);
    sendErrorResponse(res, 500, 'INTERNAL_SERVER_ERROR', err.message);
  }
});

// Role 기반 인가 미들웨어
const checkRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'Unauthorized');
    }
    if (!roles.includes(req.user.role)) {
      return sendErrorResponse(res, 403, 'AUTH_INSUFFICIENT_PERMISSIONS', 'Forbidden: insufficient permissions');
    }
    next();
  };
};

// 관리자만 접근 가능한 라우트 예시
app.get(
  '/admin/users',
  passport.authenticate('jwt', { session: false }),
  checkRole('ADMIN'),
  async (req, res) => {
    try {
      const users = await prisma.user.findMany({ select: { id: true, email: true, nickname: true, role: true, createdAt: true } });
      res.json(users);
    } catch (err) {
      console.error('Get users error', err);
      sendErrorResponse(res, 500, 'INTERNAL_SERVER_ERROR', err.message);
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
        return sendErrorResponse(res, 403, 'AUTH_FORBIDDEN', 'Forbidden: cannot modify other users');
      }
      const { nickname } = req.body;
      const updated = await prisma.user.update({
        where: { id: parseInt(userId) },
        data: { nickname },
      });
      res.json(updated);
    } catch (err) {
      console.error('Update profile error', err);
      sendErrorResponse(res, 500, 'INTERNAL_SERVER_ERROR', err.message);
    }
  }
);

// 관리자만 사용자 역할 변경 가능
app.patch(
  '/admin/users/:userId/role',
  passport.authenticate('jwt', { session: false }),
  checkRole('ADMIN'),
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { role } = req.body; // 'USER' 또는 'ADMIN'
      if (!['USER', 'ADMIN'].includes(role)) {
        return sendErrorResponse(res, 400, 'INVALID_ROLE', 'Invalid role', { role });
      }
      const updated = await prisma.user.update({
        where: { id: parseInt(userId) },
        data: { role },
      });
      res.json(updated);
    } catch (err) {
      console.error('Update user role error', err);
      sendErrorResponse(res, 500, 'INTERNAL_SERVER_ERROR', err.message);
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
  if (!idToken) {
    return sendErrorResponse(res, 400, 'AUTH_ID_TOKEN_REQUIRED', 'idToken required');
  }
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
    sendErrorResponse(res, 401, 'AUTH_INVALID_ID_TOKEN', 'Invalid ID token');
  }
});


// ============================================
// 상품 API 엔드포인트
// ============================================

// GET /api/products - 상품 목록 조회 (검색, 카테고리 필터, 페이징, 정렬)
app.get('/api/products', async (req, res) => {
  try {
    const {
      search,           // 검색어 (상품명, 제조사)
      categoryId,      // 카테고리 필터
      isActive,        // 활성화 여부 필터 (기본값: true)
      page = '1',      // 페이지 번호
      limit = '20',    // 페이지당 항목 수
      sortBy = 'createdAt', // 정렬 기준: createdAt, price, viewCount, name
      order = 'desc'   // 정렬 순서: asc, desc
    } = req.query;

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const skip = (pageNum - 1) * limitNum;

    // 정렬 옵션
    const sortOptions = {
      createdAt: { createdAt: order === 'asc' ? 'asc' : 'desc' },
      price: { price: order === 'asc' ? 'asc' : 'desc' },
      viewCount: { viewCount: order === 'asc' ? 'asc' : 'desc' },
      name: { name: order === 'asc' ? 'asc' : 'desc' }
    };
    const orderBy = sortOptions[sortBy] || sortOptions.createdAt;

    // 필터 조건 구성
    const where = {};
    
    // 활성화 여부 필터 (기본값: true만 조회)
    if (isActive !== undefined) {
      where.isActive = isActive === 'true' || isActive === true;
    } else {
      where.isActive = true; // 기본값: 활성화된 상품만
    }

    // 카테고리 필터
    if (categoryId) {
      where.categoryId = parseInt(categoryId);
    }

    // 검색 필터 (상품명 또는 제조사)
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { manufacturer: { contains: search } }
      ];
    }

    // 상품 목록 조회
    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          category: {
            select: { id: true, name: true }
          },
          specs: {
            select: { key: true, value: true }
          }
        },
        orderBy,
        skip,
        take: limitNum
      }),
      prisma.product.count({ where })
    ]);

    res.json({
      products,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (err) {
    console.error('Get products error', err);
    sendErrorResponse(res, 500, 'INTERNAL_SERVER_ERROR', err.message);
  }
});

// GET /api/products/:id - 특정 상품 상세 정보 조회 (스펙 포함)
app.get('/api/products/:id', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    if (isNaN(productId)) {
      return sendErrorResponse(res, 400, 'INVALID_PRODUCT_ID', 'Invalid product ID', { productId: req.params.id });
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        category: {
          select: { id: true, name: true, parentId: true }
        },
        specs: {
          select: { id: true, key: true, value: true }
        }
      }
    });

    if (!product) {
      return sendErrorResponse(res, 404, 'PRODUCT_NOT_FOUND', 'Product not found', { productId });
    }

    // 조회수 증가 (비동기로 처리하여 응답 속도에 영향 없도록)
    prisma.product.update({
      where: { id: productId },
      data: { viewCount: { increment: 1 } }
    }).catch(err => console.error('View count update error', err));

    res.json(product);
  } catch (err) {
    console.error('Get product detail error', err);
    sendErrorResponse(res, 500, 'INTERNAL_SERVER_ERROR', err.message);
  }
});

// GET /api/products/:id/price-history - 특정 상품의 가격 변동 내역 조회 (차트용 데이터)
app.get('/api/products/:id/price-history', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    if (isNaN(productId)) {
      return sendErrorResponse(res, 400, 'INVALID_PRODUCT_ID', 'Invalid product ID', { productId: req.params.id });
    }

    const { 
      startDate,  // 시작 날짜 (ISO string)
      endDate,    // 종료 날짜 (ISO string)
      limit = '100' // 최대 조회 개수
    } = req.query;

    // 상품 존재 확인
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true }
    });

    if (!product) {
      return sendErrorResponse(res, 404, 'PRODUCT_NOT_FOUND', 'Product not found', { productId });
    }

    // 필터 조건
    const where = { productId };
    if (startDate || endDate) {
      where.recordedAt = {};
      if (startDate) {
        where.recordedAt.gte = new Date(startDate);
      }
      if (endDate) {
        where.recordedAt.lte = new Date(endDate);
      }
    }

    const priceHistory = await prisma.priceHistory.findMany({
      where,
      orderBy: { recordedAt: 'asc' },
      take: parseInt(limit) || 100,
      select: {
        id: true,
        price: true,
        recordedAt: true
      }
    });

    res.json({
      productId,
      priceHistory,
      count: priceHistory.length
    });
  } catch (err) {
    console.error('Get price history error', err);
    sendErrorResponse(res, 500, 'INTERNAL_SERVER_ERROR', err.message);
  }
});

// POST /api/products - [Admin] 신규 상품 등록
app.post(
  '/api/products',
  passport.authenticate('jwt', { session: false }),
  checkRole('ADMIN'),
  async (req, res) => {
    try {
      const {
        categoryId,
        name,
        manufacturer,
        price,
        imageUrl,
        isActive = true,
        specs = [],      // [{ key: "Socket", value: "LGA1700" }, ...]
        detailInfo       // JSON 객체
      } = req.body;

      // 필수 필드 검증
      if (!categoryId || !name || !manufacturer || price === undefined) {
        return sendErrorResponse(res, 400, 'MISSING_REQUIRED_FIELDS', 'Missing required fields: categoryId, name, manufacturer, price', {
          provided: { categoryId, name, manufacturer, price }
        });
      }

      // 카테고리 존재 확인
      const category = await prisma.category.findUnique({
        where: { id: parseInt(categoryId) }
      });
      if (!category) {
        return sendErrorResponse(res, 400, 'CATEGORY_NOT_FOUND', 'Category not found', { categoryId });
      }

      // 상품 생성 (스펙 포함)
      const product = await prisma.product.create({
        data: {
          categoryId: parseInt(categoryId),
          name,
          manufacturer,
          price: parseInt(price),
          imageUrl: imageUrl || null,
          isActive: isActive === true || isActive === 'true',
          detailInfo: detailInfo || null,
          specs: {
            create: specs.map(spec => ({
              key: spec.key,
              value: spec.value
            }))
          }
        },
        include: {
          category: {
            select: { id: true, name: true }
          },
          specs: {
            select: { id: true, key: true, value: true }
          }
        }
      });

      // 가격 이력에 초기 가격 기록
      await prisma.priceHistory.create({
        data: {
          productId: product.id,
          price: product.price
        }
      });

      res.status(201).json(product);
    } catch (err) {
      console.error('Create product error', err);
      sendErrorResponse(res, 500, 'INTERNAL_SERVER_ERROR', err.message);
    }
  }
);

// PUT /api/products/:id - [Admin] 상품 정보 수정 (가격, 단종여부 등)
app.put(
  '/api/products/:id',
  passport.authenticate('jwt', { session: false }),
  checkRole('ADMIN'),
  async (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      if (isNaN(productId)) {
        return sendErrorResponse(res, 400, 'INVALID_PRODUCT_ID', 'Invalid product ID', { productId: req.params.id });
      }

      const {
        categoryId,
        name,
        manufacturer,
        price,
        imageUrl,
        isActive,
        specs,        // 전체 스펙 배열 (기존 스펙 삭제 후 재생성)
        detailInfo
      } = req.body;

      // 상품 존재 확인
      const existingProduct = await prisma.product.findUnique({
        where: { id: productId },
        include: { specs: true }
      });

      if (!existingProduct) {
        return sendErrorResponse(res, 404, 'PRODUCT_NOT_FOUND', 'Product not found', { productId });
      }

      // 업데이트할 데이터 구성
      const updateData = {};
      if (categoryId !== undefined) updateData.categoryId = parseInt(categoryId);
      if (name !== undefined) updateData.name = name;
      if (manufacturer !== undefined) updateData.manufacturer = manufacturer;
      if (price !== undefined) {
        const newPrice = parseInt(price);
        updateData.price = newPrice;
        
        // 가격이 변경된 경우 가격 이력에 기록
        if (newPrice !== existingProduct.price) {
          await prisma.priceHistory.create({
            data: {
              productId: productId,
              price: newPrice
            }
          });
        }
      }
      if (imageUrl !== undefined) updateData.imageUrl = imageUrl;
      if (isActive !== undefined) updateData.isActive = isActive === true || isActive === 'true';
      if (detailInfo !== undefined) updateData.detailInfo = detailInfo;

      // 트랜잭션으로 상품 업데이트 및 스펙 재생성
      const product = await prisma.$transaction(async (tx) => {
        // 스펙이 제공된 경우 기존 스펙 삭제 후 재생성
        if (specs !== undefined && Array.isArray(specs)) {
          await tx.productSpec.deleteMany({
            where: { productId: productId }
          });
        }

        // 상품 업데이트
        const updated = await tx.product.update({
          where: { id: productId },
          data: {
            ...updateData,
            ...(specs !== undefined && Array.isArray(specs) ? {
              specs: {
                create: specs.map(spec => ({
                  key: spec.key,
                  value: spec.value
                }))
              }
            } : {})
          },
          include: {
            category: {
              select: { id: true, name: true }
            },
            specs: {
              select: { id: true, key: true, value: true }
            }
          }
        });

        return updated;
      });

      res.json(product);
    } catch (err) {
      console.error('Update product error', err);
      sendErrorResponse(res, 500, 'INTERNAL_SERVER_ERROR', err.message);
    }
  }
);

// DELETE /api/products/:id - [Admin] 상품 삭제
app.delete(
  '/api/products/:id',
  passport.authenticate('jwt', { session: false }),
  checkRole('ADMIN'),
  async (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      if (isNaN(productId)) {
        return sendErrorResponse(res, 400, 'INVALID_PRODUCT_ID', 'Invalid product ID', { productId: req.params.id });
      }

      // 상품 존재 확인
      const product = await prisma.product.findUnique({
        where: { id: productId }
      });

      if (!product) {
        return sendErrorResponse(res, 404, 'PRODUCT_NOT_FOUND', 'Product not found', { productId });
      }

      // 상품 삭제 (CASCADE로 관련 데이터 자동 삭제)
      await prisma.product.delete({
        where: { id: productId }
      });

      res.json({ message: 'Product deleted successfully' });
    } catch (err) {
      console.error('Delete product error', err);
      sendErrorResponse(res, 500, 'INTERNAL_SERVER_ERROR', err.message);
    }
  }
);

// GET /api/products/:id/related - 연관 상품 추천 (같은 카테고리 인기 상품 등)
app.get('/api/products/:id/related', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    if (isNaN(productId)) {
      return sendErrorResponse(res, 400, 'INVALID_PRODUCT_ID', 'Invalid product ID', { productId: req.params.id });
    }

    const { limit = '5' } = req.query;
    const limitNum = parseInt(limit) || 5;

    // 현재 상품 정보 조회
    const currentProduct = await prisma.product.findUnique({
      where: { id: productId },
      select: { categoryId: true }
    });

    if (!currentProduct) {
      return sendErrorResponse(res, 404, 'PRODUCT_NOT_FOUND', 'Product not found', { productId });
    }

    // 같은 카테고리의 다른 상품 중 인기 상품 조회 (조회수 기준)
    const relatedProducts = await prisma.product.findMany({
      where: {
        categoryId: currentProduct.categoryId,
        id: { not: productId },  // 현재 상품 제외
        isActive: true
      },
      include: {
        category: {
          select: { id: true, name: true }
        },
        specs: {
          select: { key: true, value: true },
          take: 3  // 주요 스펙만 3개
        }
      },
      orderBy: [
        { viewCount: 'desc' },  // 조회수 높은 순
        { createdAt: 'desc' }   // 최신순
      ],
      take: limitNum
    });

    res.json({
      productId,
      relatedProducts,
      count: relatedProducts.length
    });
  } catch (err) {
    console.error('Get related products error', err);
    sendErrorResponse(res, 500, 'INTERNAL_SERVER_ERROR', err.message);
  }
});


// ============================================
// 카테고리 API 엔드포인트
// ============================================

// GET /categories - 전체 카테고리 목록 조회 (계층형 트리 구조 반환)
app.get('/api/categories', async (req, res) => {
  try {
    // 모든 카테고리 조회 (자식 포함)
    const allCategories = await prisma.category.findMany({
      include: {
        children: {
          include: {
            children: {
              include: {
                children: true  // 3단계 깊이까지 (필요시 더 깊게 가능)
              }
            }
          }
        },
        parent: {
          select: { id: true, name: true }
        },
        _count: {
          select: { products: true }  // 각 카테고리의 상품 개수
        }
      },
      orderBy: {
        name: 'asc'
      }
    });

    // 최상위 카테고리만 필터링 (parentId가 null인 것들)
    const rootCategories = allCategories.filter(cat => cat.parentId === null);

    // 재귀 함수로 트리 구조 구성
    const buildTree = (categories, parentId = null) => {
      return categories
        .filter(cat => cat.parentId === parentId)
        .map(cat => ({
          id: cat.id,
          name: cat.name,
          parentId: cat.parentId,
          productCount: cat._count.products,
          children: buildTree(categories, cat.id)
        }));
    };

    const tree = buildTree(allCategories);

    res.json({
      categories: tree,
      flat: allCategories.map(cat => ({
        id: cat.id,
        name: cat.name,
        parentId: cat.parentId,
        productCount: cat._count.products
      }))
    });
  } catch (err) {
    console.error('Get categories error', err);
    sendErrorResponse(res, 500, 'INTERNAL_SERVER_ERROR', err.message);
  }
});

// POST /api/categories - [Admin] 신규 카테고리 생성
app.post(
  '/api/categories',
  passport.authenticate('jwt', { session: false }),
  checkRole('ADMIN'),
  async (req, res) => {
    try {
      const { name, parentId } = req.body;

      // 필수 필드 검증
      if (!name) {
        return sendErrorResponse(res, 400, 'CATEGORY_NAME_REQUIRED', 'Category name is required');
      }

      // parentId가 제공된 경우 부모 카테고리 존재 확인
      if (parentId !== undefined && parentId !== null) {
        const parent = await prisma.category.findUnique({
          where: { id: parseInt(parentId) }
        });
        if (!parent) {
          return sendErrorResponse(res, 400, 'PARENT_CATEGORY_NOT_FOUND', 'Parent category not found', { parentId });
        }
      }

      // 카테고리 생성
      const category = await prisma.category.create({
        data: {
          name,
          parentId: parentId ? parseInt(parentId) : null
        },
        include: {
          parent: {
            select: { id: true, name: true }
          },
          children: {
            select: { id: true, name: true }
          },
          _count: {
            select: { products: true }
          }
        }
      });

      res.status(201).json(category);
    } catch (err) {
      console.error('Create category error', err);
      sendErrorResponse(res, 500, 'INTERNAL_SERVER_ERROR', err.message);
    }
  }
);

// PUT /api/categories/:id - [Admin] 카테고리 이름 수정
app.put(
  '/api/categories/:id',
  passport.authenticate('jwt', { session: false }),
  checkRole('ADMIN'),
  async (req, res) => {
    try {
      const categoryId = parseInt(req.params.id);
      if (isNaN(categoryId)) {
        return sendErrorResponse(res, 400, 'INVALID_CATEGORY_ID', 'Invalid category ID', { categoryId: req.params.id });
      }

      const { name, parentId } = req.body;

      // 카테고리 존재 확인
      const existingCategory = await prisma.category.findUnique({
        where: { id: categoryId }
      });

      if (!existingCategory) {
        return sendErrorResponse(res, 404, 'CATEGORY_NOT_FOUND', 'Category not found', { categoryId });
      }

      // 업데이트할 데이터 구성
      const updateData = {};
      if (name !== undefined) {
        if (!name || name.trim() === '') {
          return sendErrorResponse(res, 400, 'CATEGORY_NAME_EMPTY', 'Category name cannot be empty');
        }
        updateData.name = name.trim();
      }

      // parentId 변경 시 검증
      if (parentId !== undefined) {
        const newParentId = parentId === null ? null : parseInt(parentId);
        
        // 자기 자신을 부모로 설정하는 것 방지
        if (newParentId === categoryId) {
          return sendErrorResponse(res, 400, 'CATEGORY_SELF_PARENT', 'Category cannot be its own parent', { categoryId });
        }

        // 순환 참조 방지: 자식 카테고리를 부모로 설정하는 것 방지
        if (newParentId !== null) {
          const potentialParent = await prisma.category.findUnique({
            where: { id: newParentId },
            include: {
              children: {
                select: { id: true }
              }
            }
          });

          if (!potentialParent) {
            return sendErrorResponse(res, 400, 'PARENT_CATEGORY_NOT_FOUND', 'Parent category not found', { parentId: newParentId });
          }

          // 순환 참조 방지: 모든 자식 카테고리 ID 수집하여 확인
          const getAllDescendantIds = async (catId) => {
            const category = await prisma.category.findUnique({
              where: { id: catId },
              include: {
                children: {
                  include: {
                    children: {
                      include: {
                        children: true
                      }
                    }
                  }
                }
              }
            });

            const ids = [catId];
            const collectIds = (cats) => {
              cats.forEach(cat => {
                ids.push(cat.id);
                if (cat.children && cat.children.length > 0) {
                  collectIds(cat.children);
                }
              });
            };

            if (category && category.children) {
              collectIds(category.children);
            }
            return ids;
          };

          const descendantIds = await getAllDescendantIds(categoryId);
          if (descendantIds.includes(newParentId)) {
            return sendErrorResponse(res, 400, 'CATEGORY_CIRCULAR_REFERENCE', 'Cannot set a descendant category as parent (circular reference)', {
              categoryId,
              parentId: newParentId
            });
          }
        }

        updateData.parentId = newParentId;
      }

      // 카테고리 업데이트
      const updated = await prisma.category.update({
        where: { id: categoryId },
        data: updateData,
        include: {
          parent: {
            select: { id: true, name: true }
          },
          children: {
            select: { id: true, name: true }
          },
          _count: {
            select: { products: true }
          }
        }
      });

      res.json(updated);
    } catch (err) {
      console.error('Update category error', err);
      sendErrorResponse(res, 500, 'INTERNAL_SERVER_ERROR', err.message);
    }
  }
);


// ============================================
// 견적서 API 엔드포인트
// ============================================

// 선택적 JWT 인증 미들웨어 (비회원도 접근 가능)
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    passport.authenticate('jwt', { session: false }, (err, user) => {
      if (err) {
        // 토큰이 유효하지 않아도 계속 진행 (비회원으로 처리)
        req.user = null;
        return next();
      }
      req.user = user || null;
      next();
    })(req, res, next);
  } else {
    req.user = null;
    next();
  }
};

// POST /api/quotes - 신규 견적서 생성 (임시 저장)
app.post('/api/quotes', optionalAuth, async (req, res) => {
  try {
    const { title, description, items = [] } = req.body;

    // 필수 필드 검증
    if (!title || title.trim() === '') {
      return sendErrorResponse(res, 400, 'QUOTE_TITLE_REQUIRED', 'Title is required');
    }

    // items 검증 및 총 가격 계산
    let totalPrice = 0;
    const quoteItems = [];

    for (const item of items) {
      const { productId, quantity = 1 } = item;
      
      if (!productId) {
        return sendErrorResponse(res, 400, 'QUOTE_ITEM_PRODUCT_ID_REQUIRED', 'Product ID is required for each item');
      }

      // 상품 존재 확인 및 가격 조회
      const product = await prisma.product.findUnique({
        where: { id: parseInt(productId) },
        select: { id: true, price: true, isActive: true, name: true }
      });

      if (!product) {
        return sendErrorResponse(res, 400, 'PRODUCT_NOT_FOUND', `Product with ID ${productId} not found`, { productId });
      }

      if (!product.isActive) {
        return sendErrorResponse(res, 400, 'PRODUCT_NOT_ACTIVE', `Product ${product.name} is not active`, { productId, productName: product.name });
      }

      const qty = parseInt(quantity) || 1;
      const itemPrice = product.price * qty;
      totalPrice += itemPrice;

      quoteItems.push({
        productId: product.id,
        quantity: qty,
        priceAt: product.price
      });
    }

    // 견적서 생성
    const quote = await prisma.quote.create({
      data: {
        userId: req.user ? req.user.id : null,
        title: title.trim(),
        description: description ? description.trim() : null,
        totalPrice,
        isPublic: false, // 기본값: 비공개
        items: {
          create: quoteItems
        }
      },
      include: {
        user: {
          select: { id: true, email: true, nickname: true }
        },
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                manufacturer: true,
                price: true,
                imageUrl: true,
                category: {
                  select: { id: true, name: true }
                }
              }
            }
          }
        },
        _count: {
          select: { comments: true, likes: true }
        }
      }
    });

    res.status(201).json(quote);
  } catch (err) {
    console.error('Create quote error', err);
    sendErrorResponse(res, 500, 'INTERNAL_SERVER_ERROR', err.message);
  }
});

// GET /api/quotes - 공개된 견적서 목록 조회 (커뮤니티/랭킹)
app.get('/api/quotes', async (req, res) => {
  try {
    const {
      page = '1',
      limit = '20',
      sortBy = 'createdAt', // createdAt, viewCount, totalPrice, likes
      order = 'desc'
    } = req.query;

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const skip = (pageNum - 1) * limitNum;

    // 정렬 옵션
    const sortOptions = {
      createdAt: { createdAt: order === 'asc' ? 'asc' : 'desc' },
      viewCount: { viewCount: order === 'asc' ? 'asc' : 'desc' },
      totalPrice: { totalPrice: order === 'asc' ? 'asc' : 'desc' }
    };
    const orderBy = sortOptions[sortBy] || sortOptions.createdAt;

    // likes 정렬은 별도 처리 필요 (JOIN 필요)
    let quotes;
    let total;

    if (sortBy === 'likes') {
      // 좋아요 수로 정렬하려면 집계 쿼리 필요
      const allQuotes = await prisma.quote.findMany({
        where: { isPublic: true },
        include: {
          user: {
            select: { id: true, nickname: true }
          },
          _count: {
            select: { likes: true, comments: true, items: true }
          }
        }
      });

      // 좋아요 수로 정렬
      allQuotes.sort((a, b) => {
        const aLikes = a._count.likes;
        const bLikes = b._count.likes;
        return order === 'asc' ? aLikes - bLikes : bLikes - aLikes;
      });

      total = allQuotes.length;
      quotes = allQuotes.slice(skip, skip + limitNum);
    } else {
      [quotes, total] = await Promise.all([
        prisma.quote.findMany({
          where: { isPublic: true },
          include: {
            user: {
              select: { id: true, nickname: true }
            },
            _count: {
              select: { likes: true, comments: true, items: true }
            }
          },
          orderBy,
          skip,
          take: limitNum
        }),
        prisma.quote.count({ where: { isPublic: true } })
      ]);
    }

    res.json({
      quotes,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (err) {
    console.error('Get quotes error', err);
    sendErrorResponse(res, 500, 'INTERNAL_SERVER_ERROR', err.message);
  }
});

// GET /api/quotes/me - 내가 만든 견적서 목록 조회
app.get('/api/quotes/me', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const {
      page = '1',
      limit = '20',
      sortBy = 'createdAt',
      order = 'desc'
    } = req.query;

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const skip = (pageNum - 1) * limitNum;

    const sortOptions = {
      createdAt: { createdAt: order === 'asc' ? 'asc' : 'desc' },
      updatedAt: { updatedAt: order === 'asc' ? 'asc' : 'desc' },
      totalPrice: { totalPrice: order === 'asc' ? 'asc' : 'desc' }
    };
    const orderBy = sortOptions[sortBy] || sortOptions.createdAt;

    const [quotes, total] = await Promise.all([
      prisma.quote.findMany({
        where: { userId: req.user.id },
        include: {
          _count: {
            select: { items: true, comments: true, likes: true }
          }
        },
        orderBy,
        skip,
        take: limitNum
      }),
      prisma.quote.count({ where: { userId: req.user.id } })
    ]);

    res.json({
      quotes,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (err) {
    console.error('Get my quotes error', err);
    sendErrorResponse(res, 500, 'INTERNAL_SERVER_ERROR', err.message);
  }
});

// GET /api/quotes/:id - 견적서 상세 조회 (포함된 부품 목록)
app.get('/api/quotes/:id', optionalAuth, async (req, res) => {
  try {
    const quoteId = parseInt(req.params.id);
    if (isNaN(quoteId)) {
      return sendErrorResponse(res, 400, 'INVALID_QUOTE_ID', 'Invalid quote ID', { quoteId: req.params.id });
    }

    const quote = await prisma.quote.findUnique({
      where: { id: quoteId },
      include: {
        user: {
          select: { id: true, nickname: true, email: true }
        },
        items: {
          include: {
            product: {
              include: {
                category: {
                  select: { id: true, name: true }
                },
                specs: {
                  select: { key: true, value: true }
                }
              }
            }
          },
          orderBy: {
            id: 'asc'
          }
        },
        _count: {
          select: { comments: true, likes: true }
        }
      }
    });

    if (!quote) {
      return sendErrorResponse(res, 404, 'QUOTE_NOT_FOUND', 'Quote not found', { quoteId });
    }

    // 공개되지 않은 견적서는 본인 또는 ADMIN만 조회 가능
    if (!quote.isPublic) {
      if (!req.user || (req.user.id !== quote.userId && req.user.role !== 'ADMIN')) {
        return sendErrorResponse(res, 403, 'QUOTE_ACCESS_DENIED', 'Access denied');
      }
    }

    // 조회수 증가 (비동기)
    prisma.quote.update({
      where: { id: quoteId },
      data: { viewCount: { increment: 1 } }
    }).catch(err => console.error('View count update error', err));

    res.json(quote);
  } catch (err) {
    console.error('Get quote detail error', err);
    sendErrorResponse(res, 500, 'INTERNAL_SERVER_ERROR', err.message);
  }
});

// GET /api/quotes/share/:uuid - 공유 링크(UUID)를 통한 비회원 견적 조회
app.get('/api/quotes/share/:uuid', async (req, res) => {
  try {
    const { uuid } = req.params;

    const quote = await prisma.quote.findUnique({
      where: { shareUuid: uuid },
      include: {
        user: {
          select: { id: true, nickname: true }
        },
        items: {
          include: {
            product: {
              include: {
                category: {
                  select: { id: true, name: true }
                },
                specs: {
                  select: { key: true, value: true }
                }
              }
            }
          },
          orderBy: {
            id: 'asc'
          }
        },
        _count: {
          select: { comments: true, likes: true }
        }
      }
    });

    if (!quote) {
      return sendErrorResponse(res, 404, 'QUOTE_NOT_FOUND', 'Quote not found', { uuid });
    }

    // 조회수 증가 (비동기)
    prisma.quote.update({
      where: { shareUuid: uuid },
      data: { viewCount: { increment: 1 } }
    }).catch(err => console.error('View count update error', err));

    res.json(quote);
  } catch (err) {
    console.error('Get quote by UUID error', err);
    sendErrorResponse(res, 500, 'INTERNAL_SERVER_ERROR', err.message);
  }
});

// PUT /api/quotes/:id - 견적서 수정 (제목, 설명, 공개여부 변경)
app.put(
  '/api/quotes/:id',
  passport.authenticate('jwt', { session: false }),
  async (req, res) => {
    try {
      const quoteId = parseInt(req.params.id);
      if (isNaN(quoteId)) {
        return sendErrorResponse(res, 400, 'INVALID_QUOTE_ID', 'Invalid quote ID', { quoteId: req.params.id });
      }

      const { title, description, isPublic } = req.body;

      // 견적서 존재 확인
      const existingQuote = await prisma.quote.findUnique({
        where: { id: quoteId }
      });

      if (!existingQuote) {
        return sendErrorResponse(res, 404, 'QUOTE_NOT_FOUND', 'Quote not found', { quoteId });
      }

      // 본인 또는 ADMIN만 수정 가능
      if (existingQuote.userId !== req.user.id && req.user.role !== 'ADMIN') {
        return sendErrorResponse(res, 403, 'QUOTE_FORBIDDEN', 'Forbidden: cannot modify other users\' quotes');
      }

      // 업데이트할 데이터 구성
      const updateData = {};
      if (title !== undefined) {
        if (!title || title.trim() === '') {
          return sendErrorResponse(res, 400, 'QUOTE_TITLE_EMPTY', 'Title cannot be empty');
        }
        updateData.title = title.trim();
      }
      if (description !== undefined) {
        updateData.description = description ? description.trim() : null;
      }
      if (isPublic !== undefined) {
        updateData.isPublic = isPublic === true || isPublic === 'true';
      }

      const updated = await prisma.quote.update({
        where: { id: quoteId },
        data: updateData,
        include: {
          user: {
            select: { id: true, nickname: true }
          },
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  manufacturer: true,
                  price: true,
                  imageUrl: true
                }
              }
            }
          },
          _count: {
            select: { comments: true, likes: true }
          }
        }
      });

      res.json(updated);
    } catch (err) {
      console.error('Update quote error', err);
      sendErrorResponse(res, 500, 'INTERNAL_SERVER_ERROR', err.message);
    }
  }
);

// DELETE /api/quotes/:id - 견적서 삭제
app.delete(
  '/api/quotes/:id',
  passport.authenticate('jwt', { session: false }),
  async (req, res) => {
    try {
      const quoteId = parseInt(req.params.id);
      if (isNaN(quoteId)) {
        return sendErrorResponse(res, 400, 'INVALID_QUOTE_ID', 'Invalid quote ID', { quoteId: req.params.id });
      }

      // 견적서 존재 확인
      const quote = await prisma.quote.findUnique({
        where: { id: quoteId }
      });

      if (!quote) {
        return sendErrorResponse(res, 404, 'QUOTE_NOT_FOUND', 'Quote not found', { quoteId });
      }

      // 본인 또는 ADMIN만 삭제 가능
      if (quote.userId !== req.user.id && req.user.role !== 'ADMIN') {
        return sendErrorResponse(res, 403, 'QUOTE_FORBIDDEN', 'Forbidden: cannot delete other users\' quotes');
      }

      // 견적서 삭제 (CASCADE로 관련 데이터 자동 삭제)
      await prisma.quote.delete({
        where: { id: quoteId }
      });

      res.json({ message: 'Quote deleted successfully' });
    } catch (err) {
      console.error('Delete quote error', err);
      sendErrorResponse(res, 500, 'INTERNAL_SERVER_ERROR', err.message);
    }
  }
);

// POST /api/quotes/:id/items - 견적서에 부품 추가
app.post(
  '/api/quotes/:id/items',
  passport.authenticate('jwt', { session: false }),
  async (req, res) => {
    try {
      const quoteId = parseInt(req.params.id);
      if (isNaN(quoteId)) {
        return sendErrorResponse(res, 400, 'INVALID_QUOTE_ID', 'Invalid quote ID', { quoteId: req.params.id });
      }

      const { productId, quantity = 1 } = req.body;

      if (!productId) {
        return sendErrorResponse(res, 400, 'PRODUCT_ID_REQUIRED', 'Product ID is required');
      }

      // 견적서 존재 확인 및 권한 확인
      const quote = await prisma.quote.findUnique({
        where: { id: quoteId }
      });

      if (!quote) {
        return sendErrorResponse(res, 404, 'QUOTE_NOT_FOUND', 'Quote not found', { quoteId });
      }

      // 본인 또는 ADMIN만 수정 가능
      if (quote.userId !== req.user.id && req.user.role !== 'ADMIN') {
        return sendErrorResponse(res, 403, 'QUOTE_FORBIDDEN', 'Forbidden: cannot modify other users\' quotes');
      }

      // 상품 존재 확인
      const product = await prisma.product.findUnique({
        where: { id: parseInt(productId) },
        select: { id: true, price: true, isActive: true, name: true }
      });

      if (!product) {
        return sendErrorResponse(res, 400, 'PRODUCT_NOT_FOUND', 'Product not found', { productId });
      }

      if (!product.isActive) {
        return sendErrorResponse(res, 400, 'PRODUCT_NOT_ACTIVE', `Product ${product.name} is not active`, { productId, productName: product.name });
      }

      const qty = parseInt(quantity) || 1;
      const itemPrice = product.price * qty;

      // 부품 추가 및 총 가격 업데이트
      const result = await prisma.$transaction(async (tx) => {
        // 부품 추가
        const quoteItem = await tx.quoteItem.create({
          data: {
            quoteId,
            productId: product.id,
            quantity: qty,
            priceAt: product.price
          },
          include: {
            product: {
              include: {
                category: {
                  select: { id: true, name: true }
                }
              }
            }
          }
        });

        // 총 가격 재계산
        const allItems = await tx.quoteItem.findMany({
          where: { quoteId },
          select: { quantity: true, priceAt: true }
        });

        const newTotalPrice = allItems.reduce((sum, item) => sum + (item.priceAt * item.quantity), 0);

        // 견적서 총 가격 업데이트
        await tx.quote.update({
          where: { id: quoteId },
          data: { totalPrice: newTotalPrice }
        });

        return quoteItem;
      });

      res.status(201).json(result);
    } catch (err) {
      console.error('Add quote item error', err);
      sendErrorResponse(res, 500, 'INTERNAL_SERVER_ERROR', err.message);
    }
  }
);

// DELETE /api/quotes/:id/items/:itemId - 견적서에서 부품 제거
app.delete(
  '/api/quotes/:id/items/:itemId',
  passport.authenticate('jwt', { session: false }),
  async (req, res) => {
    try {
      const quoteId = parseInt(req.params.id);
      const itemId = parseInt(req.params.itemId);

      if (isNaN(quoteId) || isNaN(itemId)) {
        return sendErrorResponse(res, 400, 'INVALID_QUOTE_OR_ITEM_ID', 'Invalid quote ID or item ID', { quoteId: req.params.id, itemId: req.params.itemId });
      }

      // 견적서 존재 확인 및 권한 확인
      const quote = await prisma.quote.findUnique({
        where: { id: quoteId }
      });

      if (!quote) {
        return sendErrorResponse(res, 404, 'QUOTE_NOT_FOUND', 'Quote not found', { quoteId });
      }

      // 본인 또는 ADMIN만 수정 가능
      if (quote.userId !== req.user.id && req.user.role !== 'ADMIN') {
        return sendErrorResponse(res, 403, 'QUOTE_FORBIDDEN', 'Forbidden: cannot modify other users\' quotes');
      }

      // 부품 존재 확인
      const quoteItem = await prisma.quoteItem.findUnique({
        where: { id: itemId }
      });

      if (!quoteItem || quoteItem.quoteId !== quoteId) {
        return sendErrorResponse(res, 404, 'QUOTE_ITEM_NOT_FOUND', 'Quote item not found', { itemId, quoteId });
      }

      // 부품 제거 및 총 가격 업데이트
      await prisma.$transaction(async (tx) => {
        // 부품 삭제
        await tx.quoteItem.delete({
          where: { id: itemId }
        });

        // 총 가격 재계산
        const allItems = await tx.quoteItem.findMany({
          where: { quoteId },
          select: { quantity: true, priceAt: true }
        });

        const newTotalPrice = allItems.reduce((sum, item) => sum + (item.priceAt * item.quantity), 0);

        // 견적서 총 가격 업데이트
        await tx.quote.update({
          where: { id: quoteId },
          data: { totalPrice: newTotalPrice }
        });
      });

      res.json({ message: 'Quote item deleted successfully' });
    } catch (err) {
      console.error('Delete quote item error', err);
      sendErrorResponse(res, 500, 'INTERNAL_SERVER_ERROR', err.message);
    }
  }
);

// PUT /api/quotes/:id/items/:itemId - 견적서 내 부품 수량 변경
app.put(
  '/api/quotes/:id/items/:itemId',
  passport.authenticate('jwt', { session: false }),
  async (req, res) => {
    try {
      const quoteId = parseInt(req.params.id);
      const itemId = parseInt(req.params.itemId);

      if (isNaN(quoteId) || isNaN(itemId)) {
        return sendErrorResponse(res, 400, 'INVALID_QUOTE_OR_ITEM_ID', 'Invalid quote ID or item ID', { quoteId: req.params.id, itemId: req.params.itemId });
      }

      const { quantity } = req.body;

      if (quantity === undefined || quantity === null) {
        return sendErrorResponse(res, 400, 'QUANTITY_REQUIRED', 'Quantity is required');
      }

      const qty = parseInt(quantity);
      if (isNaN(qty) || qty < 1) {
        return sendErrorResponse(res, 400, 'INVALID_QUANTITY', 'Quantity must be a positive integer', { quantity });
      }

      // 견적서 존재 확인 및 권한 확인
      const quote = await prisma.quote.findUnique({
        where: { id: quoteId }
      });

      if (!quote) {
        return sendErrorResponse(res, 404, 'QUOTE_NOT_FOUND', 'Quote not found', { quoteId });
      }

      // 본인 또는 ADMIN만 수정 가능
      if (quote.userId !== req.user.id && req.user.role !== 'ADMIN') {
        return sendErrorResponse(res, 403, 'QUOTE_FORBIDDEN', 'Forbidden: cannot modify other users\' quotes');
      }

      // 부품 존재 확인
      const quoteItem = await prisma.quoteItem.findUnique({
        where: { id: itemId }
      });

      if (!quoteItem || quoteItem.quoteId !== quoteId) {
        return sendErrorResponse(res, 404, 'QUOTE_ITEM_NOT_FOUND', 'Quote item not found', { itemId, quoteId });
      }

      // 수량 변경 및 총 가격 업데이트
      const result = await prisma.$transaction(async (tx) => {
        // 부품 수량 업데이트
        const updatedItem = await tx.quoteItem.update({
          where: { id: itemId },
          data: { quantity: qty },
          include: {
            product: {
              include: {
                category: {
                  select: { id: true, name: true }
                }
              }
            }
          }
        });

        // 총 가격 재계산
        const allItems = await tx.quoteItem.findMany({
          where: { quoteId },
          select: { quantity: true, priceAt: true }
        });

        const newTotalPrice = allItems.reduce((sum, item) => sum + (item.priceAt * item.quantity), 0);

        // 견적서 총 가격 업데이트
        await tx.quote.update({
          where: { id: quoteId },
          data: { totalPrice: newTotalPrice }
        });

        return updatedItem;
      });

      res.json(result);
    } catch (err) {
      console.error('Update quote item quantity error', err);
      sendErrorResponse(res, 500, 'INTERNAL_SERVER_ERROR', err.message);
    }
  }
);

// ============================================
// 호환성 검사 API
// ============================================

// GET /api/compatibility/check - 견적서 내 부품 간 호환성 검사
app.get('/api/compatibility/check', async (req, res) => {
  try {
    const { quoteId } = req.query;

    if (!quoteId) {
      return sendErrorResponse(res, 400, 'QUOTE_ID_REQUIRED', 'quoteId is required');
    }

    const quoteIdNum = parseInt(quoteId);
    if (isNaN(quoteIdNum)) {
      return sendErrorResponse(res, 400, 'INVALID_QUOTE_ID', 'Invalid quote ID', { quoteId });
    }

    // 견적서 조회 (부품 및 스펙 포함)
    const quote = await prisma.quote.findUnique({
      where: { id: quoteIdNum },
      include: {
        items: {
          include: {
            product: {
              include: {
                category: {
                  select: { id: true, name: true }
                },
                specs: {
                  select: { key: true, value: true }
                }
              }
            }
          }
        }
      }
    });

    if (!quote) {
      return sendErrorResponse(res, 404, 'QUOTE_NOT_FOUND', 'Quote not found', { quoteId: quoteIdNum });
    }

    if (quote.items.length === 0) {
      return res.json({
        quoteId: quoteIdNum,
        compatible: true,
        issues: [],
        warnings: [],
        summary: 'No items in quote'
      });
    }

    // 부품을 카테고리별로 분류
    const productsByCategory = {};
    const allSpecs = {};

    quote.items.forEach(item => {
      const product = item.product;
      const categoryName = product.category.name.toLowerCase();
      
      if (!productsByCategory[categoryName]) {
        productsByCategory[categoryName] = [];
      }
      productsByCategory[categoryName].push(product);

      // 스펙을 key-value로 변환
      const productSpecs = {};
      product.specs.forEach(spec => {
        productSpecs[spec.key.toLowerCase()] = spec.value;
      });
      allSpecs[product.id] = productSpecs;
    });

    const issues = [];
    const warnings = [];

    // 1. CPU Socket vs Motherboard Socket 호환성
    const cpus = productsByCategory['cpu'] || productsByCategory['processor'] || [];
    const motherboards = productsByCategory['motherboard'] || productsByCategory['mainboard'] || [];

    if (cpus.length > 0 && motherboards.length > 0) {
      const cpu = cpus[0];
      const motherboard = motherboards[0];
      
      const cpuSocket = allSpecs[cpu.id]?.['socket'] || allSpecs[cpu.id]?.['cpu socket'];
      const mbSocket = allSpecs[motherboard.id]?.['socket'] || allSpecs[motherboard.id]?.['cpu socket'];

      if (cpuSocket && mbSocket) {
        if (cpuSocket.toLowerCase() !== mbSocket.toLowerCase()) {
          issues.push({
            type: 'incompatible',
            severity: 'error',
            component1: { name: cpu.name, spec: 'Socket', value: cpuSocket },
            component2: { name: motherboard.name, spec: 'Socket', value: mbSocket },
            message: `CPU socket (${cpuSocket}) does not match motherboard socket (${mbSocket})`
          });
        }
      } else if (!cpuSocket || !mbSocket) {
        warnings.push({
          type: 'missing_spec',
          severity: 'warning',
          message: 'Socket information missing for CPU or Motherboard'
        });
      }
    }

    // 2. Memory Type 호환성 (DDR4 vs DDR5)
    const memories = productsByCategory['memory'] || productsByCategory['ram'] || [];
    
    if (memories.length > 0 && motherboards.length > 0) {
      const motherboard = motherboards[0];
      const mbMemoryType = allSpecs[motherboard.id]?.['memory type'] || 
                          allSpecs[motherboard.id]?.['memory'] ||
                          allSpecs[motherboard.id]?.['ddr'];

      memories.forEach(memory => {
        const memType = allSpecs[memory.id]?.['type'] || 
                       allSpecs[memory.id]?.['memory type'] ||
                       allSpecs[memory.id]?.['ddr'];

        if (mbMemoryType && memType) {
          if (mbMemoryType.toLowerCase() !== memType.toLowerCase()) {
            issues.push({
              type: 'incompatible',
              severity: 'error',
              component1: { name: memory.name, spec: 'Memory Type', value: memType },
              component2: { name: motherboard.name, spec: 'Memory Type', value: mbMemoryType },
              message: `Memory type (${memType}) does not match motherboard supported type (${mbMemoryType})`
            });
          }
        }
      });
    }

    // 3. Form Factor 호환성 (Case vs Motherboard)
    const cases = productsByCategory['case'] || productsByCategory['chassis'] || [];
    
    if (cases.length > 0 && motherboards.length > 0) {
      const caseProduct = cases[0];
      const motherboard = motherboards[0];
      
      const caseFormFactor = allSpecs[caseProduct.id]?.['form factor'] || 
                             allSpecs[caseProduct.id]?.['supported form factor'];
      const mbFormFactor = allSpecs[motherboard.id]?.['form factor'];

      if (caseFormFactor && mbFormFactor) {
        // 케이스는 보통 여러 Form Factor를 지원하므로, 포함 여부 확인
        const supportedFormFactors = caseFormFactor.toLowerCase().split(/[,\/]/).map(f => f.trim());
        const mbFormFactorLower = mbFormFactor.toLowerCase();

        if (!supportedFormFactors.some(ff => ff.includes(mbFormFactorLower) || mbFormFactorLower.includes(ff))) {
          warnings.push({
            type: 'form_factor',
            severity: 'warning',
            component1: { name: caseProduct.name, spec: 'Form Factor', value: caseFormFactor },
            component2: { name: motherboard.name, spec: 'Form Factor', value: mbFormFactor },
            message: `Motherboard form factor (${mbFormFactor}) may not be fully compatible with case (${caseFormFactor})`
          });
        }
      }
    }

    // 4. Power Supply Wattage 체크
    const psus = productsByCategory['power supply'] || productsByCategory['psu'] || [];
    
    if (psus.length > 0) {
      const psu = psus[0];
      const psuWattage = parseInt(allSpecs[psu.id]?.['wattage'] || 
                                  allSpecs[psu.id]?.['power'] ||
                                  allSpecs[psu.id]?.['w'] || '0');

      // 총 전력 소비량 추정 (간단한 계산)
      let estimatedPower = 0;
      quote.items.forEach(item => {
        const product = item.product;
        const categoryName = product.category.name.toLowerCase();
        
        // 카테고리별 대략적인 전력 소비량 추정
        if (categoryName.includes('cpu')) {
          estimatedPower += 150; // CPU 평균
        } else if (categoryName.includes('gpu') || categoryName.includes('graphics')) {
          estimatedPower += 250; // GPU 평균
        } else if (categoryName.includes('motherboard') || categoryName.includes('mainboard')) {
          estimatedPower += 50;
        } else if (categoryName.includes('memory') || categoryName.includes('ram')) {
          estimatedPower += 10 * item.quantity;
        } else if (categoryName.includes('ssd') || categoryName.includes('hdd')) {
          estimatedPower += 10;
        } else {
          estimatedPower += 20; // 기타
        }
      });

      // 20% 여유분 추가
      const recommendedWattage = Math.ceil(estimatedPower * 1.2);

      if (psuWattage > 0 && psuWattage < recommendedWattage) {
        warnings.push({
          type: 'power_supply',
          severity: 'warning',
          component: { name: psu.name, spec: 'Wattage', value: `${psuWattage}W` },
          message: `Power supply wattage (${psuWattage}W) may be insufficient. Recommended: ${recommendedWattage}W or higher`,
          estimatedPower,
          recommendedWattage
        });
      }
    } else {
      warnings.push({
        type: 'missing_component',
        severity: 'warning',
        message: 'No power supply found in quote'
      });
    }

    // 5. CPU Cooler Socket 호환성
    const coolers = productsByCategory['cpu cooler'] || productsByCategory['cooler'] || [];
    
    if (coolers.length > 0 && cpus.length > 0) {
      const cooler = coolers[0];
      const cpu = cpus[0];
      
      const coolerSocket = allSpecs[cooler.id]?.['socket'] || 
                          allSpecs[cooler.id]?.['supported socket'];
      const cpuSocket = allSpecs[cpu.id]?.['socket'] || allSpecs[cpu.id]?.['cpu socket'];

      if (coolerSocket && cpuSocket) {
        const supportedSockets = coolerSocket.toLowerCase().split(/[,\/]/).map(s => s.trim());
        const cpuSocketLower = cpuSocket.toLowerCase();

        if (!supportedSockets.some(s => s.includes(cpuSocketLower) || cpuSocketLower.includes(s))) {
          issues.push({
            type: 'incompatible',
            severity: 'error',
            component1: { name: cooler.name, spec: 'Socket', value: coolerSocket },
            component2: { name: cpu.name, spec: 'Socket', value: cpuSocket },
            message: `CPU cooler socket (${coolerSocket}) does not support CPU socket (${cpuSocket})`
          });
        }
      }
    }

    const compatible = issues.filter(i => i.severity === 'error').length === 0;

    res.json({
      quoteId: quoteIdNum,
      compatible,
      issues: issues.filter(i => i.severity === 'error'),
      warnings: [...warnings, ...issues.filter(i => i.severity === 'warning')],
      summary: compatible 
        ? 'All components are compatible' 
        : `${issues.filter(i => i.severity === 'error').length} compatibility issue(s) found`
    });
  } catch (err) {
    console.error('Compatibility check error', err);
    sendErrorResponse(res, 500, 'INTERNAL_SERVER_ERROR', err.message);
  }
});

// ============================================
// 견적서 복사 (Fork) API
// ============================================

// POST /api/quotes/:id/copy - 다른 사람의 견적을 내 견적함으로 복사해오기 (Fork 기능)
app.post(
  '/api/quotes/:id/copy',
  passport.authenticate('jwt', { session: false }),
  async (req, res) => {
    try {
      const quoteId = parseInt(req.params.id);
      if (isNaN(quoteId)) {
        return sendErrorResponse(res, 400, 'INVALID_QUOTE_ID', 'Invalid quote ID', { quoteId: req.params.id });
      }

      // 원본 견적서 조회
      const originalQuote = await prisma.quote.findUnique({
        where: { id: quoteId },
        include: {
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  price: true,
                  isActive: true
                }
              }
            }
          }
        }
      });

      if (!originalQuote) {
        return sendErrorResponse(res, 404, 'QUOTE_NOT_FOUND', 'Quote not found', { quoteId });
      }

      // 비활성화된 상품이 있는지 확인
      const inactiveProducts = originalQuote.items.filter(
        item => !item.product.isActive
      );

      if (inactiveProducts.length > 0) {
        return sendErrorResponse(res, 400, 'QUOTE_HAS_INACTIVE_PRODUCTS', 'Cannot copy quote with inactive products', {
          inactiveProducts: inactiveProducts.map(item => ({
            productId: item.productId,
            productName: item.product.name
          }))
        });
      }

      // 견적서 복사 (트랜잭션)
      const newQuote = await prisma.$transaction(async (tx) => {
        // 새 견적서 생성
        const copiedQuote = await tx.quote.create({
          data: {
            userId: req.user.id,
            title: `${originalQuote.title} (Copy)`,
            description: originalQuote.description 
              ? `${originalQuote.description}\n\n[Forked from quote #${originalQuote.id}]`
              : `[Forked from quote #${originalQuote.id}]`,
            totalPrice: originalQuote.totalPrice,
            isPublic: false, // 복사본은 기본적으로 비공개
            items: {
              create: originalQuote.items.map(item => ({
                productId: item.productId,
                quantity: item.quantity,
                priceAt: item.priceAt
              }))
            }
          },
          include: {
            user: {
              select: { id: true, nickname: true }
            },
            items: {
              include: {
                product: {
                  include: {
                    category: {
                      select: { id: true, name: true }
                    }
                  }
                }
              }
            },
            _count: {
              select: { items: true, comments: true, likes: true }
            }
          }
        });

        return copiedQuote;
      });

      res.status(201).json({
        message: 'Quote copied successfully',
        quote: newQuote,
        originalQuoteId: originalQuote.id
      });
    } catch (err) {
      console.error('Copy quote error', err);
      sendErrorResponse(res, 500, 'INTERNAL_SERVER_ERROR', err.message);
    }
  }
);

// ============================================
// 댓글 API 엔드포인트
// ============================================

// POST /api/products/:id/comments - 상품에 댓글 달기
app.post(
  '/api/products/:id/comments',
  passport.authenticate('jwt', { session: false }),
  async (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      if (isNaN(productId)) {
        return sendErrorResponse(res, 400, 'INVALID_PRODUCT_ID', 'Invalid product ID', { productId: req.params.id });
      }

      const { content } = req.body;

      if (!content || content.trim() === '') {
        return sendErrorResponse(res, 400, 'COMMENT_CONTENT_REQUIRED', 'Comment content is required');
      }

      // 상품 존재 확인
      const product = await prisma.product.findUnique({
        where: { id: productId }
      });

      if (!product) {
        return sendErrorResponse(res, 404, 'PRODUCT_NOT_FOUND', 'Product not found', { productId });
      }

      // 댓글 생성
      const comment = await prisma.comment.create({
        data: {
          userId: req.user.id,
          productId: productId,
          content: content.trim()
        },
        include: {
          user: {
            select: { id: true, nickname: true, email: true }
          },
          product: {
            select: { id: true, name: true }
          }
        }
      });

      res.status(201).json(comment);
    } catch (err) {
      console.error('Create product comment error', err);
      sendErrorResponse(res, 500, 'INTERNAL_SERVER_ERROR', err.message);
    }
  }
);

// GET /api/products/:id/comments - 상품 댓글 목록 조회
app.get('/api/products/:id/comments', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    if (isNaN(productId)) {
      return sendErrorResponse(res, 400, 'INVALID_PRODUCT_ID', 'Invalid product ID', { productId: req.params.id });
    }

    const {
      page = '1',
      limit = '20',
      sortBy = 'createdAt',
      order = 'desc'
    } = req.query;

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const skip = (pageNum - 1) * limitNum;

    // 상품 존재 확인
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true }
    });

    if (!product) {
      return sendErrorResponse(res, 404, 'PRODUCT_NOT_FOUND', 'Product not found', { productId });
    }

    const sortOptions = {
      createdAt: { createdAt: order === 'asc' ? 'asc' : 'desc' },
      updatedAt: { updatedAt: order === 'asc' ? 'asc' : 'desc' }
    };
    const orderBy = sortOptions[sortBy] || sortOptions.createdAt;

    const [comments, total] = await Promise.all([
      prisma.comment.findMany({
        where: { productId: productId },
        include: {
          user: {
            select: { id: true, nickname: true }
          }
        },
        orderBy,
        skip,
        take: limitNum
      }),
      prisma.comment.count({ where: { productId: productId } })
    ]);

    res.json({
      comments,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (err) {
    console.error('Get product comments error', err);
    sendErrorResponse(res, 500, 'INTERNAL_SERVER_ERROR', err.message);
  }
});

// POST /api/quotes/:id/comments - 견적서에 댓글 달기 (조언 구하기 등)
app.post(
  '/api/quotes/:id/comments',
  passport.authenticate('jwt', { session: false }),
  async (req, res) => {
    try {
      const quoteId = parseInt(req.params.id);
      if (isNaN(quoteId)) {
        return sendErrorResponse(res, 400, 'INVALID_QUOTE_ID', 'Invalid quote ID', { quoteId: req.params.id });
      }

      const { content } = req.body;

      if (!content || content.trim() === '') {
        return sendErrorResponse(res, 400, 'COMMENT_CONTENT_REQUIRED', 'Comment content is required');
      }

      // 견적서 존재 확인
      const quote = await prisma.quote.findUnique({
        where: { id: quoteId }
      });

      if (!quote) {
        return sendErrorResponse(res, 404, 'QUOTE_NOT_FOUND', 'Quote not found', { quoteId });
      }

      // 댓글 생성
      const comment = await prisma.comment.create({
        data: {
          userId: req.user.id,
          quoteId: quoteId,
          content: content.trim()
        },
        include: {
          user: {
            select: { id: true, nickname: true, email: true }
          },
          quote: {
            select: { id: true, title: true }
          }
        }
      });

      res.status(201).json(comment);
    } catch (err) {
      console.error('Create quote comment error', err);
      sendErrorResponse(res, 500, 'INTERNAL_SERVER_ERROR', err.message);
    }
  }
);

// GET /api/quotes/:id/comments - 견적서 댓글 목록 조회
app.get('/api/quotes/:id/comments', async (req, res) => {
  try {
    const quoteId = parseInt(req.params.id);
    if (isNaN(quoteId)) {
      return sendErrorResponse(res, 400, 'INVALID_QUOTE_ID', 'Invalid quote ID', { quoteId: req.params.id });
    }

    const {
      page = '1',
      limit = '20',
      sortBy = 'createdAt',
      order = 'desc'
    } = req.query;

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const skip = (pageNum - 1) * limitNum;

    // 견적서 존재 확인
    const quote = await prisma.quote.findUnique({
      where: { id: quoteId },
      select: { id: true }
    });

    if (!quote) {
      return sendErrorResponse(res, 404, 'QUOTE_NOT_FOUND', 'Quote not found', { quoteId });
    }

    const sortOptions = {
      createdAt: { createdAt: order === 'asc' ? 'asc' : 'desc' },
      updatedAt: { updatedAt: order === 'asc' ? 'asc' : 'desc' }
    };
    const orderBy = sortOptions[sortBy] || sortOptions.createdAt;

    const [comments, total] = await Promise.all([
      prisma.comment.findMany({
        where: { quoteId: quoteId },
        include: {
          user: {
            select: { id: true, nickname: true }
          }
        },
        orderBy,
        skip,
        take: limitNum
      }),
      prisma.comment.count({ where: { quoteId: quoteId } })
    ]);

    res.json({
      comments,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (err) {
    console.error('Get quote comments error', err);
    sendErrorResponse(res, 500, 'INTERNAL_SERVER_ERROR', err.message);
  }
});

// DELETE /comments/:id - 댓글 삭제 (작성자 본인 또는 ADMIN만)
app.delete(
  '/comments/:id',
  passport.authenticate('jwt', { session: false }),
  async (req, res) => {
    try {
      const commentId = parseInt(req.params.id);
      if (isNaN(commentId)) {
        return sendErrorResponse(res, 400, 'INVALID_COMMENT_ID', 'Invalid comment ID', { commentId: req.params.id });
      }

      // 댓글 존재 확인
      const comment = await prisma.comment.findUnique({
        where: { id: commentId }
      });

      if (!comment) {
        return sendErrorResponse(res, 404, 'COMMENT_NOT_FOUND', 'Comment not found', { commentId });
      }

      // 본인 또는 ADMIN만 삭제 가능
      if (comment.userId !== req.user.id && req.user.role !== 'ADMIN') {
        return sendErrorResponse(res, 403, 'COMMENT_FORBIDDEN', 'Forbidden: cannot delete other users\' comments');
      }

      // 댓글 삭제
      await prisma.comment.delete({
        where: { id: commentId }
      });

      res.json({ message: 'Comment deleted successfully' });
    } catch (err) {
      console.error('Delete comment error', err);
      sendErrorResponse(res, 500, 'INTERNAL_SERVER_ERROR', err.message);
    }
  }
);

// ============================================
// 좋아요 API 엔드포인트
// ============================================

// POST /products/:id/like - 상품 좋아요 토글 (찜하기)
app.post(
  '/products/:id/like',
  passport.authenticate('jwt', { session: false }),
  async (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      if (isNaN(productId)) {
        return sendErrorResponse(res, 400, 'INVALID_PRODUCT_ID', 'Invalid product ID', { productId: req.params.id });
      }

      // 상품 존재 확인
      const product = await prisma.product.findUnique({
        where: { id: productId }
      });

      if (!product) {
        return sendErrorResponse(res, 404, 'PRODUCT_NOT_FOUND', 'Product not found', { productId });
      }

      // 기존 좋아요 확인
      const existingLike = await prisma.like.findFirst({
        where: {
          userId: req.user.id,
          productId: productId
        }
      });

      let like;
      let action;

      if (existingLike) {
        // 좋아요 취소
        await prisma.like.delete({
          where: { id: existingLike.id }
        });
        action = 'unliked';
      } else {
        // 좋아요 추가
        like = await prisma.like.create({
          data: {
            userId: req.user.id,
            productId: productId
          },
          include: {
            user: {
              select: { id: true, nickname: true }
            },
            product: {
              select: { id: true, name: true }
            }
          }
        });
        action = 'liked';
      }

      // 현재 좋아요 개수 조회
      const likeCount = await prisma.like.count({
        where: { productId: productId }
      });

      res.json({
        action,
        liked: action === 'liked',
        likeCount,
        like: like || null
      });
    } catch (err) {
      console.error('Toggle product like error', err);
      sendErrorResponse(res, 500, 'INTERNAL_SERVER_ERROR', err.message);
    }
  }
);

// POST /quotes/:id/like - 견적서 좋아요 토글 (추천하기)
app.post(
  '/quotes/:id/like',
  passport.authenticate('jwt', { session: false }),
  async (req, res) => {
    try {
      const quoteId = parseInt(req.params.id);
      if (isNaN(quoteId)) {
        return sendErrorResponse(res, 400, 'INVALID_QUOTE_ID', 'Invalid quote ID', { quoteId: req.params.id });
      }

      // 견적서 존재 확인
      const quote = await prisma.quote.findUnique({
        where: { id: quoteId }
      });

      if (!quote) {
        return sendErrorResponse(res, 404, 'QUOTE_NOT_FOUND', 'Quote not found', { quoteId });
      }

      // 기존 좋아요 확인
      const existingLike = await prisma.like.findFirst({
        where: {
          userId: req.user.id,
          quoteId: quoteId
        }
      });

      let like;
      let action;

      if (existingLike) {
        // 좋아요 취소
        await prisma.like.delete({
          where: { id: existingLike.id }
        });
        action = 'unliked';
      } else {
        // 좋아요 추가
        like = await prisma.like.create({
          data: {
            userId: req.user.id,
            quoteId: quoteId
          },
          include: {
            user: {
              select: { id: true, nickname: true }
            },
            quote: {
              select: { id: true, title: true }
            }
          }
        });
        action = 'liked';
      }

      // 현재 좋아요 개수 조회
      const likeCount = await prisma.like.count({
        where: { quoteId: quoteId }
      });

      res.json({
        action,
        liked: action === 'liked',
        likeCount,
        like: like || null
      });
    } catch (err) {
      console.error('Toggle quote like error', err);
      sendErrorResponse(res, 500, 'INTERNAL_SERVER_ERROR', err.message);
    }
  }
);

// GET /users/me/likes - 내가 좋아요 한 상품/견적 모아보기
app.get(
  '/users/me/likes',
  passport.authenticate('jwt', { session: false }),
  async (req, res) => {
    try {
      const {
        type,        // 'product' 또는 'quote' 또는 'all' (기본값: 'all')
        page = '1',
        limit = '20',
        sortBy = 'createdAt',
        order = 'desc'
      } = req.query;

      const pageNum = parseInt(page) || 1;
      const limitNum = parseInt(limit) || 20;
      const skip = (pageNum - 1) * limitNum;

      const sortOptions = {
        createdAt: { createdAt: order === 'asc' ? 'asc' : 'desc' }
      };
      const orderBy = sortOptions[sortBy] || sortOptions.createdAt;

      // 필터 조건
      const where = { userId: req.user.id };
      if (type === 'product') {
        where.productId = { not: null };
      } else if (type === 'quote') {
        where.quoteId = { not: null };
      }

      // include 조건 구성
      const includeOptions = {};
      if (type === 'product' || type === 'all') {
        includeOptions.product = {
          include: {
            category: {
              select: { id: true, name: true }
            },
            specs: {
              select: { key: true, value: true },
              take: 3
            }
          }
        };
      }
      if (type === 'quote' || type === 'all') {
        includeOptions.quote = {
          include: {
            user: {
              select: { id: true, nickname: true }
            },
            _count: {
              select: { items: true, comments: true, likes: true }
            }
          }
        };
      }

      const [likes, total] = await Promise.all([
        prisma.like.findMany({
          where,
          include: includeOptions,
          orderBy,
          skip,
          take: limitNum
        }),
        prisma.like.count({ where })
      ]);

      // 상품과 견적을 분리
      const products = likes.filter(like => like.product).map(like => ({
        ...like.product,
        likedAt: like.createdAt
      }));

      const quotes = likes.filter(like => like.quote).map(like => ({
        ...like.quote,
        likedAt: like.createdAt
      }));

      res.json({
        products,
        quotes,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum)
        }
      });
    } catch (err) {
      console.error('Get my likes error', err);
      sendErrorResponse(res, 500, 'INTERNAL_SERVER_ERROR', err.message);
    }
  }
);

// SPA를 위한 catch-all 라우트: API 경로가 아닌 모든 GET 요청은 index.html 반환
// Express 5 호환: app.use() 미들웨어 사용
app.use((req, res, next) => {
  // GET 요청만 처리
  if (req.method !== 'GET') {
    return next();
  }
  
  // API 경로나 인증 경로는 제외
  if (req.path.startsWith('/api/') || req.path.startsWith('/auth/')) {
    return next();
  }
  
  // 확장자가 있는 파일 요청은 제외 (정적 파일)
  if (req.path.includes('.')) {
    return next();
  }
  
  // 나머지 모든 경로는 index.html 반환 (클라이언트 사이드 라우팅 처리)
  res.sendFile('index.html', { root: 'src' });
});

const port = process.env.PORT || 8080;

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
