import express from "express";
import cors from "cors";
import { exec } from "child_process";
import { EscPosTicketService } from "./escpos-ticket.service";
import fs from "fs";
import path from "path";

const app = express();
const ticketService = new EscPosTicketService();
const CONFIG_PATH = path.join(process.cwd(), "config.json");

app.use(cors());
app.use(express.json({ limit: "5mb" }));

app.get("/status", (_req, res) => {
  res.json({ ok: true, service: "MicroCapital Print Service" });
});

function getConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify({ printerName: "" }, null, 2));
  }

  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
}

function saveConfig(config: any) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

app.get("/config", (_req, res) => {
  res.json(getConfig());
});

app.post("/config", (req, res) => {
  const { printerName } = req.body;

  saveConfig({
    printerName: printerName || "",
  });

  res.json({ ok: true });
});

app.get("/printers", (_req, res) => {
  exec(
    'powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Printer | Select-Object -ExpandProperty Name"',
    (error, stdout) => {
      if (error) return res.json([]);

      const printers = stdout
        .split(/\r?\n/)
        .map((x) => x.trim())
        .filter(Boolean);

      res.json(printers);
    },
  );
});

app.post("/print-ticket", async (req, res) => {
  try {
    const { data } = req.body;
    const config = getConfig();
    const printerName = config.printerName;

    if (!printerName) {
      return res.status(400).json({
        ok: false,
        message: "No hay impresora configurada en este equipo.",
      });
    }

    if (!data) {
      return res.status(400).json({ ok: false, message: "data es requerido" });
    }

    await ticketService.print(data, printerName);

    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({
      ok: false,
      message: e.message || "Error al imprimir",
    });
  }
});

app.listen(3100, () => {
  console.log("MicroCapital Print Service listo en http://localhost:3100");
});
