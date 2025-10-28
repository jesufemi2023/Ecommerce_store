// backend/src/auth/jwt.constants.ts

export const jwtConstants = {
  accessSecret: process.env.JWT_ACCESS_SECRET || 'default_access_secret',
  refreshSecret: process.env.JWT_REFRESH_SECRET || 'default_refresh_secret',
  accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
};
