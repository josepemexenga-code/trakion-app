import express from "express";
import bodyParser from "body-parser";
import fs from "fs";
import path from "path";
import nodemailer from "nodemailer";
import cors from "cors";

const app = express();

// Middlewares
app.use(cors());
app.use(express.static("public"));
app.use(bodyParser.json());

// Archivo de persistencia (local)
const FILE_PATH = path.join(process.cwd(), "solicitudes.json");

// Helpers para leer/escribir el JSON
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

// Configuración SMTP via env vars
const smtpHost = process.env.SMTP_HOST;
const smtpPort = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : undefined;
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const fromAddress = process.env.FROM_ADDRESS || "no-reply@iasa-sa.com";
const adminEmail = process.env.ADMIN_EMAIL || "jsoliz@iasa-sa.com";

let transporter = null;
if (smtpHost && smtpPort && smtpUser && smtpPass) {
  transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: smtpUser, pass: smtpPass }
  });

  transporter.verify()
    .then(() => console.log("✅ SMTP conectado correctamente"))
    .catch((err) => console.warn("⚠️ Error conectando SMTP (verifica vars):", err.message));
} else {
  console.warn("⚠️ SMTP no configurado. Define SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS para habilitar envíos.");
}

// POST /api/solicitud -> guarda y (opcional) envía email
app.post("/api/solicitud", async (req, res) => {
  const data = req.body;
  if (!data || Object.keys(data).length === 0) {
    return res.status(400).send({ error: "Sin datos en el body" });
  }

  // Enriquecer con id y timestamp
  data._id = Date.now().toString();
  data._createdAt = new Date().toISOString();

  // Guardar en archivo
  const solicitudes = readSolicitudes();
  solicitudes.push(data);
  writeSolicitudes(solicitudes);

  console.log(`✅ Nueva solicitud recibida: ${data._id}`);

  // Intentar enviar correos si transporter está disponible
  if (transporter) {
    try {
      // Correo al admin
      const adminSubject = `Nueva solicitud ${data._id} - ${data.chofer || "Sin chofer"}`;
      const adminHtml = `
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
      `;

      await transporter.sendMail({
        from: fromAddress,
        to: adminEmail,
        subject: adminSubject,
        html: adminHtml
      });

      // Correo al solicitante (si hay correo)
      if (data.correo) {
        const userSubject = `Confirmación de solicitud ${data._id}`;
        const userHtml = `
          <p>Hola ${data.chofer || ""},</p>
          <p>Hemos recibido tu solicitud con ID <strong>${data._id}</strong>. Detalles principales:</p>
          <ul>
            <li>Fecha programacion: ${data.fecha_programacion || "-"}</li>
            <li>Proveedor: ${data.proveedor || "-"}</li>
            <li>Placa: ${data.placa || "-"}</li>
          </ul>
          <p>Atte. Equipo IASA</p>
        `;
        await transporter.sendMail({
          from: fromAddress,
          to: data.correo,
          subject: userSubject,
          html: userHtml
        });
      }

      console.log(`✅ Correos enviados para solicitud ${data._id}`);
    } catch (err) {
      console.error("❌ Error enviando correo:", err);
      // Devolver 200 (la solicitud se guardó) pero informar el error en la respuesta
      return res.status(200).send({ message: "Solicitud guardada, fallo envío de correo", id: data._id, emailError: err.message });
    }
  }

  // Responder éxito
  return res.status(200).send({ message: "Solicitud guardada", id: data._id });
});

// GET /solicitudes -> ver todas las solicitudes (sin auth)
app.get("/solicitudes", (req, res) => {
  const solicitudes = readSolicitudes();
  res.json(solicitudes);
});

// Fallback para raíz
app.get("/", (req, res) => {
  const indexPath = path.join(process.cwd(), "public", "index.html");
  if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
  res.send("<h1>Trakion App - Servidor arriba</h1><p>No hay public/index.html</p>");
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
