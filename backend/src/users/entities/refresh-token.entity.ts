import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id: string; // jti

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column()
  token_hash: string; // SHA-256 hashed

  @Column()
  device_id: string;

  @Column({ nullable: true })
  device_name: string;

  @Column()
  ip: string;

  @Column()
  user_agent: string;

  @CreateDateColumn()
  created_at: Date;

  @Column({ nullable: true })
  last_seen_at: Date;

  @Column()
  expires_at: Date;

  @Column({ default: false })
  is_revoked: boolean;
}
