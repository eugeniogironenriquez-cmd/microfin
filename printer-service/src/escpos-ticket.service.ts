import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFile } from "child_process";
import iconv from "iconv-lite";

function cur(v: any) {
  return (
    "$" +
    (Number(v) || 0).toLocaleString("es-MX", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

function text(s: string) {
  return iconv.encode(s, "cp850");
}



export class EscPosTicketService {
  async print(data: any, printerName: string) {
    const { payment, loan, company, stats } = data;

    let cuotasPagadas: any[] = [];
    try {
      cuotasPagadas =
        typeof payment.cuotasPagadas === "string"
          ? JSON.parse(payment.cuotasPagadas)
          : payment.cuotasPagadas || [];
    } catch {
      cuotasPagadas = [];
    }

    const chunks: Buffer[] = [];

    const cmd = (...bytes: number[]) => chunks.push(Buffer.from(bytes));
    const line = (value = "") =>
      chunks.push(Buffer.concat([text(value), Buffer.from("\n")]));

    const center = () => cmd(0x1b, 0x61, 0x01);
    const left = () => cmd(0x1b, 0x61, 0x00);
    const boldOn = () => cmd(0x1b, 0x45, 0x01);
    const boldOff = () => cmd(0x1b, 0x45, 0x00);
    const cut = () => cmd(0x1d, 0x56, 0x00);

    const sep = () => line("=====================================");

    const row = (label: string, value: string) => {
      const width = 48;
      const labelW = 22;
      const l = label.substring(0, labelW);
      const v = value.substring(0, width - labelW);
      line(l.padEnd(labelW) + v.padStart(width - labelW));
    };

    cmd(0x1b, 0x40);
    cmd(0x1b, 0x74, 2);

    center();
    boldOn();
    line((company?.name || "MICROCAPITAL - IXTEPEC").toUpperCase());
    boldOff();
    line(`Tel: ${company?.phone || "-"}`);
    sep();

    boldOn();
    line("COMPROBANTE DE PAGO");
    boldOff();
    sep();

    left();
    row("Folio:", (payment?.receiptNumber || "").toUpperCase());
    row("Cliente:", loan?.customer?.fullName || "-");
    row("Monto:", cur(loan?.principalAmount));
    row("Cuota:", cur(loan?.periodicPayment));
    row("Saldo:", cur(stats?.saldo));
    center();
    sep();
    left();
    row(
      "Pago realizado:",
      `${stats?.cuotasPagadas ?? 0}/${stats?.totalCuotas ?? 0}`,
    );
    row("Pendientes:", String(stats?.cuotasPendientes ?? 0));

    line("Cuotas pagadas:");
    cuotasPagadas.forEach((c) => row(`#${c.periodo}`, String(c.fecha)));
    if (Number(payment?.lateInterestApplied ?? 0) !== 0) {
      row("Mora Cobrada:", cur(payment.lateInterestApplied));
    }
    center()
    sep();
    left();
    boldOn();
    row("TOTAL RECIBIDO", cur(payment?.amountPaid));    
    boldOff();
    row("Forma de pago:", paymentMethodText(payment?.method));
    
    center();
    sep();
    left();
    const fechaHora = new Date(new Date(payment.createdAt).getTime());

    const d = fechaHora;

    const fechaHoraStr =
      `${String(d.getDate()).padStart(2, "0")}/` +
      `${String(d.getMonth() + 1).padStart(2, "0")}/` +
      `${d.getFullYear()} ` +
      `${String(d.getHours() - 1).padStart(2, "0")}:` +
      `${String(d.getMinutes()).padStart(2, "0")}`;

    row("Fecha y hora:", fechaHoraStr);
    //row("Fecha aplic:", String(payment?.paymentDate || ""));
    center();
    sep();

    boldOn();
    line("Gracias por su pago!");
    boldOff();
    line("Conserve este comprobante");

    cut();

    const filePath = path.join(os.tmpdir(), `ticket-${Date.now()}.bin`);
    fs.writeFileSync(filePath, Buffer.concat(chunks));

    await this.sendRawToPrinter(filePath, printerName);

    fs.unlinkSync(filePath);
  }

  private sendRawToPrinter(
    filePath: string,
    printerName: string,
  ): Promise<void> {
    const ps = `
$printerName = "${printerName.replace(/"/g, '\\"')}"
$filePath = "${filePath.replace(/\\/g, "\\\\")}"
$bytes = [System.IO.File]::ReadAllBytes($filePath)

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class RawPrinterHelper {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)]
  public class DOCINFOA {
    [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
  }

  [DllImport("winspool.Drv", EntryPoint="OpenPrinterA", SetLastError=true, CharSet=CharSet.Ansi)]
  public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);

  [DllImport("winspool.Drv", EntryPoint="ClosePrinter", SetLastError=true)]
  public static extern bool ClosePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint="StartDocPrinterA", SetLastError=true, CharSet=CharSet.Ansi)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In] DOCINFOA di);

  [DllImport("winspool.Drv", EntryPoint="EndDocPrinter", SetLastError=true)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint="StartPagePrinter", SetLastError=true)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint="EndPagePrinter", SetLastError=true)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true)]
  public static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, int dwCount, out int dwWritten);
}
"@

$hPrinter = [IntPtr]::Zero
if (-not [RawPrinterHelper]::OpenPrinter($printerName, [ref]$hPrinter, [IntPtr]::Zero)) {
  throw "No se pudo abrir la impresora: $printerName"
}

$doc = New-Object RawPrinterHelper+DOCINFOA
$doc.pDocName = "MicroCapital Ticket"
$doc.pDataType = "RAW"

[RawPrinterHelper]::StartDocPrinter($hPrinter, 1, $doc) | Out-Null
[RawPrinterHelper]::StartPagePrinter($hPrinter) | Out-Null

$written = 0
[RawPrinterHelper]::WritePrinter($hPrinter, $bytes, $bytes.Length, [ref]$written) | Out-Null

[RawPrinterHelper]::EndPagePrinter($hPrinter) | Out-Null
[RawPrinterHelper]::EndDocPrinter($hPrinter) | Out-Null
[RawPrinterHelper]::ClosePrinter($hPrinter) | Out-Null
`;

    return new Promise((resolve, reject) => {
      execFile(
        "powershell.exe",
        ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps],
        (error) => {
          if (error) reject(error);
          else resolve();
        },
      );
    });
  }
}

function paymentMethodText(method: string): string {
  switch (method) {
    case "EFECTIVO":
      return "Efectivo";

    case "TRANSFERENCIA":
      return "Transferencia";

    case "DEPOSITO":
      return "Depósito";

    case "TARJETA":
      return "Tarjeta";

    case "CHEQUE":
      return "Cheque";

    default:
      return method || "-";
  }
}
