import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRouter from './utils/routes/auth';
import chatHistoryRouter from './utils/routes/chatHistory';
import executeRouter from './utils/routes/execute';
import rateLimit from 'express-rate-limit';

import cookieParser from 'cookie-parser';

const app = express();

dotenv.config();
app.use(express.json());
app.use(cookieParser());
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));

const rateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 25, // Limit each IP to 25 requests per windowMs
    message: 'Too many requests, please try again after a minute',
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

app.use(rateLimiter);
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/chatHistory', chatHistoryRouter);
app.use('/api/v1/execute', executeRouter);

app.get('/', (req, res) => {
    res.send('ClipCraft API is running');
});

app.listen(process.env.PORT, () => {
    console.log('Server is running on port 3000');
});