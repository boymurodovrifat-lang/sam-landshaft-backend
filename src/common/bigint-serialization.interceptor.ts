import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';

/**
 * Prisma BigInt qiymatlarni JSON ga to'g'ri serialization qilish.
 * BigInt → number yoki string ga o'giriladi.
 */
@Injectable()
export class BigIntSerializationInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => this.serialize(data)),
    );
  }

  private serialize(value: any): any {
    if (value === null || value === undefined) return value;
    if (typeof value === 'bigint') {
      return Number(value);
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.serialize(item));
    }
    if (typeof value === 'object' && value instanceof Date) {
      return value;
    }
    if (typeof value === 'object') {
      const result: any = {};
      for (const key of Object.keys(value)) {
        if (key === 'cogPath' || key === 'originalPath') continue;
        result[key] = this.serialize(value[key]);
      }
      return result;
    }
    return value;
  }
}
