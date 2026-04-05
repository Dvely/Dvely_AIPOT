import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async register(input: RegisterDto) {
    const exists = await this.usersService.findByEmail(input.email);
    if (exists) {
      throw new ConflictException('이미 사용 중인 이메일입니다.');
    }

    const passwordHash = await bcrypt.hash(input.password, 10);
    const user = await this.usersService.createUser({
      email: input.email,
      nickname: input.nickname,
      passwordHash,
    });

    return this.issueToken({
      userId: user.id,
      email: user.email,
      nickname: user.nickname,
    });
  }

  async login(input: LoginDto) {
    const user = await this.usersService.findByEmail(input.email);
    if (!user) {
      throw new UnauthorizedException('이메일 또는 비밀번호가 올바르지 않습니다.');
    }

    const valid = await bcrypt.compare(input.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('이메일 또는 비밀번호가 올바르지 않습니다.');
    }

    return this.issueToken({
      userId: user.id,
      email: user.email,
      nickname: user.nickname,
    });
  }

  private issueToken(payload: { userId: number; email: string; nickname: string }) {
    return {
      accessToken: this.jwtService.sign(payload),
      user: payload,
    };
   }
 }
