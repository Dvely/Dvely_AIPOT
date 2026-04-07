import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  health() {
    return {
      service: 'AIPOT Backend',
      version: '1.3.0',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
