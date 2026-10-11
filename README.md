# Karei — SaaS B2B GastroTech Multi-Tenant

> Plataforma SaaS B2B de nivel Enterprise para el sector gastronómico.
> POS en tiempo real, Menú Digital QR, Gestión de Mesas, Facturación Electrónica DIAN y Motor de Food Cost — todo en un solo ecosistema.

[![CI](https://github.com/karei/karei/actions/workflows/ci.yml/badge.svg)](https://github.com/karei/karei/actions/workflows/ci.yml)
[![CD](https://github.com/karei/karei/actions/workflows/cd.yml/badge.svg)](https://github.com/karei/karei/actions/workflows/cd.yml)
[![License: Proprietary](https://img.shields.io/badge/License-Proprietary-red.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org)

---

## Tabla de Contenidos

- [Visión General](#visión-general)
- [Características Principales](#características-principales)
- [Arquitectura](#arquitectura)
- [Stack Tecnológico](#stack-tecnológico)
- [Estructura del Proyecto](#estructura-del-proyecto)
- [Requisitos Previos](#requisitos-previos)
- [Instalación](#instalación)
- [Configuración](#configuración)
- [Ejecución](#ejecución)
- [Testing](#testing)
- [Multi-Tenancy](#multi-tenancy)
- [Integración DIAN](#integración-dian)
- [Motor de Food Cost](#motor-de-food-cost)
- [Observabilidad](#observabilidad)
- [CI/CD](#cicd)
- [Documentación](#documentación)
- [Contribución](#contribución)
- [Licencia](#licencia)

---

## Visión General

**Karei** es una plataforma SaaS B2B Multi-Tenant de nivel Enterprise diseñada para el sector gastronómico. Integra en un solo ecosistema:

- 🧾 **POS en tiempo real** — ventas, comandas y KDS (Kitchen Display System).
- 📱 **Menú Digital QR** — por mesa y por sucursal, sin apps nativas.
- 🍽️ **Gestión de Mesas con cuenta viva** — split, transferencias y propinas.
- 🇨🇴 **Facturación Electrónica DIAN** (Colombia) — con logo, NIT y CUFE.
- ✉️ **Validación de cuenta por email** — flujo seguro de verificación.
- 📊 **Motor de Food Cost** — recetas, mermas y escandallos.

### Principios Arquitectónicos

1. **Clean Architecture** (Uncle Bob) — las dependencias apuntan siempre hacia adentro.
2. **Domain-Driven Design** — Bounded Contexts por subdominio.
3. **Multi-Tenancy** con aislamiento por `tenant_id` (schema-per-tenant o row-level).
4. **Event-Driven** — comunicación asíncrona entre POS ↔ KDS ↔ Facturación ↔ Food Cost.
5. **CQRS ligero** — en módulos de alta lectura (menú, reportes).
6. **Hexagonal Ports & Adapters** — para integraciones externas (DIAN, Email, Pagos).

---

## Características Principales

| Módulo | Descripción |
|--------|-------------|
| **Identity** | Registro, login, verificación por email, RBAC, gestión de tenants. |
| **Catalog** | Productos, categorías, modificadores, alérgenos, menú público por QR. |
| **Tables** | Mesas, sesiones (cuenta viva), split de cuenta, transferencias, propinas. |
| **Orders** | POS, comandas, KDS vía WebSocket, pagos, métodos de pago. |
| **Billing** | Facturación electrónica DIAN, CUFE, XML UBL 2.1, PDF con logo. |
| **Food Cost** | Recetas, ingredientes, mermas, escandallos, cálculo de costos. |
| **Notifications** | Envío de emails transaccionales (Resend / AWS SES). |

---

## Arquitectura

### Capas (de adentro hacia afuera)
