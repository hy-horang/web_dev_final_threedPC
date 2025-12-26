# Docker 배포 가이드

이 문서는 three_d_pc 애플리케이션을 Docker로 배포하는 방법을 설명합니다.

## 사전 요구사항

- Docker (20.10 이상)
- Docker Compose (2.0 이상)

## 빠른 시작

### 1. 환경 변수 파일 생성

프로젝트 루트에 `.env` 파일을 생성하고 다음 변수들을 설정하세요:

```env
# 데이터베이스 설정
DATABASE_HOST=db
# 외부 포트 (로컬 MySQL과 충돌 방지를 위해 기본값 3307 사용)
# 로컬에 MySQL이 없으면 3306으로 변경 가능
DATABASE_PORT=3307
DATABASE_USER=threedpc_user
DATABASE_PASSWORD=your_secure_password_here
DATABASE_NAME=threedpc
DB_ROOT_PASSWORD=your_root_password_here

# JWT 시크릿 키 (반드시 변경하세요!)
JWT_ACCESS_SECRET=your-super-secret-jwt-access-key-change-this
JWT_REFRESH_SECRET=your-super-secret-jwt-refresh-key-change-this

# 카카오 OAuth 설정
KAKAO_CLIENT_ID=your_kakao_client_id
KAKAO_CLIENT_SECRET=your_kakao_client_secret
KAKAO_CALLBACK_URL=http://localhost:8080/auth/kakao/callback

# Firebase 서비스 계정 (JSON을 문자열로 변환)
# Firebase 콘솔에서 서비스 계정 키를 다운로드한 후, JSON 내용을 한 줄로 변환하여 설정
# 예: FIREBASE_SERVICE_ACCOUNT='{"type":"service_account","project_id":"..."}'
FIREBASE_SERVICE_ACCOUNT='{"type":"service_account",...}'

# 애플리케이션 포트 (선택사항, 기본값: 8080)
APP_PORT=8080
```

### 2. Firebase 서비스 계정 설정

Firebase 콘솔에서 서비스 계정 키를 다운로드한 후, JSON 파일의 전체 내용을 한 줄로 변환하여 `.env` 파일의 `FIREBASE_SERVICE_ACCOUNT`에 설정하세요.

> **참고:** JSON 파일의 내용을 그대로 복사하여 한 줄로 만들어서 설정하면 됩니다.

### 3. Docker Compose로 실행

```bash
# 이미지 빌드 및 컨테이너 시작
docker-compose up -d

# 로그 확인
docker-compose logs -f

# 특정 서비스 로그만 확인
docker-compose logs -f app
docker-compose logs -f db
```

### 4. 데이터베이스 스키마 적용

Prisma 스키마가 자동으로 데이터베이스에 적용됩니다 (`prisma db push`). 수동으로 실행하려면:

```bash
# 컨테이너 내부에서 실행
docker-compose exec app npx prisma db push

# 또는 로컬에서 실행 (DATABASE_HOST를 localhost로 설정)
npx prisma db push
```

> **참고:** `prisma db push`는 개발 환경에서 스키마를 데이터베이스에 직접 적용합니다. 
> 프로덕션 환경에서는 `npx prisma migrate deploy`를 사용하는 것을 권장합니다.

## 개별 Docker 명령어 사용

### 이미지 빌드

```bash
docker build -t three_d_pc:latest .
```

### 컨테이너 실행

```bash
# 데이터베이스 먼저 실행
docker run -d \
  --name three_d_pc_db \
  -e MYSQL_ROOT_PASSWORD=rootpassword \
  -e MYSQL_DATABASE=threedpc \
  -e MYSQL_USER=threedpc_user \
  -e MYSQL_PASSWORD=threedpc_password \
  -p 3307:3306 \
  mariadb:10.11

# 애플리케이션 실행
docker run -d \
  --name three_d_pc_app \
  --link three_d_pc_db:db \
  -p 8080:8080 \
  --env-file .env \
  three_d_pc:latest
```

## 유용한 명령어

### 컨테이너 상태 확인

```bash
docker-compose ps
```

### 컨테이너 중지

```bash
docker-compose stop
```

### 컨테이너 시작

```bash
docker-compose start
```

### 컨테이너 재시작

```bash
docker-compose restart
```

### 컨테이너 및 볼륨 삭제

```bash
# 컨테이너만 삭제
docker-compose down

# 컨테이너와 볼륨 모두 삭제 (데이터 삭제됨!)
docker-compose down -v
```

### 컨테이너 내부 접속

```bash
# 애플리케이션 컨테이너
docker-compose exec app sh

# 데이터베이스 컨테이너
docker-compose exec db mysql -u threedpc_user -p threedpc
```

### Prisma Studio 실행

```bash
docker-compose exec app npx prisma studio
```

## 프로덕션 배포

### 1. 환경 변수 보안

- `.env` 파일을 절대 Git에 커밋하지 마세요
- 프로덕션 환경에서는 Docker Secrets나 환경 변수 관리 도구 사용
- JWT 시크릿 키는 강력한 랜덤 문자열 사용

### 2. 리버스 프록시 설정 (Nginx 예시)

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 3. SSL/TLS 인증서 설정

Let's Encrypt를 사용한 예시:

```bash
# Certbot 설치 후
certbot --nginx -d your-domain.com
```

### 4. 데이터베이스 백업

```bash
# 데이터베이스 백업
docker-compose exec db mysqldump -u threedpc_user -p threedpc > backup.sql

# 데이터베이스 복원
docker-compose exec -T db mysql -u threedpc_user -p threedpc < backup.sql
```

## 문제 해결

### 포트 충돌

다른 애플리케이션이 8080 포트를 사용 중인 경우:

```bash
# .env 파일에서 포트 변경
APP_PORT=8081
```

### 데이터베이스 연결 실패

1. 데이터베이스 컨테이너가 실행 중인지 확인:
   ```bash
   docker-compose ps db
   ```

2. 데이터베이스 로그 확인:
   ```bash
   docker-compose logs db
   ```

3. 네트워크 연결 확인:
   ```bash
   docker-compose exec app ping db
   ```

### Prisma 클라이언트 생성 실패

```bash
# 컨테이너 내부에서 수동 실행
docker-compose exec app npx prisma generate
```

### 데이터베이스 스키마 적용 실패

```bash
# 스키마를 데이터베이스에 직접 적용 (개발 환경)
docker-compose exec app npx prisma db push

# 마이그레이션 상태 확인 (마이그레이션 사용 시)
docker-compose exec app npx prisma migrate status

# 마이그레이션 재실행 (마이그레이션 사용 시)
docker-compose exec app npx prisma migrate deploy
```

## 성능 최적화

### 멀티 스테이지 빌드

Dockerfile은 이미 멀티 스테이지 빌드를 사용하여 최적화되어 있습니다.

### 이미지 크기 최적화

- Alpine Linux 기반 이미지 사용
- 프로덕션 의존성만 설치
- 불필요한 파일 제외 (.dockerignore)

### 리소스 제한 설정

`docker-compose.yml`에 리소스 제한 추가:

```yaml
services:
  app:
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M
```

## 모니터링

### Health Check

애플리케이션은 `/health` 엔드포인트를 제공합니다:

```bash
curl http://localhost:8080/health
```

### 로그 모니터링

```bash
# 실시간 로그
docker-compose logs -f app

# 최근 100줄
docker-compose logs --tail=100 app
```

## 추가 리소스

- [Docker 공식 문서](https://docs.docker.com/)
- [Docker Compose 문서](https://docs.docker.com/compose/)
- [Prisma 배포 가이드](https://www.prisma.io/docs/guides/deployment)

