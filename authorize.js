import { google } from 'googleapis';
import express from 'express';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const port = 3001;
const redirectUri = `http://localhost:${port}/callback`;

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error('❌ Error: Faltan GOOGLE_CLIENT_ID o GOOGLE_CLIENT_SECRET en el archivo .env');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(
  clientId,
  clientSecret,
  redirectUri
);

// We request full drive scope to download files uploaded in any folder
const scopes = [
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/drive'
];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: scopes,
  prompt: 'consent'
});

console.log('=====================================================');
console.log('🔑 INSTRUCCIONES DE AUTORIZACIÓN DE GOOGLE WORKSPACE');
console.log('=====================================================');
console.log('1. Abre la siguiente URL en tu navegador:');
console.log('\n\x1b[36m%s\x1b[0m\n', authUrl);
console.log('2. Concede los permisos a tu cuenta de Google.');
console.log('-----------------------------------------------------');
console.log('Esperando redirección del navegador...');

const app = express();
let server;

app.get('/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) {
    res.send('<h1>Error</h1><p>Código de autorización no proporcionado.</p>');
    return;
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    fs.writeFileSync(path.resolve('tokens.json'), JSON.stringify(tokens, null, 2));
    
    console.log('\n✅ ¡Autenticación exitosa!');
    console.log('Tokens guardados correctamente en "tokens.json".');
    console.log('El servidor temporal se cerrará automáticamente.');
    
    res.send('<h1>¡Autenticación exitosa!</h1><p>Ya puedes cerrar esta pestaña y volver a la terminal.</p>');
    
    setTimeout(() => {
      server.close();
      console.log('👋 Servidor de autorización cerrado.');
      process.exit(0);
    }, 1500);
  } catch (error) {
    console.error('❌ Error al intercambiar el código:', error);
    res.send(`<h1>Error de autenticación</h1><p>${error.message}</p>`);
  }
});

server = app.listen(port, () => {
  console.log(`📡 Servidor de autorización escuchando en http://localhost:${port}`);
});
