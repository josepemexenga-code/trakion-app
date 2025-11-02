import express from "express";
import bodyParser from "body-parser";
import fs from "fs";

const app = express();
app.use(express.static("public"));
app.use(bodyParser.json());

// Guardar solicitudes
app.post("/api/solicitud", (req, res) => {
  const data = req.body;
  const filePath = "solicitudes.json";

  // Guardar o crear archivo JSON
  let solicitudes = [];
  if (fs.existsSync(filePath)) {
    solicitudes = JSON.parse(fs.readFileSync(filePath));
  }
  solicitudes.push(data);
  fs.writeFileSync(filePath, JSON.stringify(solicitudes, null, 2));

  console.log("✅ Nueva solicitud recibida:", data);
  res.status(200).send({ message: "Solicitud guardada" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(Servidor corriendo en puerto ${PORT}));
