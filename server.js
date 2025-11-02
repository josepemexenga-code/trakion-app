import express from "express";
import bodyParser from "body-parser";
import nodemailer from "nodemailer";
import bcrypt from "bcrypt";
import fs from "fs-extra";

const app = express();
app.use(bodyParser.json());
app.use(express.static("public"));

const DB_FILE = "solicitudes.json";
if (!fs.existsSync(DB_FILE)) fs.writeJSONSync(DB_FILE, []);

// Clave admin & hash (ejemplo)
const CLAVE_ADMIN = "MiClaveSegura123";
const HASH = bcrypt.hashSync(CLAVE_ADMIN, 10);

// Variables de entorno para correo (defínelas en Render o .env localmente)
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASS = process.env.ADMIN_PASS;

if (!ADMIN_EMAIL || !ADMIN_PASS) {
  console.warn("Advertencia: ADMIN_EMAIL o ADMIN_PASS no están definidas. Emails no se podrán enviar.");
}

const transporter = nodemailer.createTransport({
  host: "smtp.office365.com",
  port: 587,
  secure: false,
  auth: { user: ADMIN_EMAIL, pass: ADMIN_PASS },
  tls: { rejectUnauthorized: false }
});

// Login administrador
app.post("/login", async (req, res) => {
  const { clave } = req.body;
  const ok = await bcrypt.compare(clave, HASH);
  if (ok) res.send({ ok: true });
  else res.status(401).send("No autorizado");
});

// Enviar solicitud de proveedor
app.post("/solicitud", async (req, res) => {
  const data = { ...req.body, estado: "Pendiente", fechaEnvio: new Date().toISOString() };
  const solicitudes = fs.readJSONSync(DB_FILE);
  solicitudes.push(data);
  fs.writeJSONSync(DB_FILE, solicitudes);

  // Notificación al administrador
  try {
    await transporter.sendMail({
      from: `Trakion App | IASA <${ADMIN_EMAIL}>`,
      to: ADMIN_EMAIL,
      subject: `Nueva solicitud de ${data.proveedor}`,
      html: `<h2>Trakion App | Nueva solicitud</h2>
        <p><b>Proveedor:</b> ${data.proveedor}</p>
        <p><b>Placa:</b> ${data.placa}</p>
        <p><b>Producto:</b> ${data.producto}</p>
        <p><b>Fecha programación:</b> ${data.fecha}</p>
        <p><a href="/admin.html">Abrir panel administrativo</a></p>`
    });
  } catch (err) {
    console.error("Error enviando email de nueva solicitud:", err);
    // no abortamos el flujo; devolvemos OK aunque el email falló
  }

  res.send({ ok: true });
});

// Obtener solicitudes
app.get("/solicitudes.json", (req, res) => {
  const solicitudes = fs.readJSONSync(DB_FILE);
  res.json(solicitudes);
});

// Administrador decide
app.post("/decidir", async (req, res) => {
  const { placa, decision } = req.body;
  const solicitudes = fs.readJSONSync(DB_FILE);
  const idx = solicitudes.findIndex(s => s.placa === placa);
  if (idx === -1) return res.status(404).send("No encontrada");

  solicitudes[idx].estado = decision;
  fs.writeJSONSync(DB_FILE, solicitudes);

  const solicitud = solicitudes[idx];
  try {
    await transporter.sendMail({
      from: `Trakion App | IASA <${ADMIN_EMAIL}>`,
      to: solicitud.email,
      subject: `Trakion App – Solicitud ${decision}`,
      html: `<h2 style="background:#1E88E5;color:#fff;padding:10px;">Trakion App | Confirmación de Solicitud</h2>
        <p>Estimado ${solicitud.proveedor},</p>
        <p>Su solicitud para la unidad <b>${solicitud.placa}</b> con destino <b>${solicitud.destino}</b> ha sido <b>${decision}</b>.</p>
        <p>Saludos cordiales,<br><b>Departamento de Transporte IASA</b></p>`
    });
  } catch (err) {
    console.error("Error enviando email de decisión:", err);
  }

  res.send({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Trakion App corriendo en puerto ${PORT}`));

