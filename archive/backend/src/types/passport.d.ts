declare module 'passport-jwt' {
  export const ExtractJwt: {
    fromAuthHeaderAsBearerToken: () => any;
  };
  export class Strategy {
    constructor(options: any, verify?: any);
  }
}

declare module '@nestjs/passport' {
  export function PassportStrategy(strategy: any, name?: string): any;
}
