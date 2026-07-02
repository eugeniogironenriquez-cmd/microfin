import { ThermalPrinter, PrinterTypes } from 'node-thermal-printer';

function cur(v: any) {
  return '$' + (Number(v) || 0).toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export class EscPosTicketService {
  async print(data: any, printerName: string) {
    const { payment, loan, company, stats } = data;

    const printer = new ThermalPrinter({
      type: PrinterTypes.EPSON,
      interface: `printer:${printerName}`,
      removeSpecialCharacters: false,
      lineCharacter: '-',
    });

    let cuotasPagadas: any[] = [];
    try {
      cuotasPagadas = typeof payment.cuotasPagadas === 'string'
        ? JSON.parse(payment.cuotasPagadas)
        : payment.cuotasPagadas || [];
    } catch {
      cuotasPagadas = [];
    }

    printer.alignCenter();
    printer.bold(true);
    printer.println((company?.name || 'MICROCAPITAL - IXTEPEC').toUpperCase());
    printer.bold(false);
    printer.println(`Tel: ${company?.phone || '-'}`);
    printer.drawLine();

    printer.bold(true);
    printer.println('COMPROBANTE DE PAGO');
    printer.bold(false);
    printer.drawLine();

    printer.alignLeft();
    printer.leftRight('Folio:', (payment?.receiptNumber || '').toUpperCase());
    printer.leftRight('Cliente:', loan?.customer?.fullName || '-');
    printer.leftRight('Monto:', cur(loan?.principalAmount));
    printer.leftRight('Cuota:', cur(loan?.periodicPayment));
    printer.leftRight('Saldo:', cur(stats?.saldo));
    printer.drawLine();

    printer.leftRight('Pago realizado:', `${stats?.cuotasPagadas ?? 0}/${stats?.totalCuotas ?? 0}`);
    printer.leftRight('Pagos pendientes:', String(stats?.cuotasPendientes ?? 0));

    printer.println('Cuotas pagadas:');
    cuotasPagadas.forEach(c => {
      printer.leftRight(`#${c.periodo}`, String(c.fecha));
    });

    printer.drawLine();

    printer.bold(true);
    printer.leftRight('TOTAL RECIBIDO', cur(payment?.amountPaid));
    printer.bold(false);

    printer.drawLine();

    printer.leftRight('Fecha y hora:', String(payment?.createdAt || payment?.paymentDate || ''));
    printer.leftRight('Fecha aplicacion:', String(payment?.paymentDate || ''));

    printer.drawLine();
    printer.alignCenter();
    printer.bold(true);
    printer.println('Gracias por su pago!');
    printer.bold(false);
    printer.println('Conserve este comprobante');

    printer.newLine();
    printer.cut();

    await printer.execute();
  }
}