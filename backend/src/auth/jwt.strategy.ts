import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../users/users.service';
import { jwtConstants } from './jwt.constants';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly usersService: UsersService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), // ✅ Authorization: Bearer <token>
      ignoreExpiration: false,
      secretOrKey: jwtConstants.accessSecret, // must match what you sign with
    });
  }

  async validate(payload: any) {
    // payload comes from AuthService.generateTokens -> { sub, roles, device_id }
    const user = await this.usersService.findById(payload.sub);
    if (!user) throw new UnauthorizedException('User not found');

    // whatever you return here becomes req.user
    return {
      id: user.id,
      email: user.email,
      roles: [user.role],
      device_id: payload.device_id,
    };
  }
}
