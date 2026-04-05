import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true, length: 120 })
  email: string;

  @Column({ length: 80 })
  nickname: string;

  @Column({ select: false })
  passwordHash: string;

  @Column({ default: 10000 })
  bankroll: number;

  @Column({ default: false })
  isPremium: boolean;
}
