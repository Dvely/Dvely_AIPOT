import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  createUser(params: { email: string; nickname: string; passwordHash: string }) {
    const user = this.usersRepository.create({
      email: params.email,
      nickname: params.nickname,
      passwordHash: params.passwordHash,
    });

    return this.usersRepository.save(user);
  }

  findByEmail(email: string) {
    return this.usersRepository.findOne({
      where: { email },
      select: {
        id: true,
        email: true,
        nickname: true,
        bankroll: true,
        isPremium: true,
        passwordHash: true,
      },
    });
  }

  findById(id: number) {
    return this.usersRepository.findOne({
      where: { id },
      select: {
        id: true,
        email: true,
        nickname: true,
        bankroll: true,
        isPremium: true,
      },
    });
  }
}
