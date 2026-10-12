# WhatsApp automático (API de WhatsApp de Meta)

Sin configurar nada, cada botón de WhatsApp de la app **abre WhatsApp con el mensaje ya escrito** para esa persona (solo hay que darle enviar).
Con esta configuración, los mismos botones **envían solos** desde el número de la empresa, sin salir de la app.

Mensajes que usa la app: constancia de entrega, recordatorio de documentos pendientes, recibo rechazado, pago de la quincena del chofer y relación de pago del ayudante.

## Qué número usar

- **Más sencillo (recomendado):** una línea nueva solo para avisos de la app (que no esté registrada en WhatsApp). Se conecta directo con Meta, sin pagar a intermediarios.
- **El mismo número del WhatsApp Business del teléfono:** Meta lo permite («coexistencia») si la cuenta ya tiene tiempo y uso, pero normalmente se activa a través de un proveedor (por ejemplo 360dialog), con su costo mensual. Hay que abrir la app del teléfono al menos cada 13 días.

## Pasos

1. **Portafolio de Meta Business** — en business.facebook.com, crea (o usa) el portafolio de *BLOGIX INTERNATIONAL, S.R.L.*
2. **App de Meta** — en developers.facebook.com → Mis apps → Crear app → caso de uso de WhatsApp (tipo «Negocios») y enlázala al portafolio.
3. **Número** — en la app: WhatsApp → Configuración de la API → *Agregar número de teléfono*. Nombre visible «B-Logix», categoría transporte. Llega un código por SMS o llamada.
   Anota el **Identificador del número de teléfono** (Phone number ID) que sale en esa pantalla.
4. **Pago** — en WhatsApp Manager agrega una tarjeta. Meta cobra por mensaje: los de este tipo («Utilidad») cuestan unos US$0.013 en República Dominicana, y son gratis si la persona te escribió en las últimas 24 horas.
5. **Plantillas** — en WhatsApp Manager → Plantillas de mensajes → Crear plantilla, una por cada mensaje de abajo, con el **nombre y el texto exactos**. Meta suele aprobarlas en minutos u horas.
6. **Token permanente** — Configuración del negocio → Usuarios del sistema → Agregar (rol administrador) → Asignar activos: la app y la cuenta de WhatsApp (control total) → *Generar token* con los permisos `whatsapp_business_messaging` y `whatsapp_business_management`, caducidad **Nunca**. Guárdalo: es como una contraseña.
7. **Netlify** — en el sitio *blogix-logistica-dr* → Site configuration → Environment variables, agrega:
   - `WHATSAPP_TOKEN` = el token del paso 6
   - `WHATSAPP_PHONE_NUMBER_ID` = el identificador del paso 3
   - (opcional) `WHATSAPP_LANG` = `es` (cámbialo si registraste las plantillas en otra variante de español, p. ej. `es_MX`)
   Luego vuelve a publicar el sitio (Deploys → Trigger deploy).
8. **Probar en local** (opcional) — pon las mismas dos líneas en el archivo `.env` de la carpeta `app` y reinicia `npm run dev:all`.
9. **Comprobar** — en Nómina, al pasar el mouse sobre el botón de WhatsApp de un chofer debe decir «Se envía automático por WhatsApp». Mándate uno de prueba a tu propio teléfono (pon tu número en un chofer de prueba).

Para que llegue directo a cada persona, su **teléfono debe estar guardado** en la app (Conductores, Socios, Ayudantes). Sin teléfono, la app abre WhatsApp para que elijas el contacto.

## Plantillas (crear en Meta con estos nombres y textos)

### Constancia de entrega

- **Nombre:** `constancia_entrega`
- **Categoría:** Utilidad · **Idioma:** Español
- **Cuerpo** (copiar tal cual):

```
Hola {{1}}, {{2}} recibió hoy {{3}} documento(s) tuyos (entrega {{4}} de la quincena {{5}}). Acumulado de la quincena: {{6}}. Pendientes por entregar: {{7}}.
```

- **Ejemplos para Meta:** {{1}} = Edwin · {{2}} = B-Logix · {{3}} = 2 · {{4}} = 3 · {{5}} = 16–31 de octubre 2026 · {{6}} = 7 · {{7}} = 1

### Recordatorio de documentos pendientes

- **Nombre:** `documentos_pendientes`
- **Categoría:** Utilidad · **Idioma:** Español
- **Cuerpo** (copiar tal cual):

```
Hola {{1}}, en {{2}} tenemos pendientes {{3}} documento(s) de tus viajes: {{4}}. Entrégalos en la oficina para que entren en la nómina.
```

- **Ejemplos para Meta:** {{1}} = Edwin · {{2}} = B-Logix · {{3}} = 2 · {{4}} = 01/10 Bocel ref 1579812; 03/10 Bocel ref 1711692

### Recibo rechazado

- **Nombre:** `recibo_rechazado`
- **Categoría:** Utilidad · **Idioma:** Español
- **Cuerpo** (copiar tal cual):

```
Hola {{1}}, tu recibo de {{2}} por {{3}} del {{4}} fue rechazado en la oficina. Motivo: {{5}}. Sube una foto nueva desde la app.
```

- **Ejemplos para Meta:** {{1}} = Edwin · {{2}} = combustible · {{3}} = RD$7,140 · {{4}} = 2026-10-12 · {{5}} = La foto no corresponde

### Pago de la quincena (chofer)

- **Nombre:** `pago_quincena`
- **Categoría:** Utilidad · **Idioma:** Español
- **Cuerpo** (copiar tal cual):

```
Hola {{1}}, tu pago de la quincena {{2}} en {{3}}: {{4}} viaje(s) recibido(s), neto {{5}} ({{6}}). Si tienes dudas, pide tu relación en la oficina.
```

- **Ejemplos para Meta:** {{1}} = Edwin · {{2}} = 1–15 de octubre 2026 · {{3}} = B-Logix · {{4}} = 9 · {{5}} = RD$18,500 · {{6}} = por transferir

### Relación de pago (ayudante)

- **Nombre:** `pago_ayudante`
- **Categoría:** Utilidad · **Idioma:** Español
- **Cuerpo** (copiar tal cual):

```
Hola {{1}}, tu relación de pago de la quincena {{2}} en {{3}}: {{4}} viaje(s), adelantos {{5}}, neto {{6}} ({{7}}).
```

- **Ejemplos para Meta:** {{1}} = Pedro · {{2}} = 1–15 de octubre 2026 · {{3}} = B-Logix · {{4}} = 6 · {{5}} = RD$500 · {{6}} = RD$4,000 · {{7}} = por pagar

## Técnico

- Servidor: `netlify/functions/whatsapp.mjs` (`GET /api/whatsapp/status`, `POST /api/whatsapp/send`; solo admin y oficina; 300 envíos por día por usuario).
- Textos: `src/utils/whatsappTemplates.js` (el mismo dato arma el texto para abrir WhatsApp y las variables de la plantilla). Si se cambia un texto aquí, hay que cambiar la plantilla en Meta.
- Otras variables: `WHATSAPP_API_VERSION` (por defecto `v22.0`), `WHATSAPP_TEMPLATE_PREFIX` (si las plantillas se crearon con un prefijo).
