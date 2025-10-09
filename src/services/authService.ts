import User, { IUser } from '../models/User';
import { generateTokens } from '../utils/jwt';

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

export class AuthService {
  async register(userData: RegisterData): Promise<AuthResponse> {
    const existingUser = await User.findOne({ email: userData.email });
    if (existingUser) {
      throw new Error('User already exists');
    }

    const user = new User(userData);
    await user.save();

    const tokens = generateTokens({
      userId: user._id.toString(),
      email: user.email
    });

    user.refreshToken = tokens.refreshToken;
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
      refreshToken: tokens.refreshToken
    };
  }
}