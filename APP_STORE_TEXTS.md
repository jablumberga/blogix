# B-Logix — Textos Apple App Store

## Información básica
- **Bundle ID:** com.blogix.app
- **SKU:** blogix-app-001
- **Categoría principal:** Business (Negocios)
- **Categoría secundaria:** Productivity (Productividad)
- **Precio:** Gratis
- **Privacy Policy URL:** https://blogix.do/privacy
- **Support URL:** https://blogix.do
- **Marketing URL:** https://blogix.do

---

## Nombre de la app (30 chars máx)
```
B-Logix
```

## Subtítulo (30 chars máx)
```
Flota, nómina y logística
```

## Texto promocional (170 chars máx — se puede cambiar sin revisión)
```
Gestiona tu flota, conductores y liquidaciones desde tu móvil. Diseñado para empresas de logística en República Dominicana.
```

## Keywords (100 chars máx, separados por comas, sin espacios)
```
logística,flota,transporte,nómina,conductores,viajes,camiones,gastos,liquidaciones,socios
```

---

## Descripción completa (4000 chars máx)
```
B-Logix es la plataforma de gestión empresarial diseñada para empresas de logística y transporte en la República Dominicana. Administra tu flota, tus conductores, tus socios camioneros y tus finanzas desde un solo lugar.

TRES ROLES, UN SOLO SISTEMA

Administrador (Admin)
Visión completa del negocio. Gestiona viajes, asigna conductores, supervisa la flota, controla ingresos, gastos y liquidaciones. Toma decisiones informadas con datos en tiempo real.

Socios Camioneros
Acceso a su historial de viajes, liquidaciones y estados de cuenta. Transparencia total en cada operación realizada con su unidad.

Conductores
Consulta de viajes asignados, registros de trabajo y comprobantes de nómina. Todo lo que el conductor necesita, al alcance de su mano.

FUNCIONALIDADES PRINCIPALES

Gestión de Viajes
Registra, asigna y da seguimiento a cada viaje. Vincula conductores, unidades y socios en cada operación.

Nómina de Conductores
Calcula y gestiona el pago de conductores automáticamente según los viajes realizados. Genera comprobantes y mantén el historial completo.

Liquidaciones a Socios
Procesa y registra los pagos a los socios camioneros con base en los viajes completados. Detalle claro de cada liquidación.

Cuentas por Cobrar (CxC)
Controla los ingresos pendientes de tus clientes. Registra facturas, abonos y saldos para mantener tu flujo de caja al día.

Gestión de Flota
Administra todas las unidades: estado, asignación y disponibilidad. Mantén tu flota organizada y operativa.

Control de Gastos
Registra los gastos operativos relacionados a viajes, mantenimiento y otros rubros.

POR QUÉ B-LOGIX
- Diseñado para la realidad del mercado dominicano
- Interfaz moderna con tema oscuro, profesional y cómoda a la vista
- Multi-rol: cada usuario ve solo lo que le corresponde
- Toda la información centralizada en un solo sistema
- Reduce errores, ahorra tiempo y mejora la comunicación interna
```

---

## Novedades — Primera versión (release notes)
```
Primera versión oficial de B-Logix.

Plataforma de gestión logística para empresas de transporte en República Dominicana.

- Gestión completa de viajes y flota
- Nómina de conductores
- Liquidaciones a socios camioneros
- Control de cuentas por cobrar (CxC)
- Registro de gastos operativos
- Acceso diferenciado por rol: Admin, Socio y Conductor
```

---

## Clasificación de edad
- **Rating:** 4+ (sin contenido objetable)
- No contiene: violencia, lenguaje adulto, contenido sexual, sustancias, apuestas

---

## App Privacy (cuestionario en App Store Connect)

### Datos recopilados
| Tipo de dato | ¿Se recopila? | Vinculado al usuario | Tracking |
|---|---|---|---|
| Email | Sí | Sí | No |
| Credenciales (contraseña hasheada) | Sí | Sí | No |
| ID de usuario | Sí | Sí | No |
| Tokens push (APNS) | Sí | Sí | No |
| Fotos (adjuntas a gastos) | Sí (temporal) | No | No |

### Propósitos del uso de datos
- **Email + ID:** autenticación y funcionalidad de la app
- **Tokens push:** enviar notificaciones de viajes asignados
- **Fotos:** adjuntar imágenes de recibos (no se almacenan en nuestros servidores)

---

## Cifrado (Export Compliance)
- `ITSAppUsesNonExemptEncryption = false` ya está en `Info.plist`
- La app NO usa cifrado no exento → responder "No" en el cuestionario de App Store Connect
- No requiere ERN (Encryption Registration Number)

---

## Screenshots requeridos

### iPhone (obligatorio)
- **6.7" — iPhone 15 Pro Max / 16 Pro Max:** 1290×2796 px o 1320×2868 px
  - Mínimo 3 screenshots, máximo 10
  - Formato: PNG o JPEG
  - Sin transparencia, sin bordes de dispositivo (App Store los agrega)

### iPad (si se declara soporte a iPad)
- **12.9" iPad Pro:** 2048×2732 px
- Si no se suben screenshots de iPad, desmarcar "Supports iPad" en el target

### Pantallas a capturar (orden sugerido)
1. Dashboard admin — resumen general de la operación
2. Lista de viajes activos
3. Detalle de nómina del período
4. Pantalla de liquidaciones a socios
5. Gestión de flota / unidades

### Cómo capturar
- Safari DevTools → Responsive → iPhone 15 Pro Max (390×844 logical) → escala 3x → 1170×2532
- O directo desde simulador Xcode: Device → iPhone 15 Pro Max

---

## Build IPA para App Store

### Prerequisitos
```bash
# Instalar CocoaPods si no está
sudo gem install cocoapods

# Sincronizar assets web con iOS
npm run build:mobile
```

### Abrir en Xcode
```bash
open ios/App/App.xcworkspace
```

### Configuración en Xcode
- **Scheme:** App
- **Configuration:** Release
- **Destination:** Any iOS Device (arm64)
- **Bundle ID:** com.blogix.app
- **Version:** 1.0.0
- **Build:** 1

### Firmar
- Team: [Tu Apple Developer Team]
- Signing: Automatic → App Store Distribution
- Provisioning profile: se genera automáticamente con Xcode Managed Profile

### Archivar y subir
1. Product → Archive
2. Window → Organizer → seleccionar archivo
3. Distribute App → App Store Connect → Upload
4. Esperar procesamiento (~15 min) en App Store Connect

### Alternativa con xcodebuild
```bash
xcodebuild -workspace ios/App/App.xcworkspace \
  -scheme App \
  -configuration Release \
  -archivePath build/App.xcarchive \
  archive

xcodebuild -exportArchive \
  -archivePath build/App.xcarchive \
  -exportOptionsPlist ios/ExportOptions.plist \
  -exportPath build/ipa
```

---

## ExportOptions.plist (crear en ios/)
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>app-store</string>
    <key>teamID</key>
    <string>TU_TEAM_ID</string>
    <key>uploadBitcode</key>
    <false/>
    <key>uploadSymbols</key>
    <true/>
    <key>compileBitcode</key>
    <false/>
</dict>
</plist>
```

---

## Checklist App Store Connect

- [ ] Crear app en App Store Connect (appstoreconnect.apple.com)
- [ ] Bundle ID registrado en Identifiers (developer.apple.com)
- [ ] Certificado de distribución activo (Distribution Certificate)
- [ ] Provisioning profile App Store creado para com.blogix.app
- [ ] Subir build vía Xcode Organizer o Transporter
- [ ] Completar metadata: nombre, subtítulo, descripción, keywords
- [ ] Subir screenshots (iPhone 6.7" obligatorio)
- [ ] Configurar App Privacy en App Store Connect
- [ ] Responder cuestionario de cifrado (Export Compliance → No)
- [ ] Agregar Privacy Policy URL
- [ ] Configurar precios (Gratis)
- [ ] Activar push notifications en Capabilities (ya hecho)
- [ ] Subir APNS Production certificate o key a Supabase
- [ ] TestFlight: probar con al menos 1 dispositivo físico antes de submit
- [ ] Submit for Review

---

## Riesgo principal: Guideline 4.2 (funcionalidad limitada)
Apple puede rechazar una app que "parece un sitio web". Mitigaciones ya implementadas:
- Push notifications nativas (APNS)
- Cámara nativa (adjuntar fotos a gastos)
- Entitlements de producción configurados
- Si rechazan: agregar offline mode o un widget nativo

## APNS Key para Supabase
- Generar en developer.apple.com → Keys → AuthKey .p8
- Key ID + Team ID → configurar en Supabase Dashboard → Push Notifications
