import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiOperation({ summary: '회원가입' })
  @Post('register')
  register(@Body() body: RegisterDto) {
    return this.authService.register(body);
  }

  @ApiOperation({ summary: '로그인' })
  @Post('login')
  login(@Body() body: LoginDto) {
    return this.authService.login(body);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: '내 JWT 페이로드 확인' })
  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: Request & { user: { userId: number; email: string; nickname: string } }) {
    return req.user;
  }
}
