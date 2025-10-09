import swaggerJsdoc from 'swagger-jsdoc';

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'My Drive Server API',
      version: '1.0.0',
      description: 'Node.js server API documentation'
    },
    servers: [{
      url: process.env.BASE_URL || 'http://localhost:3000',
      description: 'Development server'
    }]
  },
  apis: ['./src/routes/*.ts']
};

export const specs = swaggerJsdoc(swaggerOptions);