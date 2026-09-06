import { Role } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}

export interface SessionUserDto {
  id: string;
  email: string;
  name: string | null;
  role: Role;
}

export interface AuthResultDto {
  user: SessionUserDto;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}
