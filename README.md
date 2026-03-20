# RFEF Live

![Node.js](https://img.shields.io/badge/Node.js-22.x-339933?style=flat-square&logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4.x-000000?style=flat-square&logo=express&logoColor=white)
![API-Sports](https://img.shields.io/badge/API--Sports-v3-FF6B00?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)

> Datos en tiempo real de **Primera y Segunda Federación Española** de fútbol. Clasificaciones, próximos partidos, resultados recientes y marcadores en directo — con caché inteligente para no superar las 100 llamadas/día del plan gratuito.

**[🌐 Ver demo en vivo](https://rfef-live.onrender.com)**

![Preview](./docs/preview.png)

---

## Características

- ✅ Clasificación en tiempo real (Primera y Segunda RFEF, todos los grupos)
- ✅ Próximos partidos con fecha y hora en horario España (Europe/Madrid)
- ✅ Resultados recientes con marcador final
- ✅ Partidos en directo con marcador y minuto actual
- ✅ Filtro por liga (Primera / Segunda) y grupo (1-5)
- ✅ Diseño oficial estilo RFEF (`#0D1B2A` azul marino + `#CC0000` rojo)
- ✅ Caché inteligente multinivel — máximo 100 llamadas/día al plan gratuito
- ✅ Contador de llamadas API visible en el footer con alertas visuales
- ✅ Fallback con datos guardados si se agota la cuota diaria

---

## Instalación y uso local

### Requisitos previos

- [Node.js](https://nodejs.org/) v18 o superior
- Cuenta gratuita en [API-Sports](https://dashboard.api-football.com/)

### Pasos

```bash
# 1. Clona el repositorio
git clone https://github.com/javips99/rfef-live.git
cd rfef-live

# 2. Instala las dependencias
npm install

# 3. Copia y configura las variables de entorno
cp .env.example .env
# Abre .env y añade tu API Key (ver sección "Configuración de la API")

# 4. Arranca el servidor
npm start
```

Abre `http://localhost:3000` en tu navegador.

Para desarrollo con recarga automática:

```bash
npm run dev
```

---

## Configuración de la API

### 1. Obtener la API Key

1. Regístrate en [dashboard.api-football.com](https://dashboard.api-football.com/)
2. Ve a **Profile > My Access**
3. Copia tu **API Key**
4. Pégala en el fichero `.env`:
   ```
   API_KEY=tu_clave_aqui
   ```

### 2. Verificar los League IDs cada temporada

Los IDs de liga cambian en api-sports con cada temporada. Para verificarlos:

```bash
# Sustituye TU_CLAVE por tu API Key real
curl -s \
  -H "x-apisports-key: TU_CLAVE" \
  "https://v3.football.api-sports.io/leagues?country=Spain&season=2025" \
  | grep -E '"id"|"name"'
```

Los IDs actuales (temporada 2025) configurados en el proyecto:

| Liga | Grupo | League ID |
|------|-------|-----------|
| Primera RFEF | Grupo 1 | 775 |
| Primera RFEF | Grupo 2 | 776 |
| Segunda RFEF | Grupo 1 | 940 |
| Segunda RFEF | Grupo 2 | 941 |
| Segunda RFEF | Grupo 3 | 942 |
| Segunda RFEF | Grupo 4 | 943 |
| Segunda RFEF | Grupo 5 | 944 |

Si cambian, actualízalos en `server/services/apiFootball.js`.

### 3. Verificar el estado de la cuota

```bash
curl http://localhost:3000/api/health
```

Devuelve la cuota usada, restante y estadísticas de caché.

---

## Estructura del proyecto

```
rfef-live/
├── .env                          # Variables de entorno (no subir a Git)
├── .env.example                  # Plantilla de configuración
├── .gitignore
├── package.json
│
├── server/
│   ├── index.js                  # Punto de entrada: Express, seguridad, cron
│   ├── routes/
│   │   └── rfef.js               # Endpoints de la API + validación de inputs
│   └── services/
│       └── apiFootball.js        # Cliente api-sports v3 + caché en memoria
│
└── public/
    ├── index.html                # SPA HTML5 semántico
    ├── css/
    │   └── styles.css            # Diseño responsivo (paleta oficial RFEF)
    └── js/
        ├── app.js                # Controlador principal + estado + polling
        ├── fixtures.js           # Renderizado de próximos partidos
        ├── live.js               # Renderizado de partidos en directo
        ├── standings.js          # Renderizado de clasificaciones
        └── utils.js              # Caché localStorage + utilidades de formato
```

---

## Tech Stack

| Capa | Tecnología | Razón |
|------|-----------|-------|
| Runtime | Node.js 22 | LTS estable, ecosistema npm |
| Framework | Express 4 | Minimalista, amplia documentación |
| Seguridad | Helmet + express-rate-limit | Headers HTTP seguros + protección DDoS |
| HTTP cliente | Axios | Soporte nativo a interceptores y timeouts |
| Cron | node-cron | Reset de contador a medianoche UTC |
| Frontend | Vanilla JS (SPA) | Sin dependencias, carga instantánea |
| Datos | API-Sports v3 | API oficial con datos de RFEF |

---

## Endpoints de la API

| Método | Ruta | Descripción | Query params |
|--------|------|-------------|--------------|
| GET | `/api/standings/:league/:group` | Clasificación de un grupo | — |
| GET | `/api/fixtures/:league/:group` | Próximos partidos | `?next=N` (1-30, default 15) |
| GET | `/api/results/:league/:group` | Últimos resultados | `?last=N` (1-30, default 15) |
| GET | `/api/live` | Partidos en directo | `?league=primera\|segunda` |
| GET | `/api/health` | Estado del servidor y cuota API | — |

**Valores válidos para `:league`:** `primera` o `segunda`
**Valores válidos para `:group`:** `1-2` en Primera, `1-5` en Segunda

---

## Seguridad

- **Helmet**: Configura automáticamente headers HTTP seguros (CSP, HSTS, X-Frame-Options, X-Content-Type-Options).
- **Rate Limiting**: Máximo 30 peticiones por IP por minuto a todos los endpoints `/api/*`. Evita abuso y protege la cuota de API.
- **Validación de inputs**: Todos los parámetros de ruta y query se validan con allowlists y regex antes de procesarse. Inputs inválidos devuelven HTTP 400.
- **CORS**: Configurado con lista blanca de orígenes. En producción acepta solo el dominio configurado en `ALLOWED_ORIGIN`.
- **Sin secretos en código**: La API Key y la configuración sensible se cargan exclusivamente desde variables de entorno (`.env`).
- **CSP estricta**: La Content Security Policy solo permite scripts y estilos del propio servidor (`'self'`), bloqueando inyecciones XSS.

---

## Limitaciones conocidas

### Datos parciales con APIs gratuitas

Esta aplicación utiliza un enfoque híbrido de dos APIs públicas para no depender de ningún plan de pago:

- **TheSportsDB** (gratuita) para clasificaciones, próximos partidos y resultados.
- **api-sports** (plan gratuito, 100 llamadas/día) para partidos en directo.

Los planes gratuitos de ambas APIs imponen restricciones sobre la cantidad de datos devueltos por petición. Como resultado, con la configuración actual se muestran **datos parciales** en clasificaciones y partidos: los primeros registros de cada grupo en lugar de la tabla completa.

| Sección | Plan gratuito | Plan de pago |
|---------|--------------|--------------|
| Clasificación | Parcial (primeros equipos) | Tabla completa (18-20 equipos) |
| Próximos partidos | Parcial (1-2 partidos) | Completo (jornadas completas) |
| Resultados recientes | Parcial (últimos 1-2) | Completo |
| **Partidos en directo** | **✅ Completo** | Completo |

### La arquitectura está preparada para datos completos

El diseño del servicio (`server/services/apiFootball.js`) es completamente agnóstico al plan contratado. Cambiar a datos completos es una operación de configuración, no de código:

- **TheSportsDB Developer** (~9$/mes): desbloquea la tabla completa de clasificación y el historial completo de partidos para todas las ligas RFEF 2025-2026.
- **api-sports Basic**: desbloquea acceso a la temporada en curso con parámetros avanzados de filtrado.

En ambos casos basta con actualizar la API Key en el fichero `.env` — el código no requiere ningún cambio.

### Otras limitaciones

- **api-sports free = 100 llamadas/día.** La caché multinivel (servidor 10-30 min + cliente 2 min) minimiza el consumo. Si se agota la cuota, el sistema activa automáticamente el fallback a datos guardados.
- **Los League IDs deben verificarse cada temporada.** Tanto TheSportsDB como api-sports pueden reasignar IDs al inicio de cada temporada. Consulta la sección "Configuración de la API" para saber cómo verificarlos.
- **Partidos en directo se actualizan cada 60 segundos.** El polling solo está activo cuando el usuario está en la pestaña "En Directo", para conservar la cuota.

---

## Licencia

[MIT](./LICENSE) — [javips99](https://github.com/javips99), 2025
