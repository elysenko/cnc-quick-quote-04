import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RateLimit } from '../common/rate-limit.guard';
import { AuthService } from './auth.service';
import { LoginDto, RefreshDto, RegisterDto } from './auth.dto';
import { Public } from './auth.guard';
import { CurrentUser } from './current-user.decorator';
import { AuthResultDto, JwtPayload, SessionUserDto } from './auth.types';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  @RateLimit({ bucket: 'auth-register', limit: 10, windowSeconds: 300 })
  register(@Body() dto: RegisterDto): Promise<AuthResultDto> {
    return this.auth.register(dto.email, dto.password, dto.name);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @RateLimit({ bucket: 'auth-login', limit: 20, windowSeconds: 300 })
  login(@Body() dto: LoginDto): Promise<AuthResultDto> {
    return this.auth.login(dto.email, dto.password);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @RateLimit({ bucket: 'auth-refresh', limit: 60, windowSeconds: 300 })
  refresh(@Body() dto: RefreshDto): Promise<AuthResultDto> {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @CurrentUser() user: JwtPayload,
    @Body() body: { refreshToken?: string },
  ): Promise<void> {
    await this.auth.logout(body?.refreshToken, user.sub);
  }

  @Get('me')
  me(@CurrentUser() user: JwtPayload): Promise<SessionUserDto> {
    return this.auth.me(user);
  }
}
