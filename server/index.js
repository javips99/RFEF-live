require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');
const path      = require('path');
const cron      = require('node-cron');

const rfefRoutes               = require('./routes/rfef');
const { resetApiCallsCounter } = require('./services/apiFootball');

const app    = express();
const PORT   = process.env.PORT   || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

// ─── Advertencia temprana si falta la API key ────────────────────────────────
if (!process.env.API_KEY) {
  console.warn('⚠️  API_KEY no definida en .env — copia .env.example a .env y añade tu clave.');
}

// ═══════════════════════════════════════════════════════════════════
//  MEDIDA 4 — HELMET: Headers de seguridad HTTP
//  Configura Content-Security-Policy, HSTS, X-Frame-Options, etc.
// ═══════════════════════════════════════════════════════════════════
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      // Sin 'unsafe-inline' ni 'unsafe-eval' — todos los scripts son archivos externos
      scriptSrc:   ["'self'"],
      // 'unsafe-inline' necesario para estilos inline en HTML generado desde JS
      styleSrc:    ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc:     ["'self'", 'https://fonts.gstatic.com'],
      // Logos de equipos: api-sports + TheSportsDB; data: para SVG fallbacks
      imgSrc:      ["'self'", 'data:', 'https://media.api-sports.io', 'https://r2.thesportsdb.com', 'https://www.thesportsdb.com'],
      // Solo llamadas al propio servidor — nunca al exterior desde el cliente
      connectSrc:  ["'self'"],
      frameSrc:    ["'none'"],
      objectSrc:   ["'none'"],
      baseUri:     ["'self'"],
      formAction:  ["'self'"],
    },
  },
  // HSTS: fuerza HTTPS durante 1 año (solo efectivo si el servidor usa HTTPS)
  strictTransportSecurity: {
    maxAge:            31_536_000,
    includeSubDomains: true,
    preload:           true,
  },
}));

// ═══════════════════════════════════════════════════════════════════
//  MEDIDA 6 — CORS: solo orígenes autorizados
// ═══════════════════════════════════════════════════════════════════
const allowedOrigins = IS_PROD
  ? (process.env.ALLOWED_ORIGIN ? [process.env.ALLOWED_ORIGIN] : [])
  : ['http://localhost:3000', 'http://127.0.0.1:3000'];

app.use(cors({
  origin: (origin, callback) => {
    // Peticiones sin Origin (same-origin, curl, herramientas de test) → siempre pasan
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origen no permitido — ${origin}`));
  },
  optionsSuccessStatus: 200,
}));

app.use(express.json());

// ─── Logger de peticiones ────────────────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.originalUrl}` +
      ` → ${res.statusCode} (${Date.now() - start}ms)`
    );
  });
  next();
});

// ═══════════════════════════════════════════════════════════════════
//  MEDIDA 3 — RATE LIMITING: máximo 30 peticiones/minuto por IP a /api/*
// ═══════════════════════════════════════════════════════════════════
const apiLimiter = rateLimit({
  windowMs:        60 * 1000,  // ventana de 1 minuto
  max:             30,          // máximo 30 peticiones por IP y ventana
  standardHeaders: true,        // devuelve RateLimit-* headers (RFC 6585)
  legacyHeaders:   false,       // no devuelve X-RateLimit-* anticuados
  message: {
    error: 'Demasiadas peticiones desde esta IP. Máximo 30 por minuto. Inténtalo más tarde.',
  },
  // En producción, confiar en el header X-Forwarded-For del proxy/CDN
  ...(IS_PROD && { trustProxy: true }),
});

// ─── Rutas de la API ─────────────────────────────────────────────────────────
app.use('/api', apiLimiter, rfefRoutes);

// 404 para rutas de API no definidas — debe ir ANTES del fallback SPA
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: `Ruta de API no encontrada: ${req.method} ${req.path}` });
});

// ─── Archivos estáticos ──────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'public')));

// Fallback SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ═══════════════════════════════════════════════════════════════════
//  MEDIDA 7 — ERROR HANDLER: sin stack traces en producción
// ═══════════════════════════════════════════════════════════════════
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  // Error de CORS — 403 Forbidden
  if (err.message?.startsWith('CORS:')) {
    return res.status(403).json({ error: err.message });
  }

  console.error('[ERROR GLOBAL]', IS_PROD ? err.message : err);

  if (IS_PROD) {
    // En producción: mensaje genérico, sin detalles internos
    res.status(500).json({ error: 'Error interno del servidor' });
  } else {
    // En desarrollo: detalles completos para facilitar el debug
    res.status(500).json({
      error:   'Error interno del servidor',
      message: err.message,
      stack:   err.stack,
    });
  }
});

// ─── Cron: resetea el contador de llamadas a medianoche UTC ─────────────────
cron.schedule('1 0 * * *', () => {
  resetApiCallsCounter();
  console.log('[CRON] Nueva jornada — cuota y contador reseteados (100 llamadas disponibles)');
}, { timezone: 'UTC' });

// ─── Arranque ────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀  RFEF Live → http://localhost:${PORT}`);
  console.log(`    Entorno  : ${IS_PROD ? 'production' : 'development'}`);
  console.log(`    API key  : ${process.env.API_KEY ? '✅ definida' : '❌ no definida'}`);
  console.log(`    CORS     : ${IS_PROD ? (allowedOrigins[0] || 'solo mismo origen') : 'localhost (dev)'}\n`);
});
