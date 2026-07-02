import { Controller, Get, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { PaymentsService } from '../payments/payments.module';

@Controller('printing')
export class PrintingController {
  constructor(
    private readonly paymentsService: PaymentsService,
  ) {}

  @Get('ticket/:id/html')
  async ticketHtml(
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    return this.paymentsService.generateThermalTicketHtml(id, res);
  }
}