import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

@Entity('pre_registrations')
export class PreRegistration {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  password_hash: string;

  @Column({ nullable: true })
  full_name: string;

  @Column()
  verification_token_hash: string;

  @Column()
  expires_at: Date;

  @CreateDateColumn()
  created_at: Date;

  @Column()
  ip: string;

  @Column()
  user_agent: string;
}
