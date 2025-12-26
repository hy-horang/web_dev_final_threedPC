FROM node:20-alpine

WORKDIR /app

# 의존성 파일 복사
COPY package*.json ./
COPY prisma ./prisma/

# 의존성 설치
RUN npm install

# Prisma 클라이언트 생성
RUN npx prisma generate --schema=./prisma/schema.prisma

# 애플리케이션 소스 코드 복사
COPY src ./src

# 포트 노출
EXPOSE 8080

# 환경 변수 설정
ENV NODE_ENV=production
ENV PORT=8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3000) + '/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# 애플리케이션 실행 (마이그레이션은 docker-compose에서 처리)
CMD ["node", "src/index.js"]

