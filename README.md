# Three D PC - PC 견적 시스템

PC 부품 견적을 생성하고 공유할 수 있는 웹 애플리케이션입니다.

## 기능

- PC 부품 카탈로그 조회
- 견적서 생성 및 관리
- 부품 호환성 검사
- 커뮤니티 견적 공유
- 소셜 로그인 (Google, Kakao)

## 사전 요구사항

### Docker로 실행하는 경우
- Docker (20.10 이상)
- Docker Compose (2.0 이상)

### 로컬에서 실행하는 경우
- Node.js (20.x 이상)
- npm 또는 yarn
- MariaDB/MySQL (10.11 이상)

## 빠른 시작

### 방법 1: Docker로 실행 (권장)

1. **저장소 클론**
   ```bash
   git clone <repository-url>
   cd three_d_pc
   ```

2. **환경 변수 파일 생성**
   
   프로젝트 루트에 `.env` 파일을 생성하고 다음 내용을 작성하세요:
   
   ```env
   # 데이터베이스 설정
   DATABASE_HOST=localhost
   DATABASE_PORT=3306
   DATABASE_USER=threedpc_user
   DATABASE_PASSWORD=your_secure_password_here
   DATABASE_NAME=threedpc_db
   # DB_ROOT_PASSWORD는 Docker Compose에서 MariaDB 컨테이너의 root 비밀번호 설정용 (선택사항, 기본값: rootpassword)
   DB_ROOT_PASSWORD=your_root_password_here
   
   # JWT 시크릿 키 (반드시 강력한 랜덤 문자열로 변경하세요!)
   JWT_ACCESS_SECRET=your-super-secret-jwt-access-key-change-this
   JWT_REFRESH_SECRET=your-super-secret-jwt-refresh-key-change-this
   
   # 카카오 OAuth 설정
   KAKAO_CLIENT_ID=your_kakao_client_id
   KAKAO_CLIENT_SECRET=your_kakao_client_secret
   KAKAO_CALLBACK_URL=http://localhost:8080/auth/kakao/callback
   
   # Firebase 서비스 계정 (JSON을 문자열로 변환)
   # Firebase 콘솔에서 서비스 계정 키를 다운로드한 후, JSON 내용을 한 줄로 변환
   FIREBASE_SERVICE_ACCOUNT='{"type":"service_account","project_id":"..."}'
   
   # 애플리케이션 포트 (선택사항)
   APP_PORT=8080
   PORT=8080
   ```

3. **Firebase 서비스 계정 설정**
   
   Firebase 콘솔에서 서비스 계정 키를 다운로드한 후, JSON 파일의 전체 내용을 한 줄로 변환하여 `.env` 파일의 `FIREBASE_SERVICE_ACCOUNT`에 설정하세요.
   
   > **참고:** JSON 파일의 내용을 그대로 복사하여 한 줄로 만들어서 설정하면 됩니다. 
   > 예: `FIREBASE_SERVICE_ACCOUNT='{"type":"service_account","project_id":"...","private_key":"..."}'`

4. **Docker Compose로 실행**
   ```bash
   docker-compose up -d
   ```

5. **애플리케이션 접속**
   
   브라우저에서 `http://localhost:8080` 접속

6. **로그 확인**
   ```bash
   docker-compose logs -f
   ```

### 방법 2: 로컬에서 실행

1. **저장소 클론**
   ```bash
   git clone <repository-url>
   cd three_d_pc
   ```

2. **환경 변수 파일 생성**
   
   `.env` 파일을 생성하고 다음 내용을 작성하세요:
   
   ```env
   # 데이터베이스 설정 (로컬 MariaDB/MySQL)
   DATABASE_HOST=localhost
   DATABASE_PORT=3306
   DATABASE_USER=your_db_user
   DATABASE_PASSWORD=your_db_password
   DATABASE_NAME=threedpc_db
   
   # JWT 시크릿 키
   JWT_ACCESS_SECRET=your-super-secret-jwt-access-key-change-this
   JWT_REFRESH_SECRET=your-super-secret-jwt-refresh-key-change-this
   
   # 카카오 OAuth 설정
   KAKAO_CLIENT_ID=your_kakao_client_id
   KAKAO_CLIENT_SECRET=your_kakao_client_secret
   KAKAO_CALLBACK_URL=http://localhost:3000/auth/kakao/callback
   
   # Firebase 서비스 계정
   FIREBASE_SERVICE_ACCOUNT='{"type":"service_account",...}'
   
   # 애플리케이션 포트 (선택사항, 기본값: 8080)
   PORT=8080
   APP_PORT=8080
   ```

3. **데이터베이스 및 사용자 생성**
   
   MariaDB/MySQL에 데이터베이스와 사용자를 먼저 생성해야 합니다.
   
   **MariaDB/MySQL에 접속:**
   ```bash
   mysql -u root -p
   ```
   
   **SQL 명령어 실행:**
   ```sql
   -- 데이터베이스 생성
   CREATE DATABASE threedpc_db;
   
   -- 사용자 생성 및 권한 부여
   CREATE USER 'threedpc_user'@'localhost' IDENTIFIED BY 'your_db_password';
   GRANT ALL PRIVILEGES ON threedpc.* TO 'threedpc_user'@'localhost';
   FLUSH PRIVILEGES;
   
   -- 확인
   SHOW DATABASES;
   SELECT user, host FROM mysql.user WHERE user = 'threedpc_user';
   ```
   
   > **참고:** 
   > - `threedpc_user`와 `your_db_password`는 `.env` 파일에 설정한 값과 동일해야 합니다.
   > - `threedpc`는 `.env` 파일의 `DATABASE_NAME`과 동일해야 합니다.
   > - 원격 접속이 필요한 경우 `'threedpc_user'@'%'`로 사용자를 생성하세요.

4. **의존성 설치**
   ```bash
   npm install
   ```

5. **Prisma 클라이언트 생성**
   ```bash
   npx prisma generate
   ```

6. **데이터베이스 스키마 적용**
   ```bash
   npx prisma db push
   ```
   
   > **참고:** `prisma db push`는 개발 환경에서 스키마를 데이터베이스에 직접 적용합니다. 
   > 프로덕션 환경에서는 `npx prisma migrate deploy`를 사용하세요.

7. **애플리케이션 실행**
   ```bash
   npm start
   ```
   
   또는 직접 실행:
   ```bash
   node src/index.js
   ```

6. **애플리케이션 접속**
   
   브라우저에서 `http://localhost:8080` 접속


## API 문서 (Swagger)

애플리케이션이 실행 중일 때 Swagger UI를 통해 API 문서를 확인할 수 있습니다.

### Swagger UI 접속
- URL: `http://localhost:8080/api-docs`
- 서버가 실행 중인 상태에서 브라우저로 접속하면 모든 API 엔드포인트를 확인하고 테스트할 수 있습니다.

### 주요 기능
- 모든 API 엔드포인트 목록 및 상세 정보 확인
- 각 엔드포인트의 요청/응답 스키마 확인
- 직접 API 테스트 (Try it out 기능)
- 인증 토큰을 입력하여 보호된 엔드포인트 테스트

### 인증 테스트 방법
1. `/auth/google` 또는 `/auth/kakao/callback`으로 로그인하여 `accessToken`을 받습니다.
2. Swagger UI 상단의 "Authorize" 버튼을 클릭합니다.
3. `Bearer {accessToken}` 형식으로 토큰을 입력합니다.
4. "Authorize" 버튼을 클릭하여 인증을 완료합니다.
5. 이제 보호된 엔드포인트를 테스트할 수 있습니다.

## 프로젝트 구조

```
three_d_pc/
├── src/                    # 소스 코드
│   ├── pages/             # 페이지 컴포넌트
│   ├── index.js          # Express 서버
│   ├── app.js            # 클라이언트 라우터
│   └── ...
├── prisma/                # Prisma 스키마 및 마이그레이션
│   └── schema.prisma
├── generated/             # Prisma 생성 파일 (자동 생성)
├── swagger.yaml           # OpenAPI 3.0 스펙 문서
├── swagger.js             # Swagger 설정 파일
├── docker-compose.yml     # Docker Compose 설정
├── Dockerfile            # Docker 이미지 빌드 파일
├── .env                  # 환경 변수 (Git에 커밋하지 않음)
└── package.json
```

## 환경 변수 설명

| 변수명 | 설명 | 필수 | 기본값 |
|--------|------|------|--------|
| `DATABASE_HOST` | 데이터베이스 호스트 | ✅ | - |
| `DATABASE_PORT` | 데이터베이스 포트 | ✅ | 3306 |
| `DATABASE_USER` | 데이터베이스 사용자명 | ✅ | - |
| `DATABASE_PASSWORD` | 데이터베이스 비밀번호 | ✅ | - |
| `DATABASE_NAME` | 데이터베이스 이름 | ✅ | - |
| `DB_ROOT_PASSWORD` | MariaDB root 비밀번호 (Docker Compose 전용, 선택사항) | ❌ | rootpassword |
| `JWT_ACCESS_SECRET` | JWT 액세스 토큰 시크릿 | ✅ | - |
| `JWT_REFRESH_SECRET` | JWT 리프레시 토큰 시크릿 | ✅ | - |
| `KAKAO_CLIENT_ID` | 카카오 OAuth 클라이언트 ID | ✅ | - |
| `KAKAO_CLIENT_SECRET` | 카카오 OAuth 클라이언트 시크릿 | ✅ | - |
| `KAKAO_CALLBACK_URL` | 카카오 OAuth 콜백 URL | ✅ | - |
| `FIREBASE_SERVICE_ACCOUNT` | Firebase 서비스 계정 JSON | ✅ | - |
| `APP_PORT` | 애플리케이션 포트 | ❌ | 8080 |

### 포트 변경하기

8080번 포트를 사용할 수 없는 경우 (예: 학교 클라우드 컴퓨터 등), `.env` 파일에서 `APP_PORT`를 변경하세요:

```env
# 예: 8080 포트 사용
APP_PORT=8080

# 카카오 OAuth 콜백 URL도 포트에 맞게 변경해야 합니다
KAKAO_CALLBACK_URL=http://your-domain:8080/auth/kakao/callback
```

**중요:** 포트를 변경한 경우:
1. `.env` 파일의 `APP_PORT` 값을 변경
2. `KAKAO_CALLBACK_URL`도 새로운 포트에 맞게 변경
3. Docker Compose를 재시작: `docker-compose down && docker-compose up -d`



## 보안 주의사항

⚠️ **중요**: 
- `.env` 파일은 절대 Git에 커밋하지 마세요
- 프로덕션 환경에서는 강력한 JWT 시크릿 키를 사용하세요
- Firebase 서비스 계정 키는 절대 공개하지 마세요

