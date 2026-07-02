import { Controller, Get, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { ThermalTicketService } from './thermal-ticket.service';
import { PaymentsService } from '../payments/payments.module';
import { PdfGeneratorService } from '@/pdf-generator/pdf-generator.service';

@Controller('printing')
export class PrintingController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly pdfGeneratorService: PdfGeneratorService,
  ) {}

  @Get('ticket/:id/html')
  async ticketHtml(
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    // Obtener los mismos datos que usa el PDF
    const data = await this.paymentsService.getThermalTicketData(id);

    // Generar el HTML
    const html = this.pdfGeneratorService.generateThermalReceiptHtml(data);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }
}