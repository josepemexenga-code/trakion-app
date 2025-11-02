import express from "express";
import bodyParser from "body-parser";
import fs from "fs";
import path from "path";
import nodemailer from "nodemailer";
import cors from "cors";

const app = express();
app.use(express.static("public"));
app.use(bodyParser.json());
app.use(cors());

// PATH archivo
const FILE_PATH = path.join(process.cwd(), "solicitudes.json");

// Helper: leer/crear archivo
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

// Configurar transporter con variables de entorno
// Define en Render: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, FROM_ADDRESS, ADMIN_EMAIL
const smtpHost = process.env.SMTP_HOST;
const smtpPort = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : undefined;
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const fromAddress = process.env.FROM_ADDRESS || "no-reply@tuempresa.com";
const adminEmail = process.env.ADMIN_EMAIL || "jsoliz@iasa-sa.com";

let transporter = null;
if (smtpHost && smtpPort && smtpUser && smtpPass) {
  transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465, // true para 465, false para otros puertos
    auth: {
      user: smtpUser,
      pass: smtpPass
    }
  });

  // Opcional: verificar conexión al iniciar
  transporter.verify()
    .then(() => console.log("✅ SMTP conectado correctamente"))
    .catch((err) => console.error("⚠️ Error conectando SMTP:", err.message));
} else {
  console.warn("⚠️ No hay configuración SMTP completa. No se enviarán correos. Define SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS en las env vars.");
}

// Ruta para recibir la solicitud
app.post("/api/solicitud", async (req, res) => {
  const data = req.body;
  if (!data) return res.status(400).send({ error: "Sin datos" });

  // Agregar timestamp y id sencillo
  data._id = Date.now().toString();
  data._createdAt = new Date().toISOString();

  // Guardar en archivo
  const solicitudes = readSolicitudes();
  solicitudes.push(data);
  writeSolicitudes(solicitudes);

  console.log("✅ Nueva solicitud recibida:", data._id);

  // Enviar correo (si transporter está configurado)
  if (transporter) {
    try {
      // Correo al ADMIN (interno)
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

      // Correo al solicitante (si envió correo)
      if (data.correo) {
        const userSubject = `Confirmación de solicitud ${data._id}`;
        const userHtml = `
          <p>Hola ${data.chofer || ""},</p>
          <p>Hemos recibido tu solicitud con ID <strong>${data._id}</strong>. Detalles:</p>
          <ul>
            <li>Fecha programacion: ${data.fecha_programacion || "-"}</li>
            <li>Proveedor: ${data.proveedor || "-"}</li>
            <li>Placa: ${data.placa || "-"}</li>
          </ul>
          <p>Si necesitas asistencia responde a este correo.</p>
          <p>Atte. Equipo IASA</p>
        `;
        await transporter.sendMail({
          from: fromAddress,
          to: data.correo,
          subject: userSubject,
          html: userHtml
        });
      }
      console.log("✅ Correos (admin/usuario) enviados para:", data._id);
    } catch (err) {
      console.error("❌ Error enviando correo:", err);
      // No fallamos la petición: devolvemos 200 pero avisamos en body que hubo error en email
      return res.status(200).send({ message: "Solicitud guardada, pero fallo envío de correo", error: err.message });
    }
  }

  res.status(200).send({ message: "Solicitud guardada", id: data._id });
});

// Endpoint para ver solicitudes (sin autenticación por simplicidad)
app.get("/solicitudes", (req, res) => {
  const solicitudes = readSolicitudes();
  res.json(solicitudes);
});

// Fallback raíz
app.get("/", (req, res) => {
  const indexPath = path.join(process.cwd(), "public", "index.html");
  if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
  res.send("<h1>Trakion App - Servidor arriba</h1><p>No hay public/index.html</p>");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
