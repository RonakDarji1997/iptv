import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const token = authHeader.substring(7);
    
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'default-secret'
    );
    
    (req as any).user = decoded;
    next();
    
  } catch (error) {
    console.error('❌ Auth error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
};
