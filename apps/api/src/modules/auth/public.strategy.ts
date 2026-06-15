import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport';

@Injectable()
export class PublicStrategy extends PassportStrategy(Strategy, 'public') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [x: string]: any;

  constructor() {
    super();
  }

  authenticate(): void {
    return this.success({ [Symbol.for('isPublic')]: true });
  }
}
