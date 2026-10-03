import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { SuperAdminGuard } from './super-admin.guard';
describe('Destructive action permissions', () => {
  const context = (role?: string) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ user: role ? { role } : undefined }),
      }),
    }) as ExecutionContext;
  it.each([undefined, 'ADMIN', 'unknown'])('denies %s', (role) => {
    expect(() => new SuperAdminGuard().canActivate(context(role))).toThrow(
      ForbiddenException,
    );
  });
  it('allows SUPER_ADMIN', () =>
    expect(new SuperAdminGuard().canActivate(context('SUPER_ADMIN'))).toBe(
      true,
    ));
});
