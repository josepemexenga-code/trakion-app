import express from "express";
import bodyParser from "body-parser";
import fs from "fs";
import path from "path";
import nodemailer from "nodemailer";
import cors from "cors";
import XLSX from "xlsx";

const app = express();

// Middlewares
app.use(cors());
app.use(express.static("public"));
app.use(bodyParser.json());

// Archivo local para persistencia
const FILE_PATH = path.join(process.cwd(), "solicitudes.json");

// Helpers para leer/escribir JSON
function readSolicitudes() {
  try {
    if (!fs.existsSync(FILE_PATH)) return [];
    const raw = fs.readFileSync(FILE_PATH, "utf8");
    return JSON.parse(raw || "[]");
  } catch (err) {
    console.error("Error leyendo solicitudes.json:", err);
    return [];
  }
}

function writeSolicitudes(arr) {
  try {
    fs.writeFileSync(FILE_PATH, JSON.stringify(arr, null, 2), "utf8");
  } catch (err) {
    console.error("Error escribiendo solicitudes.json:", err);
  }
}

// Configuración SMTP (opcional)
let transporter = null;
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;

if (smtpUser && smtpPass) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.office365.com",
    port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587,
    secure: false,
    auth: { user: smtpUser, pass: smtpPass }
  });

  transporter.verify()
    .then(() => console.log("✅ SMTP conectado correctamente"))
    .catch(err => console.warn("⚠️ Error conectando SMTP:", err.message));
} else {
  console.log("⚠️ SMTP no configurado. Emails no serán enviados.");
}

// POST /api/solicitud -> guardar solicitud y enviar correo opcional
app.post("/api/solicitud", async (req, res) => {
  const data = req.body || {};
  data._id = Date.now().toString();
  data._createdAt = new Date().toISOString();

  // Guardar solicitud
  try {
    const solicitudes = readSolicitudes();
    solicitudes.push(data);
    writeSolicitudes(solicitudes);
    console.log(`✅ Nueva solicitud recibida: ${data._id}`);
  } catch (err) {
    console.error("❌ Error guardando solicitud:", err);
  }

  // Intentar enviar correo si SMTP configurado
  if (transporter) {
    try {
      // Correo al admin
      await transporter.sendMail({
        from: smtpUser,
        to: process.env.ADMIN_EMAIL || smtpUser,
        subject: `Nueva solicitud ${data._id} - ${data.chofer || "Sin chofer"}`,
        html: `<pre>${JSON.stringify(data, null, 2)}</pre>`
      });

      // Correo al solicitante
      if (data.correo) {
        await transporter.sendMail({
          from: smtpUser,
          to: data.correo,
          subject: `Confirmación de solicitud ${data._id}`,
          html: `<p>Solicitud recibida con ID: ${data._id}</p>`
        });
      }

      console.log(`✅ Correos enviados para solicitud ${data._id}`);
    } catch (err) {
      console.warn("⚠️ Error enviando correo, pero la solicitud se guardó:", err.message);
    }
  }

  // Responder siempre 200
  res.status(200).send({ message: "Solicitud guardada", id: data._id });
});

// GET /solicitudes -> ver todas
app.get("/solicitudes", (req, res) => {
  res.json(readSolicitudes());
});

// GET /export -> exportar Excel
app.get("/export", (req, res) => {
  const solicitudes = readSolicitudes();
  if (!solicitudes.length) return res.status(404).send("No hay solicitudes para exportar");

  const data = solicitudes.map(s => ({
    ID: s._id,
    Fecha: s._createdAt,
    Chofer: s.chofer,
    Proveedor: s.proveedor,
    Placa: s.placa,
    Producto: s.producto,
    Peso: s.peso_tn,
    Correo: s.correo,
    Observaciones: s.observaciones
  }));

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(workbook, worksheet, "Solicitudes");

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Disposition", "attachment; filename=solicitudes.xlsx");
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(buffer);
});

// Fallback raíz
app.get("/", (req, res) => {
  const indexPath = path.join(process.cwd(), "public", "index.html");
  if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
  res.send("<h1>Trakion App - Servidor arriba</h1><p>No hay public/index.html</p>");
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
