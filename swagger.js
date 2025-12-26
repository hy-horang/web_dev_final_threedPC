// Swagger 설정 파일
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const path = require('path');
const fs = require('fs');

// YAML 파일을 직접 로드하는 방법
function loadSwaggerFromYAML() {
  const swaggerPath = path.join(__dirname, 'swagger.yaml');
  return YAML.load(swaggerPath);
}

// 또는 swagger-jsdoc을 사용하는 방법
const swaggerOptions = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Three D PC API',
      version: '1.0.0',
      description: 'PC 부품 견적 생성 및 관리 API',
    },
    servers: [
      {
        url: `http://localhost:${process.env.PORT || 8080}`,
        description: 'Local development server',
      },
    ],
  },
  // 코드에 주석으로 작성한 경우 사용
  apis: ['./src/index.js'], // 주석이 있는 파일 경로
};

// YAML 파일이 있으면 YAML을 사용, 없으면 JSDoc 주석 사용
function getSwaggerSpec() {
  try {
    const yamlPath = path.join(__dirname, 'swagger.yaml');
    if (fs.existsSync(yamlPath)) {
      return loadSwaggerFromYAML();
    }
  } catch (error) {
    console.warn('Failed to load swagger.yaml, using JSDoc instead:', error.message);
  }
  return swaggerJsdoc(swaggerOptions);
}

module.exports = {
  swaggerUi,
  getSwaggerSpec,
};

