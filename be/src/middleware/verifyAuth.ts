import { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'

const verifyAuth = (req: Request, res: Response, next: NextFunction) => {
  try {
    // Check for token in Authorization header first, then in cookies
    let token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      token = req.cookies?.jwt;
    }

    if (!token && req.query.token) {
      const queryToken = req.query.token as string;
      if (queryToken !== "null" && queryToken !== "undefined") {
        token = queryToken;
      }
    }

    console.log('Token source:', token ? 'Found' : 'Missing', 'Cookies:', !!req.cookies?.jwt, 'Query:', !!req.query.token);

    if (!token) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    jwt.verify(token, process.env.TOKEN_SECRET!);
    next();
  } catch (err) {
    console.error('Error: ', err);
    res.status(401).json({ message: 'Unauthorized' });
  }
}

export default verifyAuth;