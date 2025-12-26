module.exports = {
  apps: [
    {
      name: 'three_d_pc',
      script: 'src/index.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 8080,
      },
      // 환경 변수는 .env 파일에서 자동으로 로드됨 (dotenv 사용)
      // 또는 여기에 직접 설정 가능:
      // env_production: {
      //   NODE_ENV: 'production',
      //   PORT: 8080,
      //   DATABASE_HOST: 'localhost',
      //   DATABASE_PORT: 3306,
      //   // ... 기타 환경 변수
      // },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      // 시작 전 실행할 명령어 (Prisma 클라이언트 생성 및 스키마 적용)
      // 주의: PM2는 시작 전 명령어를 지원하지 않으므로, 별도로 실행해야 함
    },
  ],
};

