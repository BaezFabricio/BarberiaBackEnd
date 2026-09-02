# Sistema Barbería — Guía para Claude

## Qué es este proyecto

SaaS multi-tenant para barberías. Cada barbería tiene su propio subdominio y accede al mismo backend compartido. El frontend vive en Vercel, el backend en Render, la base de datos MySQL en Railway (migrando a Clever Cloud).

---

## Estructura de carpetas

```
Sistema-Barberia/
├── frontend-barberia/   → Next.js (Vercel)
├── backend-barberia/    → Express + Sequelize (Render)
└── schema.sql           → Schema completo de la DB
```

---

## Stack

| Capa       | Tecnología                          |
|------------|-------------------------------------|
| Frontend   | Next.js 14, Tailwind, shadcn/ui     |
| Backend    | Node.js, Express, Sequelize (MySQL) |
| Base datos | MySQL (Railway → migrando Clever Cloud) |
| Imágenes   | Cloudinary                          |
| Email      | Resend API                          |
| Auth       | JWT (8h), bcrypt                    |
| Deploy FE  | Vercel                              |
| Deploy BE  | Render                              |

---

## Repos en GitHub

- **Frontend:** `https://github.com/BaezFabricio/BarberiaFrontEnd`
- **Backend:** `https://github.com/BaezFabricio/BarberiaBackEnd`

Cada `git push` a `main` dispara el deploy automáticamente (Vercel y Render).

---

## Multi-tenancy

El `tenantMiddleware` identifica la barbería en cada request:

1. **Por subdominio** del header `Host` (producción): `mibarberia.tuapp.com` → subdominio = `mibarberia`
2. **Por JWT** (desarrollo localhost): el token incluye `idbarberia` en el payload

El middleware carga `req.tenant` con los datos de `empresa_barberia` antes de cada ruta protegida.

---

## Variables de entorno

### Backend (`backend-barberia/.env`)
```
PORT=3001
DB_HOST=
DB_PORT=3306
DB_NAME=
DB_USER=
DB_PASSWORD=
JWT_SECRET=
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
RESEND_API_KEY=
FRONTEND_URL=https://barberia-front-sno4.vercel.app
BACKEND_URL=https://barberiabackend.onrender.com
WHATSAPP_ENABLED=false
```

### Frontend (`frontend-barberia/.env.local`)
```
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
NEXT_PUBLIC_DEV_SUBDOMINIO=barberiabackend
```

En producción Vercel usa:
```
NEXT_PUBLIC_BACKEND_URL=https://barberiabackend.onrender.com
```

---

## Modelos de base de datos

| Tabla                | Descripción                                      |
|----------------------|--------------------------------------------------|
| `empresa_barberia`   | Tenant principal. Config, colores, horarios      |
| `persona`            | Datos base de cualquier persona (nombre, tel)    |
| `usuario`            | Barbero/admin. Hereda de persona. Tiene rol/pass |
| `cliente`            | Cliente de la barbería. Hereda de persona        |
| `servicio`           | Servicios ofrecidos (corte, barba, etc.)         |
| `producto`           | Productos en venta (ceras, shampoos, etc.)       |
| `agenda_turno`       | Turnos reservados                                |
| `pago_servicio`      | Cobros de turnos                                 |
| `venta_producto`     | Ventas de productos                              |
| `gastos`             | Gastos del negocio                               |
| `horarios_atencion`  | Horarios por barbero                             |
| `notificaciones`     | Notificaciones internas                          |
| `imagenes_galeria`   | Imágenes de galería / foto de perfil             |
| `imagenes_carrusel`  | Carrusel del landing                             |
| `turno_token`        | Tokens para confirmar/cancelar turno por email   |

---

## Rutas del backend

### Públicas (`/api/` sin auth)
- `GET /landing/config` — datos de la barbería para el landing (servicios, barberos, config)
- `POST /turnos/reservar` — reservar turno sin login
- `POST /auth/login` — login de usuario

### Protegidas (`/api/` + JWT + tenantMiddleware)
Prefijadas con el subdominio. Ejemplos:
- `GET /api/mi-barberia` — config del tenant actual
- `GET /api/barberos` — lista barberos
- `POST /api/barberos` — crear barbero
- `PATCH /api/barberos/:id/password` — cambiar contraseña
- `DELETE /api/barberos/:id` — eliminar barbero
- `GET /api/servicios` — listar servicios
- `POST /api/servicios` — crear servicio
- `POST /api/servicios/:id/imagen` — subir imagen (Cloudinary)
- `GET /api/agenda` — agenda del día
- `GET /api/clientes` — lista clientes
- `GET /api/productos` — productos
- `GET /api/pagos` — historial de cobros
- `GET /api/ventas` — historial de ventas
- `GET /api/gastos` — gastos
- `GET /api/reportes` — estadísticas
- `PUT /api/config` — actualizar config de la barbería

---

## Frontend — páginas principales

| Ruta                        | Descripción                            |
|-----------------------------|----------------------------------------|
| `/`                         | Landing público (reserva de turno)     |
| `/login`                    | Login                                  |
| `/admin`                    | Dashboard admin                        |
| `/admin/agenda`             | Agenda del día                         |
| `/admin/barberos`           | Gestión de barberos                    |
| `/admin/servicios`          | Gestión de servicios                   |
| `/admin/productos`          | Gestión de productos                   |
| `/admin/clientes`           | Lista de clientes                      |
| `/admin/pagos`              | Cobros (tabs: Servicios / Productos)   |
| `/admin/gastos`             | Gastos                                 |
| `/admin/reportes`           | Estadísticas del negocio               |
| `/admin/configuracion`      | Config de la barbería (colores, logo)  |
| `/admin/notificaciones`     | Notificaciones                         |

---

## Funcionalidades implementadas

- **Reserva online** paso a paso: Servicio → Barbero → Fecha/hora → Datos → Confirmación
- **Agenda**: vista del día, cambio de estado (pendiente → confirmado → atendido → cobrado)
- **Cobro de turno**: registra pago con método y calcula comisión al barbero
- **Venta de productos**: descuenta stock automáticamente
- **Barberos**: crear, editar, activar/desactivar (queda inactivo, no desaparece), eliminar con confirmación, cambiar contraseña desde admin
- **Estado del barbero**: badge Activo/Inactivo en tabla. Los barberos inactivos no aparecen en la agenda ni en la reserva online
- **Servicios**: con imagen subida a Cloudinary. Tarjetas con layout horizontal (imagen izquierda 40%, contenido derecho)
- **Configuración del landing**: logo, colores, slogan, horarios, redes sociales, fuente del header (Cinzel, Playfair Display, Oswald, Bebas Neue, Abril Fatface), colores por palabra del nombre
- **Notificaciones**: email via Resend, WhatsApp via CallMeBot (opcional)
- **Reportes**: ingresos, gastos, comisiones por período
- **Modo dark/light**: toggle en el header

---

## Diseño / UI

- shadcn/ui como base de componentes
- Sidebar colapsable: en desktop se colapsa a íconos, en mobile se convierte en Sheet (drawer)
- Fix importante: `SidebarInset` usa `min-w-0 flex-1` (no `w-full`) para evitar overflow en mobile
- CSS override en `globals.css` para ocultar sidebar strip en mobile
- Colores primarios configurables por barbería: se guardan en `localStorage` como hex y se convierten a oklch al cargar

---

## Migraciones de DB

No hay sistema de migraciones formal. Las columnas nuevas se agregan con `ALTER TABLE` en `server.js` al arrancar:

```js
// En levantarServidor() antes de app.listen
try {
  await sequelize.query("ALTER TABLE empresa_barberia ADD COLUMN nueva_col VARCHAR(50) DEFAULT 'valor'");
} catch (e) { /* ya existe, ignorar */ }
```

El `app.listen` está **después** de las migraciones para que no entren requests antes de que la DB esté lista.

---

## Comandos útiles

```bash
# Backend local
cd backend-barberia
npm run dev

# Frontend local
cd frontend-barberia
npm run dev

# Deploy (automático al push, pero para forzar)
git commit --allow-empty -m "chore: trigger redeploy"
git push
```

---

## Cosas pendientes / deuda técnica

- Migrar DB de Railway a Clever Cloud (usar `schema.sql` para crear las tablas)
- Actualizar variables de entorno del backend con los nuevos datos de Clever Cloud
- Sistema de notificaciones por email (Resend) y WhatsApp (CallMeBot) — infraestructura lista, falta configurar credenciales por tenant
- No hay sistema de migraciones formal (Sequelize migrations) — todo se hace con ALTER TABLE manual en server.js
