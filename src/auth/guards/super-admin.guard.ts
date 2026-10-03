import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (context.switchToHttp().getRequest().user?.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('SUPER_ADMIN permission required');
    }
    return true;
  }
}
