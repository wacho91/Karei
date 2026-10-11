# Karei — Defense Schema (Threat Model & Security Architecture)

> **Clasificación:** Interno — Confidencial
> **Owner:** Threat Modeler / Security Lead
> **Estándar:** OWASP ASVS L2, OWASP Top 10 (2021), Zero Trust (NIST SP 800-207)
> **Alcance:** Plataforma SaaS B2B Multi-Tenant Karei (POS, KDS, Menú QR, Mesas, Facturación DIAN, Food Cost)
> **Última revisión:** 2025-Q1

---

## 0. Principios Rectores (Zero Trust)

1. **Never trust, always verify.** Ninguna request es confiable por origen de red (LAN del restaurante ≠ confiable).
2. **Least privilege.** Cada usuario, servicio y token tiene el mínimo privilegio necesario.
3. **Assume breach.** El diseño asume que un tenant, un dispositivo POS o una credencial pueden estar comprometidos.
4. **Defense in depth.** Controles redundantes en cada capa (edge → app → dominio → datos).
5. **Tenant isolation is a security boundary, not a feature.** El aislamiento multi-tenant es un control de seguridad de primer orden.
6. **Fail closed.** Ante duda, denegar. Nunca degradar a "permitir" por error.
7. **Auditability by default.** Toda acción sensible es trazable e inmutable.

---

## 1. Modelo de Amenazas (STRIDE por Bounded Context)

### 1.1 Activos Críticos

| Activo | Clasificación | Impacto si se compromete |
|---|---|---|
| Credenciales de usuario (hash) | Crítico | Account takeover, acceso cross-tenant |
| Refresh tokens | Crítico | Session hijacking persistente |
| Datos de facturación DIAN (CUFE, XML UBL) | Crítico | Fraude fiscal, sanciones legales |
| Datos de tarjetas / pagos | Crítico (PCI-DSS) | Fraude financiero |
| Datos de ventas por tenant | Alto | Fuga competitiva, violación de contrato |
| Recetas / Food Cost | Alto | Espionaje industrial |
| Menú público QR | Medio | Defacement, DoS |
| Logs de auditoría | Alto | Repudio, ocultamiento de fraude |

### 1.2 Matriz STRIDE

| Bounded Context | Spoofing | Tampering | Repudiation | Info Disclosure | DoS | Elevation |
|---|---|---|---|---|---|---|
| **Identity** | Login credential stuffing, JWT forgery | Alteración de roles en JWT | Negar registro/verificación | Enumeración de emails | Brute force login | Escalada a SUPER_ADMIN |
| **Catalog** | Suplantar tenant en query | Modificar precios vía IDOR | Negar cambio de precio | Fuga de menú privado | Scraping masivo | Editar productos de otro tenant |
| **Tables** | QR spoofing | Alterar cuenta viva | Negar split/transfer | Ver cuentas ajenas | Bloquear mesas | Cerrar sesión ajena |
| **Orders/POS** | Falsificar comanda | Modificar totales | Negar venta | Ver órdenes cross-tenant | Flood de órdenes | Marcar como pagado sin pago |
| **Billing/DIAN** | Suplantar NIT | Alterar CUFE/XML | Negar emisión | Fuga de datos fiscales | Bloquear emisión | Emitir a nombre de otro |
| **Food Cost** | — | Alterar costos | Negar merma | Fuga de recetas | — | Modificar recetas ajenas |
| **Notifications** | Email spoofing | Alterar plantillas | Negar envío | Fuga de tokens en email | Email bombing | — |

### 1.3 Superficies de Ataque

- **API pública REST** (`/api/v1/*`) — principal.
- **WebSocket KDS** (`/ws/kds`) — canal en tiempo real.
- **Menú QR público** (`/m/[qrCode]`) — sin autenticación.
- **Webhooks DIAN** — entrada desde proveedor externo.
- **Panel admin** — superficie de alto privilegio.
- **Integraciones** (Resend, SES, S3, DIAN) — credenciales de servicio.

---

## 2. Controles por Capa (Defense in Depth)
