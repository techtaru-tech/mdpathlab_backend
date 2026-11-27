import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PartnerAuthGuard, type PartnerTokenPayload } from '../partners/partner-auth.guard.js';
import { PartnersEnabledGuard } from '../partners/partners-feature.js';
import { PartnerBookingsService } from './partner-bookings.service.js';
import { PartnerAddressDto, PartnerCreateBookingDto, PartnerQuoteDto, PatientPhoneDto, VerifyPatientDto } from './dto/partner-booking.dto.js';

type PartnerRequest = { partner: PartnerTokenPayload };

/**
 * Partner portal → "Book for a patient". Always the partner in the token; the patient only through the OTP-backed
 * patientToken from /patient/verify, which is tied to this partner and expires in 30 minutes.
 */
@Controller('partner/bookings')
@UseGuards(PartnersEnabledGuard, PartnerAuthGuard)
export class PartnerBookingsController {
  constructor(private readonly bookings: PartnerBookingsService) {}

  @Get()
  list(@Req() req: PartnerRequest) {
    return this.bookings.list(req.partner.sub);
  }

  @Post('patient/otp')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  sendOtp(@Req() req: PartnerRequest, @Body() dto: PatientPhoneDto) {
    return this.bookings.sendPatientOtp(req.partner.sub, dto.phone);
  }

  @Post('patient/verify')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  verify(@Req() req: PartnerRequest, @Body() dto: VerifyPatientDto) {
    return this.bookings.verifyPatient(req.partner.sub, dto.phone, dto.otp, dto.name);
  }

  @Post('patient/addresses')
  addAddress(@Req() req: PartnerRequest, @Body() dto: PartnerAddressDto) {
    const { patientToken, ...address } = dto;
    return this.bookings.addAddress(req.partner.sub, patientToken, address);
  }

  @Post('quote')
  quote(@Req() req: PartnerRequest, @Body() dto: PartnerQuoteDto) {
    return this.bookings.quote(req.partner.sub, dto);
  }

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  create(@Req() req: PartnerRequest, @Body() dto: PartnerCreateBookingDto) {
    return this.bookings.create(req.partner.sub, dto);
  }
}
