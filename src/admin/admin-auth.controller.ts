import { Body, Controller, Get, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AdminProfileService } from './admin-profile.service.js';
import { ChangePasswordDto, RequestEmailChangeDto, RequestPasswordChangeDto, UpdateAdminProfileDto, VerifyCodeDto } from './dto/admin-profile.dto.js';
import { Throttle } from '@nestjs/throttler';
import { AdminAuthService } from './admin-auth.service.js';
import { AdminLoginDto } from './dto/admin-login.dto.js';
import { AdminAuthGuard } from './admin-auth.guard.js';

@Controller('admin/auth')
export class AdminAuthController {
  constructor(
    private readonly adminAuth: AdminAuthService,
    private readonly profile: AdminProfileService,
  ) {}

  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  login(@Body() dto: AdminLoginDto) {
    return this.adminAuth.login(dto.email, dto.password);
  }

  @Get('me')
  @UseGuards(AdminAuthGuard)
  me(@Req() req: any) {
    return this.adminAuth.me(req.admin.sub);
  }

  // ---- the signed-in admin's own profile (Admin → My profile)

  @Get('profile')
  @UseGuards(AdminAuthGuard)
  getProfile(@Req() req: any) {
    return this.profile.get(req.admin.sub);
  }

  @Patch('profile')
  @UseGuards(AdminAuthGuard)
  updateProfile(@Req() req: any, @Body() dto: UpdateAdminProfileDto) {
    return this.profile.update(req.admin.sub, dto);
  }

  // Change email: current password → code to the NEW address → confirm.
  @Post('profile/email/code')
  @UseGuards(AdminAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  emailCode(@Req() req: any, @Body() dto: RequestEmailChangeDto) {
    return this.profile.requestEmailChange(req.admin.sub, dto.newEmail, dto.currentPassword);
  }

  @Post('profile/email')
  @UseGuards(AdminAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  confirmEmail(@Req() req: any, @Body() dto: VerifyCodeDto) {
    return this.profile.confirmEmailChange(req.admin.sub, dto.code);
  }

  // Change password: current password → code to the current email → code + new password. Other sessions end.
  @Post('profile/password/code')
  @UseGuards(AdminAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  passwordCode(@Req() req: any, @Body() dto: RequestPasswordChangeDto) {
    return this.profile.requestPasswordChange(req.admin.sub, dto.currentPassword);
  }

  @Post('profile/password')
  @UseGuards(AdminAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  changePassword(@Req() req: any, @Body() dto: ChangePasswordDto) {
    return this.profile.changePassword(req.admin.sub, dto.code, dto.newPassword);
  }
}
