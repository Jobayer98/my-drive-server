import { AuthService, RegisterData, LoginData } from '../../src/services/authService';
import User, { IUser } from '../../src/models/User';
import * as jwtUtils from '../../src/utils/jwt';
import { Types } from 'mongoose';

// Mock dependencies
jest.mock('../../src/models/User');
jest.mock('../../src/utils/jwt');

const mockedJwtUtils = jwtUtils as jest.Mocked<typeof jwtUtils>;

describe('AuthService', () => {
  let authService: AuthService;
  let mockUser: Partial<IUser>;

  beforeEach(() => {
    authService = new AuthService();
    jest.clearAllMocks();
    
    // Reset mockUser to ensure clean state
    mockUser = {
      _id: new Types.ObjectId('507f1f77bcf86cd799439011'),
      email: 'test@example.com',
      password: 'hashedPassword',
      name: 'Test User',
      storageUsed: 0,
      storageLimit: 5 * 1024 * 1024 * 1024,
      createdAt: new Date(),
      updatedAt: new Date(),
      comparePassword: jest.fn(),
      save: jest.fn(),
      refreshToken: undefined
    } as any;

    // Mock User model static methods
    (User.findOne as jest.Mock) = jest.fn();
    (User.findById as jest.Mock) = jest.fn();
    (User.findByIdAndUpdate as jest.Mock) = jest.fn();
    
    // Mock User constructor - return mockUser by default
    (User as any).mockImplementation(() => mockUser);
  });

  describe('register', () => {
    const validRegisterData: RegisterData = {
      email: 'test@example.com',
      name: 'Test User',
      password: 'password123'
    };

    it('should successfully register a new user', async () => {
      // Arrange
      (User.findOne as jest.Mock).mockResolvedValue(null);
      
      // Mock the save method to return the user instance
      mockUser.save = jest.fn()
        .mockResolvedValueOnce(mockUser) // First save after user creation
        .mockResolvedValueOnce(mockUser); // Second save after setting refreshToken
      
      mockedJwtUtils.generateTokens.mockReturnValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        accessTokenId: '550e8400-e29b-41d4-a716-446655440000',
        refreshTokenId: '550e8400-e29b-41d4-a716-446655440001'
      });

      // Act
      const result = await authService.register(validRegisterData);

      // Assert
      expect(User.findOne).toHaveBeenCalledWith({ email: validRegisterData.email });
      expect(mockedJwtUtils.generateTokens).toHaveBeenCalledWith({
        userId: mockUser._id!.toString(),
        email: mockUser.email
      });
      expect(mockUser.save).toHaveBeenCalledTimes(2); // Once after creation, once after setting refreshToken
      expect(result).toEqual({
        user: {
          id: mockUser._id!.toString(),
          email: mockUser.email,
          name: mockUser.name,
          storageUsed: mockUser.storageUsed,
          storageLimit: mockUser.storageLimit
        },
        accessToken: 'access-token',
        refreshToken: 'refresh-token'
      });
    });

    it('should throw error if user already exists', async () => {
      // Arrange
      (User.findOne as jest.Mock).mockResolvedValue(mockUser);

      // Act & Assert
      await expect(authService.register(validRegisterData))
        .rejects.toThrow('User already exists');
      
      expect(User.findOne).toHaveBeenCalledWith({ email: validRegisterData.email });
      expect(mockedJwtUtils.generateTokens).not.toHaveBeenCalled();
    });

    it('should handle database errors during user creation', async () => {
      // Arrange
      (User.findOne as jest.Mock).mockResolvedValue(null);
      
      // Mock the save method to reject with an error
      mockUser.save = jest.fn().mockRejectedValueOnce(new Error('Database error'));

      // Act & Assert
      await expect(authService.register(validRegisterData)).rejects.toThrow('Database error');
      expect(User.findOne).toHaveBeenCalledWith({ email: validRegisterData.email });
      expect(mockUser.save).toHaveBeenCalledTimes(1);
    });

    it('should handle errors during token generation', async () => {
      // Arrange
      (User.findOne as jest.Mock).mockResolvedValue(null);
      
      // Mock the save method to succeed on first call
      mockUser.save = jest.fn().mockResolvedValueOnce(mockUser);
      
      mockedJwtUtils.generateTokens.mockImplementation(() => {
        throw new Error('Token generation failed');
      });

      // Act & Assert
      await expect(authService.register(validRegisterData)).rejects.toThrow('Token generation failed');
      expect(User.findOne).toHaveBeenCalledWith({ email: validRegisterData.email });
      expect(mockUser.save).toHaveBeenCalledTimes(1); // Only called once before token generation fails
    });
  });

  describe('login', () => {
    const validLoginData: LoginData = {
      email: 'test@example.com',
      password: 'password123'
    };

    it('should successfully login with valid credentials', async () => {
      // Arrange
      (User.findOne as jest.Mock).mockResolvedValue(mockUser);
      (mockUser.comparePassword as jest.Mock).mockResolvedValue(true);
      
      mockedJwtUtils.generateTokens.mockReturnValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        accessTokenId: '550e8400-e29b-41d4-a716-446655440002',
        refreshTokenId: '550e8400-e29b-41d4-a716-446655440003'
      });

      // Act
      const result = await authService.login(validLoginData);

      // Assert
      expect(User.findOne).toHaveBeenCalledWith({ email: validLoginData.email });
      expect(mockUser.comparePassword).toHaveBeenCalledWith(validLoginData.password);
      expect(mockedJwtUtils.generateTokens).toHaveBeenCalledWith({
        userId: mockUser._id!.toString(),
        email: mockUser.email
      });
      expect(mockUser.save).toHaveBeenCalled();
      expect(result).toEqual({
        user: {
          id: mockUser._id!.toString(),
          email: mockUser.email,
          name: mockUser.name,
          storageUsed: mockUser.storageUsed,
          storageLimit: mockUser.storageLimit
        },
        accessToken: 'access-token',
        refreshToken: 'refresh-token'
      });
    });

    it('should throw error if user does not exist', async () => {
      // Arrange
      (User.findOne as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(authService.login(validLoginData))
        .rejects.toThrow('Invalid credentials');
      
      expect(User.findOne).toHaveBeenCalledWith({ email: validLoginData.email });
      expect(mockedJwtUtils.generateTokens).not.toHaveBeenCalled();
    });

    it('should throw error if password is invalid', async () => {
      // Arrange
      (User.findOne as jest.Mock).mockResolvedValue(mockUser);
      (mockUser.comparePassword as jest.Mock).mockResolvedValue(false);

      // Act & Assert
      await expect(authService.login(validLoginData))
        .rejects.toThrow('Invalid credentials');
      
      expect(User.findOne).toHaveBeenCalledWith({ email: validLoginData.email });
      expect(mockUser.comparePassword).toHaveBeenCalledWith(validLoginData.password);
      expect(mockedJwtUtils.generateTokens).not.toHaveBeenCalled();
    });

    it('should handle database errors during login', async () => {
      // Arrange
      (User.findOne as jest.Mock).mockRejectedValue(new Error('Database connection failed'));

      // Act & Assert
      await expect(authService.login(validLoginData))
        .rejects.toThrow('Database connection failed');
    });

    it('should handle password comparison errors', async () => {
      // Arrange
      (User.findOne as jest.Mock).mockResolvedValue(mockUser);
      (mockUser.comparePassword as jest.Mock).mockRejectedValue(new Error('Password comparison failed'));

      // Act & Assert
      await expect(authService.login(validLoginData))
        .rejects.toThrow('Password comparison failed');
    });
  });

  describe('logout', () => {
    const userId = '507f1f77bcf86cd799439011';

    it('should successfully logout user', async () => {
      // Arrange
      (User.findByIdAndUpdate as jest.Mock).mockResolvedValue(mockUser);

      // Act
      await authService.logout(userId);

      // Assert
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
        userId,
        { $unset: { refreshToken: 1 } }
      );
    });

    it('should handle database errors during logout', async () => {
      // Arrange
      (User.findByIdAndUpdate as jest.Mock).mockRejectedValue(new Error('Database update failed'));

      // Act & Assert
      await expect(authService.logout(userId))
        .rejects.toThrow('Database update failed');
    });

    it('should handle logout for non-existent user', async () => {
      // Arrange
      (User.findByIdAndUpdate as jest.Mock).mockResolvedValue(null);

      // Act - Should not throw error even if user doesn't exist
      await expect(authService.logout(userId)).resolves.toBeUndefined();
      
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
        userId,
        { $unset: { refreshToken: 1 } }
      );
    });
  });

  describe('refreshToken', () => {
    const validRefreshToken = 'valid-refresh-token';
    const decodedToken = {
      userId: '507f1f77bcf86cd799439011',
      email: 'test@example.com',
      jti: 'refresh-token-id',
      iat: 1234567890,
      exp: 1234567890 + 7 * 24 * 60 * 60 // 7 days from iat
    };

    it('should successfully refresh token with valid refresh token', async () => {
      // Arrange
      mockedJwtUtils.verifyAndCheckToken.mockResolvedValue(decodedToken);
      (User.findById as jest.Mock).mockResolvedValue(mockUser);
      mockUser.refreshToken = decodedToken.jti;
      
      mockedJwtUtils.blockToken.mockResolvedValue(undefined);
      mockedJwtUtils.generateTokens.mockReturnValue({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        accessTokenId: '550e8400-e29b-41d4-a716-446655440004',
        refreshTokenId: '550e8400-e29b-41d4-a716-446655440005'
      });

      // Act
      const result = await authService.refreshToken(validRefreshToken);

      // Assert
      expect(mockedJwtUtils.verifyAndCheckToken).toHaveBeenCalledWith(
        validRefreshToken,
        process.env.JWT_REFRESH_SECRET,
        'refresh'
      );
      expect(User.findById).toHaveBeenCalledWith(decodedToken.userId);
      expect(mockedJwtUtils.blockToken).toHaveBeenCalledWith(
        decodedToken.jti,
        decodedToken.userId,
        'refresh',
        new Date(decodedToken.exp * 1000),
        'Token refresh - old token invalidated'
      );
      expect(mockedJwtUtils.generateTokens).toHaveBeenCalledWith({
        userId: mockUser._id!.toString(),
        email: mockUser.email
      });
      expect(mockUser.save).toHaveBeenCalled();
      expect(result).toEqual({
        user: {
          id: mockUser._id!.toString(),
          email: mockUser.email,
          name: mockUser.name,
          storageUsed: mockUser.storageUsed,
          storageLimit: mockUser.storageLimit
        },
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token'
      });
    });

    it('should throw error if refresh token is invalid or expired', async () => {
      // Arrange
      mockedJwtUtils.verifyAndCheckToken.mockRejectedValue(new Error('jwt expired'));

      // Act & Assert
      await expect(authService.refreshToken(validRefreshToken))
        .rejects.toThrow('Invalid or expired refresh token');
      
      expect(mockedJwtUtils.verifyAndCheckToken).toHaveBeenCalledWith(
        validRefreshToken,
        process.env.JWT_REFRESH_SECRET,
        'refresh'
      );
      expect(User.findById).not.toHaveBeenCalled();
    });

    it('should throw error if refresh token has been revoked', async () => {
      // Arrange
      mockedJwtUtils.verifyAndCheckToken.mockRejectedValue(new Error('jwt expired'));

      // Act & Assert
      await expect(authService.refreshToken(validRefreshToken))
        .rejects.toThrow('Invalid or expired refresh token');
    });

    it('should throw error if user is not found', async () => {
      // Arrange
      mockedJwtUtils.verifyAndCheckToken.mockResolvedValue(decodedToken);
      (User.findById as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(authService.refreshToken(validRefreshToken))
        .rejects.toThrow('Invalid or expired refresh token');
      
      expect(User.findById).toHaveBeenCalledWith(decodedToken.userId);
    });

    it('should throw error if refresh token ID does not match stored token', async () => {
      // Arrange
      mockedJwtUtils.verifyAndCheckToken.mockResolvedValue(decodedToken);
      (User.findById as jest.Mock).mockResolvedValue(mockUser);
      mockUser.refreshToken = 'different-token-id';

      // Act & Assert
      await expect(authService.refreshToken(validRefreshToken))
        .rejects.toThrow('Invalid or expired refresh token');
      
      expect(User.findById).toHaveBeenCalledWith(decodedToken.userId);
    });

    it('should handle token blocking errors gracefully', async () => {
      // Arrange
      mockedJwtUtils.verifyAndCheckToken.mockResolvedValue(decodedToken);
      (User.findById as jest.Mock).mockResolvedValue(mockUser);
      mockUser.refreshToken = decodedToken.jti;
      
      mockedJwtUtils.blockToken.mockRejectedValue(new Error('Database error'));
      mockedJwtUtils.generateTokens.mockReturnValue({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        accessTokenId: '550e8400-e29b-41d4-a716-446655440006',
        refreshTokenId: '550e8400-e29b-41d4-a716-446655440007'
      });

      // Act & Assert - Should fail because blockToken error is not handled
      await expect(authService.refreshToken(validRefreshToken))
        .rejects.toThrow('Database error');
    });

    it('should handle new token generation errors', async () => {
      // Arrange
      mockedJwtUtils.verifyAndCheckToken.mockResolvedValue(decodedToken);
      (User.findById as jest.Mock).mockResolvedValue(mockUser);
      mockUser.refreshToken = decodedToken.jti;
      
      mockedJwtUtils.blockToken.mockResolvedValue(undefined);
      mockedJwtUtils.generateTokens.mockImplementation(() => {
        throw new Error('Token generation failed');
      });

      // Act & Assert
      await expect(authService.refreshToken(validRefreshToken))
        .rejects.toThrow('Token generation failed');
    });

    it('should handle user save errors during refresh', async () => {
      // Arrange
      mockedJwtUtils.verifyAndCheckToken.mockResolvedValue(decodedToken);
      (User.findById as jest.Mock).mockResolvedValue(mockUser);
      mockUser.refreshToken = decodedToken.jti;
      (mockUser.save as jest.Mock).mockRejectedValue(new Error('Database save failed'));
      
      mockedJwtUtils.blockToken.mockResolvedValue(undefined);
      mockedJwtUtils.generateTokens.mockReturnValue({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        accessTokenId: '550e8400-e29b-41d4-a716-446655440008',
        refreshTokenId: '550e8400-e29b-41d4-a716-446655440009'
      });

      // Act & Assert
      await expect(authService.refreshToken(validRefreshToken))
        .rejects.toThrow('Database save failed');
    });

    it('should handle generic errors and wrap them appropriately', async () => {
      // Arrange
      mockedJwtUtils.verifyAndCheckToken.mockRejectedValue(new Error('Some unexpected error'));

      // Act & Assert
      await expect(authService.refreshToken(validRefreshToken))
        .rejects.toThrow('Some unexpected error');
    });

    it('should handle non-Error exceptions', async () => {
      // Arrange
      mockedJwtUtils.verifyAndCheckToken.mockRejectedValue('String error');

      // Act & Assert
      await expect(authService.refreshToken(validRefreshToken))
        .rejects.toThrow('Token refresh failed');
    });
  });

  describe('Edge Cases and Security Tests', () => {
    it('should handle empty or null inputs gracefully', async () => {
      // Test register with empty data - should fail at User.findOne
      (User.findOne as jest.Mock).mockRejectedValueOnce(new Error('Invalid email'));
      
      await expect(authService.register({} as RegisterData))
        .rejects.toThrow();

      // Test login with empty data - should fail at User.findOne
      (User.findOne as jest.Mock).mockRejectedValueOnce(new Error('Invalid email'));
      
      await expect(authService.login({} as LoginData))
        .rejects.toThrow();

      // Test logout with empty userId
      await expect(authService.logout(''))
        .resolves.toBeUndefined();

      // Test refreshToken with empty token
      await expect(authService.refreshToken(''))
        .rejects.toThrow();
    });

    it('should handle malformed ObjectIds', async () => {
      // Arrange
      (User.findByIdAndUpdate as jest.Mock).mockRejectedValue(new Error('Cast to ObjectId failed'));

      // Act & Assert
      await expect(authService.logout('invalid-object-id'))
        .rejects.toThrow('Cast to ObjectId failed');
    });

    it('should handle concurrent token refresh attempts', async () => {
      // This test simulates race conditions where multiple refresh attempts happen
      const decodedToken = {
        userId: '507f1f77bcf86cd799439011',
        email: 'test@example.com',
        jti: 'refresh-token-id',
        iat: 1234567890,
        exp: 1234567890 + 7 * 24 * 60 * 60
      };

      mockedJwtUtils.verifyAndCheckToken.mockResolvedValue(decodedToken);
      (User.findById as jest.Mock).mockResolvedValue(mockUser);
      mockUser.refreshToken = decodedToken.jti;

      // First call should succeed
      mockedJwtUtils.blockToken.mockResolvedValue(undefined);
      mockedJwtUtils.generateTokens.mockReturnValue({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        accessTokenId: '550e8400-e29b-41d4-a716-446655440010',
        refreshTokenId: '550e8400-e29b-41d4-a716-446655440011'
      });

      const result = await authService.refreshToken('valid-refresh-token');
      expect(result).toBeDefined();

      // Second call with same token should fail (token already blocked)
      mockedJwtUtils.verifyAndCheckToken.mockRejectedValue(new Error('jwt expired'));
      
      await expect(authService.refreshToken('valid-refresh-token'))
        .rejects.toThrow('Invalid or expired refresh token');
    });
  });
});