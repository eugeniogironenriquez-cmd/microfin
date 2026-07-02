import express from 'express';
import cors from 'cors';
import { exec } from 'child_process';
import { EscPosTicketService } from './escpos-ticket.service';

const app = express();
const ticketService = new EscPosTicketService();

app.use(cors());
app.use(express.json({ limit: '5mb' }));

app.get('/status', (_req, res) => {
  res.json({ ok: true, service: 'MicroCapital Print Service' });
});

app.get('/printers', (_req, res) => {
  exec(
    'powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Printer | Select-Object -ExpandProperty Name"',
    (error, stdout) => {
      if (error) return res.json([]);

      const printers = stdout
        .split(/\r?\n/)
        .map(x => x.trim())
        .filter(Boolean);

      res.json(printers);
    },
  );
});

app.post('/print-ticket', async (req, res) => {
  try {
    const { printerName, data } = req.body;

    if (!printerName) {
      return res.status(400).json({ ok: false, message: 'printerName es requerido' });
    }

    if (!data) {
      return res.status(400).json({ ok: false, message: 'data es requerido' });
    }

    await ticketService.print(data, printerName);

    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({
      ok: false,
      message: e.message || 'Error al imprimir',
    });
  }
});

app.listen(3100, () => {
  console.log('MicroCapital Print Service listo en http://localhost:3100');
});