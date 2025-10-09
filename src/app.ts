import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { limiter } from './config/rateLimiter';
import { specs } from './config/swagger';
import { requestLogger } from './middleware/requestLogger';

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(requestLogger);
app.use(limiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Swagger docs
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

// Routes
// app.use('/api', routes);

export default app;