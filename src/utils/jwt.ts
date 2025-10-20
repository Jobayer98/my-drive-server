import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import BlockedToken from '../models/BlockedToken';

export interface TokenPayload {
  userId: string;
  email: string;
  jti?: string; // JWT ID for token tracking
}

export interface ExtendedTokenPayload extends TokenPayload {
  iat: number;
  exp: number;
  jti: string;
}

export const generateTokens = (payload: TokenPayload) => {
  const accessTokenId = randomUUID();
  const refreshTokenId = randomUUID();

  const accessToken = jwt.sign(
    { ...payload, jti: accessTokenId },
    process.env.JWT_SECRET!,
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m' } as jwt.SignOptions
  );

  const refreshToken = jwt.sign(
    { ...payload, jti: refreshTokenId },
    process.env.JWT_REFRESH_SECRET!,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' } as jwt.SignOptions
  );

  return { 
    accessToken, 
    refreshToken,
    accessTokenId,
    refreshTokenId
  };
};

export const verifyToken = (token: string, secret: string): ExtendedTokenPayload => {
  return jwt.verify(token, secret) as ExtendedTokenPayload;
};

export const isTokenBlocked = async (tokenId: string, tokenType: 'access' | 'refresh'): Promise<boolean> => {
  try {
    const blockedToken = await BlockedToken.findOne({ 
      tokenId, 
      tokenType,
      expiresAt: { $gt: new Date() }
    });
    return !!blockedToken;
  } catch (error) {
    // In case of database error, assume token is not blocked to avoid false positives
    return false;
  }
};

export const blockToken = async (
  tokenId: string, 
  userId: string, 
  tokenType: 'access' | 'refresh', 
  expiresAt: Date,
  reason?: string
): Promise<void> => {
  try {
    await BlockedToken.create({
      tokenId,
      userId,
      tokenType,
      expiresAt,
      reason: reason || 'Token refresh'
    });
  } catch (error) {
    // Log error but don't throw to avoid breaking the flow
    console.error('Failed to block token:', error);
  }
};

export const verifyAndCheckToken = async (
  token: string, 
  secret: string, 
  tokenType: 'access' | 'refresh'
): Promise<ExtendedTokenPayload> => {
  // First verify the token signature and expiration
  const decoded = verifyToken(token, secret);
  
  // Check if token is blocked
  if (decoded.jti && await isTokenBlocked(decoded.jti, tokenType)) {
    throw new Error('Token has been revoked');
  }
  
  return decoded;
};