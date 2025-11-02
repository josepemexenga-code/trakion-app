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

// Configuración SMTP para Office 365 / Outlook (usa variables de entorno)
const smtpHost = process.env.SMTP_HOST || "smtp.office365.com";
const smtpPort = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587;
const smtpUser = process.env.SMTP_USER; // ej: jsoliz@iasa-sa.com
const smtpPass = process.env.SMTP_PASS; // Balanza456*
const fromAddress = process.env.FROM_ADDRESS || smtpUser;
const adminEmail = process.env.ADMIN_EMAIL || "jsoliz@iasa-sa.com";

let transporter = null;
if (smtpUser && smtpPass) {
  transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: false, // STARTTLS
    auth: { user: smtpUser, pass: smtpPass }
  });

  transporter.verify()
    .then(() => console.log("✅ SMTP conectado correctamente"))
    .catch(err => console.warn("⚠️ Error conectando SMTP:", err.message));
} else {
  console.warn("⚠️ SMTP no configurado. Define SMTP_USER y SMTP_PASS para enviar correos.");
}

// POST /api/solicitud -> guardar solicitud y enviar correo
app.post("/api/solicitud", async (req, res) => {
  const data = req.body;
  if (!data || Object.keys(data).length === 0)
    return res.status(400).send({ error: "Sin datos en el body" });

  data._id = Date.now().toString();
  data._createdAt = new Date().toISOString();

  // Guardar en JSON
  const solicitudes = readSolicitudes();
  solicitudes.push(data);
  writeSolicitudes(solicitudes);

  console.log(`✅ Nueva solicitud recibida: ${data._id}`);

  // Enviar correos
  if (transporter) {
    try {
      // Correo al admin
      await transporter.sendMail({
        from: fromAddress,
        to: adminEmail,
        subject: `Nueva solicitud ${data._id} - ${data.chofer || "Sin chofer"}`,
        html: `
          <h3>Nueva solicitud recibida</h3>
          <p><strong>ID:</strong> ${data._id}</p>
          <p><strong>Fecha:</strong> ${data._createdAt}</p>
          <ul>
            <li><strong>Chofer:</strong> ${data.chofer || "-"}</li>
            <li><strong>Proveedor:</strong> ${data.proveedor || "-"}</li>
            <li><strong>Placa:</strong> ${data.placa || "-"}</li>
            <li><strong>Producto:</strong> ${data.producto || "-"}</li>
            <li><strong>Peso tn:</strong> ${data.peso_tn || "-"}</li>
            <li><strong>Correo solicitante:</strong> ${data.correo || "-"}</li>
          </ul>
          <pre>${JSON.stringify(data, null, 2)}</pre>
        `
      });

      // Correo al solicitante
      if (data.correo) {
        await transporter.sendMail({
          from: fromAddress,
          to: data.correo,
          subject: `Confirmación de solicitud ${data._id}`,
          html: `
            <p>Hola ${data.chofer || ""},</p>
            <p>Hemos recibido tu solicitud con ID <strong>${data._id}</strong>. Detalles:</p>
            <ul>
              <li>Fecha programación: ${data.fecha_programacion || "-"}</li>
              <li>Proveedor: ${data.proveedor || "-"}</li>
              <li>Placa: ${data.placa || "-"}</li>
            </ul>
            <p>Atte. Equipo IASA</p>
          `
        });
      }

      console.log(`✅ Correos enviados para solicitud ${data._id}`);
    } catch (err) {
      console.error("❌ Error enviando correo:", err);
      return res.status(200).send({ message: "Solicitud guardada, fallo envío de correo", id: data._id, emailError: err.message });
    }
  }

  return res.status(200).send({ message: "Solicitud guardada", id: data._id });
});

// GET /solicitudes -> ver todas
app.get("/solicitudes", (req, res) => {
  res.json(readSolicitudes());
});

// GET /export -> exportar Excel
app.get("/export", (req, res) => {
  const solicitudes = readSolicitudes();
  if (!solicitudes || solicitudes.length === 0)
    return res.status(404).send("No hay solicitudes para exportar");

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

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
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
