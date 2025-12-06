import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('❌ No Authorization header or invalid format');
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const token = authHeader.substring(7);
    const jwtSecret = process.env.JWT_SECRET || 'default-secret';
    console.log(`🔑 Verifying token with secret: ${jwtSecret}`);
    console.log(`🔑 Token: ${token.substring(0, 50)}...`);
    
    const decoded: any = jwt.verify(token, jwtSecret);
    
    console.log('✅ Token verified, userId:', decoded.userId);
    (req as any).user = decoded;
    (req as any).userId = decoded.userId;
    next();
    
  } catch (error) {
    console.error('❌ Auth error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
};
