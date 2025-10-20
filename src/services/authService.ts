import User, { IUser } from '../models/User';
import { generateTokens, verifyAndCheckToken, blockToken } from '../utils/jwt';

export interface RegisterData {
  email: string;
  password: string;
  name: string;
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    name: string;
    storageUsed: number;
    storageLimit: number;
  };
  accessToken: string;
  refreshToken: string;
}

export interface LoginData {
  email: string;
  password: string;
}

export class AuthService {
  async register(userData: RegisterData): Promise<AuthResponse> {
    const existingUser = await User.findOne({ email: userData.email });
    if (existingUser) {
      throw new Error('User already exists');
    }

    const user: IUser = new User(userData);
    await user.save();

    const tokens = generateTokens({
      userId: user._id.toString(),
      email: user.email
    });

    user.refreshToken = tokens.refreshTokenId; // Store token ID instead of full token
    await user.save();

    return {
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        storageUsed: user.storageUsed,
        storageLimit: user.storageLimit
      },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  async login(loginData: LoginData): Promise<AuthResponse> {
    const user = await User.findOne({ email: loginData.email });
    if (!user) {
      throw new Error('Invalid credentials');
    }

    const isPasswordValid = await user.comparePassword(loginData.password);
    if (!isPasswordValid) {
      throw new Error('Invalid credentials');
    }

    const tokens = generateTokens({
      userId: user._id.toString(),
      email: user.email
    });

    user.refreshToken = tokens.refreshTokenId; // Store token ID instead of full token
    await user.save();

    return {
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        storageUsed: user.storageUsed,
        storageLimit: user.storageLimit
      },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  async logout(userId: string): Promise<void> {
    await User.findByIdAndUpdate(userId, { $unset: { refreshToken: 1 } });
  }

  async refreshToken(refreshToken: string): Promise<AuthResponse> {
    try {
      // Verify and check if refresh token is valid and not blocked
      const decoded = await verifyAndCheckToken(
        refreshToken,
        process.env.JWT_REFRESH_SECRET!,
        'refresh'
      );

      // Find user and verify the refresh token ID matches
      const user = await User.findById(decoded.userId);
      if (!user || user.refreshToken !== decoded.jti) {
        throw new Error('Invalid or expired refresh token');
      }

      // Block the old refresh token
      await blockToken(
        decoded.jti,
        decoded.userId,
        'refresh',
        new Date(decoded.exp * 1000),
        'Token refresh - old token invalidated'
      );

      // Generate new tokens
      const newTokens = generateTokens({
        userId: user._id.toString(),
        email: user.email
      });

      // Update user with new refresh token ID
      user.refreshToken = newTokens.refreshTokenId;
      await user.save();

      return {
        user: {
          id: user._id.toString(),
          email: user.email,
          name: user.name,
          storageUsed: user.storageUsed,
          storageLimit: user.storageLimit
        },
        accessToken: newTokens.accessToken,
        refreshToken: newTokens.refreshToken,
      };
    } catch (error) {
      if (error instanceof Error) {
        // Re-throw known errors
        if (error.message.includes('jwt') || error.message.includes('token')) {
          throw new Error('Invalid or expired refresh token');
        }
        throw error;
      }
      throw new Error('Token refresh failed');
    }
  }
}
