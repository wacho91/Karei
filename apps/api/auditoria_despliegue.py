#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
═══════════════════════════════════════════════════════════════════════════
 Kārei · E-14t65 · AUDITORÍA PRE-DESPLIEGUE (solo lectura · stdlib puro)
═══════════════════════════════════════════════════════════════════════════
 QUÉ HACE: revisa los 7 frentes para saber si Kārei está listo para montar
 a producción (Railway + Vercel). NO ESCRIBE NADA, NO TOCA LA BASE, NO
 IMPRIME SECRETOS (las claves solo se evalúan, nunca se muestran).

   [A] Mapa del backend       → plugins presentes + versión viva en disco
   [B] API viva               → módulos montados + sellos de versión
   [C] Base de datos          → tablas, dueños de pagos, huérfanos, demo
   [D] Config de despliegue   → SECRET_KEY, DEBUG, CORS, SMTP, semilla
   [E] Zona horaria           → «hoy» del cuadre vs servidor UTC (Railway)
   [F] Frontend               → VITE_API_URL, localhost pegado, build
   [G] Infra de despliegue    → requirements, start command, .gitignore
   [H] VEREDICTO              → ROJO / AMARILLO / VERDE + pendientes

 CÓMO CORRERLO (con uvicorn del backend arriba):
     cd apps\\api
     python auditoria_despliegue.py
 (opcional: python auditoria_despliegue.py RUTA_DEL_MONOREPO)

 Luego pega la salida COMPLETA en el chat (socio Z la convierte en plan).
═══════════════════════════════════════════════════════════════════════════
"""
import json
import os
import re
import sqlite3
import sys
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

SELO = "E-14t65"
API_URL = os.environ.get("KAREI_API_URL", "http://localhost:8000").rstrip("/")
SKIP = {".venv", "venv", "node_modules", "__pycache__", ".git", "dist",
        "build", ".idea", ".vscode", ".pytest_cache", ".mypy_cache"}

# Plugins que DEBEN existir en disco (cada uno = un módulo del producto)
PLUGINS = ["pos_cuenta_live.py", "pos_facturacion.py", "pos_mesas.py",
           "pos_compat.py", "saas_registro.py"]
# Versión mínima viva esperada (cura vigente entregada en el chat)
ESPERADOS = {"pos_cuenta_live.py": "E-14w-d", "pos_facturacion.py": "E-14w-f"}

BLOQUEADORES: list = []
AVISOS: list = []


def bloquear(m):
    BLOQUEADORES.append(m)


def avisar(m):
    AVISOS.append(m)


def linea(c="-", n=72):
    print(c * n)


def titulo(txt):
    print("")
    linea("=")
    print(txt)
    linea("=")


def leer_texto(p: Path, max_bytes=300000):
    try:
        return p.read_bytes()[:max_bytes].decode("utf-8", "ignore")
    except Exception:
        return ""


def parece_fastapi(p: Path) -> bool:
    """Un main.py solo cuenta como backend si de verdad monta FastAPI."""
    try:
        return "FastAPI" in p.read_bytes()[:3000].decode("utf-8", "ignore")
    except Exception:
        return False


def hallar_base(argv) -> Path:
    """Sube por lo sumo 6 niveles buscando una firma REAL del proyecto Kārei
    (main.py que monte FastAPI, apps/api con el suyo, o karei.db). Un
    directorio 'app' o 'apps' suelto NO cuenta — evita colgarse de carpetas
    ajenas o de la raíz del sistema."""
    cand = Path(argv[1]).resolve() if len(argv) > 1 else Path.cwd().resolve()
    p = cand
    for _ in range(6):
        m1, m2 = p / "app" / "main.py", p / "main.py"
        fuerte = (m1.is_file() and parece_fastapi(m1)) or (
            m2.is_file() and parece_fastapi(m2))
        if not fuerte and (p / "karei.db").is_file():
            fuerte = True
        if not fuerte:
            for n in ("apps/api", "api", "backend", "apps/backend"):
                d = p / n
                f1, f2 = d / "app" / "main.py", d / "main.py"
                if (f1.is_file() and parece_fastapi(f1)) or (
                    f2.is_file() and parece_fastapi(f2)):
                    fuerte = True
                    break
        if fuerte:
            return p
        if p.parent == p:
            break
        p = p.parent
    return cand


def hallar_api(base: Path):
    for n in ("apps/api", "api", "backend", "apps/backend"):
        d = base / n
        f1, f2 = d / "app" / "main.py", d / "main.py"
        if (f1.is_file() and parece_fastapi(f1)) or (
            f2.is_file() and parece_fastapi(f2)):
            return d
    m1, m2 = base / "app" / "main.py", base / "main.py"
    if (m1.is_file() and parece_fastapi(m1)) or (
        m2.is_file() and parece_fastapi(m2)):
        return base
    for carpeta, dirs, files in os.walk(base):
        dirs[:] = [d for d in dirs if d not in SKIP]
        if "main.py" in files:
            txt = leer_texto(Path(carpeta) / "main.py", 4000)
            if "FastAPI" in txt:
                return Path(carpeta)
    return None


def hallar_web(base: Path):
    for n in ("apps/web", "apps/frontend", "web", "frontend", "apps/webapp"):
        d = base / n
        if (d / "package.json").is_file():
            return d
    halladas = []
    for carpeta, dirs, files in os.walk(base):
        dirs[:] = [d for d in dirs if d not in SKIP]
        if "package.json" in files and any(
            v.startswith("vite.config.") for v in files
        ):
            halladas.append(Path(carpeta))
    return halladas[0] if halladas else None


# ══════════════════════════════ [A] BACKEND ══════════════════════════════
def seccion_a(base, api):
    titulo("[A] MAPA DEL BACKEND — plugins y versión viva en disco")
    if api is None:
        print("[✗] No encontré la carpeta del backend (app/main.py).")
        print("    Pásame la ruta: python auditoria_despliegue.py RUTA_MONOREPO")
        bloquear("No se encontró el backend en disco")
        return
    print(f"Carpeta backend: {api}")

    # Todos los main.py del monorepo (por si hay más de un proyecto)
    mains = []
    for carpeta, dirs, files in os.walk(base):
        dirs[:] = [d for d in dirs if d not in SKIP]
        if "main.py" in files:
            mains.append(Path(carpeta) / "main.py")
    if len(mains) > 1:
        print(f"[!] Hay {len(mains)} main.py en el repo (revisa cuál es el vivo):")
        for m in mains[:8]:
            print(f"      · {m}")

    for nombre in PLUGINS:
        ruta = api / nombre
        if not ruta.is_file():
            print(f"[✗] FALTA {nombre} → ese módulo moriría al reiniciar uvicorn")
            bloquear(f"Falta el plugin {nombre} en {api}")
            continue
        txt = leer_texto(ruta, 8000)
        etiquetas = sorted(set(re.findall(r"E-14[a-zA-Z0-9\-]*", txt)))
        kb = ruta.stat().st_size // 1024
        esperado = ESPERADOS.get(nombre)
        if esperado and esperado not in etiquetas:
            print(f"[✗] {nombre} ({kb} KB) SIN el sello {esperado} "
                  f"(encontré: {', '.join(etiquetas[:6]) or 'ninguno'})")
            bloquear(f"{nombre} no es versión {esperado} (¿copia vieja?)")
        else:
            ok = "✓ versión " + esperado if esperado else "✓ " + (
                etiquetas[-1] if etiquetas else "presente")
            print(f"[✓] {nombre} ({kb} KB) · {ok}")

    # Copias duplicadas (la trampa E-14t60: el uvicorn carga OTRA copia)
    titulo("[A2] Copias duplicadas de plugins (trampa clásica)")
    dups = 0
    for nombre in PLUGINS:
        sitios = []
        for carpeta, dirs, files in os.walk(base):
            dirs[:] = [d for d in dirs if d not in SKIP]
            if nombre in files:
                sitios.append(Path(carpeta) / nombre)
        if len(sitios) > 1:
            dups += 1
            print(f"[!] {nombre} existe en {len(sitios)} sitios:")
            for s in sitios[:6]:
                m = datetime.fromtimestamp(s.stat().st_mtime)
                print(f"      · {s}  (modificado {m:%Y-%m-%d %H:%M})")
    if dups == 0:
        print("[✓] Cada plugin vive en un solo sitio — no hay copias trampa.")


# ══════════════════════════════ [B] API VIVA ═════════════════════════════
def _get(url, timeout=5):
    req = urllib.request.Request(url, headers={"User-Agent": f"karei-{SELO}"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read(60000)
    except urllib.error.HTTPError as e:
        try:
            return e.code, e.read(4000)
        except Exception:
            return e.code, b""
    except Exception:
        return None, b""


def _sellos(objeto, hallados=None):
    if hallados is None:
        hallados = set()
    if isinstance(objeto, dict):
        for k, v in objeto.items():
            if k == "version" and isinstance(v, str) and v.startswith("E-14"):
                hallados.add(v)
            else:
                _sellos(v, hallados)
    elif isinstance(objeto, list):
        for it in objeto[:50]:
            _sellos(it, hallados)
    return hallados


def seccion_b():
    titulo(f"[B] API VIVA — {API_URL}")
    st, cuerpo = _get(f"{API_URL}/openapi.json")
    if st is None:
        print("[✗] El backend NO responde. Levanta uvicorn y vuelve a correr.")
        bloquear("Backend no responde en " + API_URL)
        return {}
    if st != 200:
        print(f"[✗] openapi.json respondió {st} (¿URL correcta?)")
        bloquear(f"openapi.json respondió {st}")
        return {}
    try:
        spec = json.loads(cuerpo.decode("utf-8", "ignore"))
    except Exception:
        print("[✗] openapi.json no es JSON válido")
        bloquear("openapi.json inválido")
        return {}

    paths = spec.get("paths", {})
    grupos = {}
    for pth, metodos in paths.items():
        limpio = pth
        for pre in ("/api/v1/", "/api/"):
            if limpio.startswith(pre):
                limpio = limpio[len(pre):]
                break
        mod = limpio.strip("/").split("/")[0] or "raíz"
        g = grupos.setdefault(mod, {"rutas": 0, "gets": 0})
        g["rutas"] += 1
        g["gets"] += sum(1 for m in metodos if m.upper() == "GET")
    print(f"[✓] {len(paths)} rutas montadas en {len(grupos)} módulos:")
    for mod in sorted(grupos):
        g = grupos[mod]
        print(f"      · {mod:<14} {g['rutas']:>3} rutas ({g['gets']} GET)")
    if len(grupos) < 4:
        avisar("Menos de 4 módulos montados — ¿faltan routers?")

    titulo("[B2] Sondeos de salud y sellos de versión (sin login)")
    pruebas = [
        ("Salud del servidor", "/health", "200"),
        ("Facturación (sello)", "/api/v1/pos/facturacion/pagos?dias=7", "E-14w-f"),
        ("Reportes (sello)", "/api/v1/pos/reportes/pagos", "E-14w"),
        ("Mapa de mesas", "/api/v1/pos/mapa", "401/403"),
        ("Identidad (auth)", "/api/v1/auth/me", "401/403"),
    ]
    vivos = 0
    for nombre, ruta, esperado in pruebas:
        st, cuerpo = _get(API_URL + ruta)
        if st is None:
            print(f"[✗] {nombre:<22} sin respuesta → {ruta}")
            bloquear(f"Ruta {ruta} sin respuesta")
            continue
        if st in (401, 403):
            print(f"[✓] {nombre:<22} existe y pide login ({st}) → {ruta}")
            vivos += 1
            continue
        if st == 200:
            try:
                datos = json.loads(cuerpo.decode("utf-8", "ignore"))
                sellos = sorted(_sellos(datos))
            except Exception:
                sellos = []
            extra = f" · versión {sellos[-1]}" if sellos else ""
            if esperado.startswith("E-14") and sellos:
                if any(s.startswith(esperado) for s in sellos):
                    print(f"[✓] {nombre:<22} 200{extra} (esperaba {esperado}) ✓")
                else:
                    print(f"[!] {nombre:<22} 200{extra} pero esperaba {esperado}"
                          f" → ¿archivo viejo en disco?")
                    bloquear(f"Sello de {nombre} = {sellos[-1]} ≠ {esperado}")
            else:
                print(f"[✓] {nombre:<22} 200{extra} → {ruta}")
            vivos += 1
            continue
        print(f"[✗] {nombre:<22} HTTP {st} → {ruta}")
        bloquear(f"Ruta {ruta} respondió {st}")

    # 5xx en rutas GET seguras (sin {params})
    titulo("[B3] Barrido de errores 5xx en GET simples")
    malas = []
    vistas = 0
    for pth, metodos in sorted(paths.items()):
        if "{" in pth or "GET" not in [m.upper() for m in metodos]:
            continue
        if vistas >= 14:
            break
        vistas += 1
        st, _ = _get(API_URL + pth, timeout=4)
        if st is not None and st >= 500:
            malas.append((pth, st))
    if malas:
        for pth, st in malas:
            print(f"[✗] {st} en GET {pth}")
            bloquear(f"GET {pth} responde {st} (error del servidor)")
    else:
        print("[✓] Ninguna ruta GET simple devolvió 500 — backend sano.")
    return paths


# ══════════════════════════════ [C] BASE DE DATOS ════════════════════════
def hallar_db(base, api):
    for raiz in (api, base):
        if raiz is None:
            continue
        for carpeta, dirs, files in os.walk(raiz):
            dirs[:] = [d for d in dirs if d not in SKIP]
            if "karei.db" in files:
                return Path(carpeta) / "karei.db"
    for raiz in (api, base):
        if raiz is None:
            continue
        for nombre in (".env", "app/core/config.py"):
            f = raiz / nombre
            if f.is_file():
                m = re.search(r"sqlite[^\"'\s]*?///\.?/?([\w./\\-]+karei\.db)",
                              leer_texto(f))
                if m:
                    p = Path(m.group(1))
                    if not p.is_absolute():
                        p = raiz / p
                    if p.is_file():
                        return p
    return None


def abrir_ro(ruta: Path):
    try:
        return sqlite3.connect(f"file:{ruta.as_uri()}?mode=ro", uri=True)
    except Exception:
        pass
    try:
        return sqlite3.connect(f"file:{ruta.as_posix()}?mode=ro", uri=True)
    except Exception:
        return sqlite3.connect(str(ruta))


def seccion_c(base, api):
    titulo("[C] BASE DE DATOS — integridad y dueños del dinero")
    ruta = hallar_db(base, api)
    if ruta is None:
        print("[!] No encontré karei.db (¿ya usas Postgres? entonces en local "
              "no aplica)")
        avisar("karei.db no encontrada — si ya migraste a Postgres, ignora [C]")
        return
    print(f"Base: {ruta} · {ruta.stat().st_size // 1024} KB")
    con = abrir_ro(ruta)
    tablas = [r[0] for r in con.execute(
        "SELECT name FROM sqlite_master WHERE type='table' "
        "AND name NOT LIKE 'sqlite_%' ORDER BY name")]
    print(f"[✓] {len(tablas)} tablas: {', '.join(tablas)}")

    # Nombres de tenants (para traducir los dueños)
    nombres = {}
    if "tenants" in tablas:
        try:
            cols = [r[1] for r in con.execute('PRAGMA table_info("tenants")')]
            cn = next((c for c in cols if c in ("nombre", "name")), cols[1] if len(cols) > 1 else None)
            if cn:
                for i, n in con.execute(f'SELECT id, "{cn}" FROM tenants'):
                    nombres[str(i)] = str(n)
        except Exception:
            pass

    def dueño(tid):
        return nombres.get(str(tid), str(tid))

    claves = [t for t in tablas if re.search(
        r"payment|order|factur|invoice|user|tenant|branch", t)]
    for t in claves:
        try:
            n = con.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
            cols = [r[1] for r in con.execute(f'PRAGMA table_info("{t}")')]
            extra = ""
            tcol = next((c for c in cols if "tenant" in c), None)
            if tcol and n:
                filas = con.execute(
                    f'SELECT "{tcol}", COUNT(*) FROM "{t}" GROUP BY 1 '
                    f'ORDER BY 2 DESC LIMIT 5').fetchall()
                extra = " · dueños: " + ", ".join(
                    f"{dueño(v)}={c}" for v, c in filas)
            dcol = next((c for c in cols if "created" in c or "fecha" in c), None)
            if dcol and n:
                rango = con.execute(
                    f'SELECT MIN("{dcol}"), MAX("{dcol}") FROM "{t}"'
                ).fetchone()
                extra += f" · fechas {str(rango[0])[:10]} → {str(rango[1])[:10]}"
            print(f"      · {t:<18} {n:>4} fila(s){extra}")
        except Exception as e:
            print(f"      · {t:<18} (no pude leerla: {e})")

    # Pagos huérfanos (pago cuya orden ya no existe)
    titulo("[C2] Huérfanos y sanidad del dinero")
    tpago = next((t for t in tablas if "payment" in t), None)
    torden = next((t for t in tablas if "order" in t and "item" not in t), None)
    if tpago and torden:
        cols = [r[1] for r in con.execute(f'PRAGMA table_info("{tpago}")')]
        ocol = next((c for c in cols if "order" in c), None)
        if ocol:
            try:
                h = con.execute(
                    f'SELECT COUNT(*) FROM "{tpago}" p LEFT JOIN "{torden}" o '
                    f'ON p."{ocol}" = o.id WHERE o.id IS NULL').fetchone()[0]
                if h:
                    print(f"[!] {h} pago(s) sin orden existente (huérfanos)")
                    avisar(f"{h} pagos huérfanos en {tpago}")
                else:
                    print("[✓] 0 pagos huérfanos — cada pago tiene su orden.")
            except Exception:
                pass
    if tpago:
        cols = [r[1] for r in con.execute(f'PRAGMA table_info("{tpago}")')]
        mcol = next((c for c in cols if "method" in c or "metodo" in c), None)
        if mcol:
            filas = con.execute(
                f'SELECT "{mcol}", COUNT(*), SUM(total) FROM "{tpago}" '
                f'GROUP BY 1 ORDER BY 2 DESC').fetchall()
            print("      Recaudo histórico por método: " + ", ".join(
                f"{m}={c} pagos/${(s or 0):,.0f}".replace(",", ".")
                for m, c, s in filas))
    tuser = next((t for t in tablas if "user" in t), None)
    if tuser:
        try:
            cols = [r[1] for r in con.execute(f'PRAGMA table_info("{tuser}")')]
            ecol = next((c for c in cols if "email" in c), None)
            if ecol:
                demo = con.execute(
                    f'SELECT COUNT(*) FROM "{tuser}" WHERE "{ecol}" '
                    f"LIKE '%karei.app%'").fetchone()[0]
                total = con.execute(f'SELECT COUNT(*) FROM "{tuser}"').fetchone()[0]
                if demo:
                    print(f"[!] {demo} usuario(s) demo de {total} "
                          f"(admin@karei.app — KAREI_SEED_DEMO)")
                    avisar(f"Hay {demo} usuarios demo; en producción "
                           "KAREI_SEED_DEMO=0")
                else:
                    print(f"[✓] Sin usuarios demo ({total} usuarios reales)")
        except Exception:
            pass
    con.close()


# ══════════════════════════════ [D] CONFIG ═══════════════════════════════
DEBILES = ("changeme", "cambia", "secret", "123456", "tu-secreto", "dev",
           "demo", "supersecret", "abc123")


def seccion_d(base, api):
    titulo("[D] CONFIG DE DESPLIEGUE — secretos y banderas (sin mostrarlos)")
    envs = []
    for raiz in (api, base, base / "apps" if base else None):
        if raiz:
            f = raiz / ".env"
            if f.is_file():
                envs.append(f)
    cfg_txt = ""
    if api:
        f = api / "app/core/config.py"
        if f.is_file():
            cfg_txt = leer_texto(f)
    if not envs and not cfg_txt:
        print("[!] Ni .env ni config.py encontrados — ¿dónde viven los ajustes?")
        avisar("No encontré .env ni app/core/config.py")
        return
    for f in envs:
        print(f"      · leyendo {f}")

    vals = {}
    for f in envs:
        for ln in leer_texto(f).splitlines():
            ln = ln.strip()
            if ln and not ln.startswith("#") and "=" in ln:
                k, _, v = ln.partition("=")
                vals[k.strip()] = v.strip().strip('"').strip("'")

    sk = vals.get("SECRET_KEY", "")
    if not sk and re.search(r"secret_key\s*:\s*str\s*=\s*[\"']([^\"']+)[\"']",
                            cfg_txt, re.I):
        sk = re.search(r"secret_key\s*:\s*str\s*=\s*[\"']([^\"']+)[\"']",
                       cfg_txt, re.I).group(1)
        print("      (SECRET_KEY viene del default de config.py)")
    if len(sk) >= 32 and not any(d in sk.lower() for d in DEBILES):
        print("[✓] SECRET_KEY presente y robusta (no se muestra)")
    elif sk:
        print("[✗] SECRET_KEY débil o por defecto — en producción cualquiera "
              "firma tokens")
        bloquear("SECRET_KEY débil/por defecto → genera una con "
                 "secrets.token_urlsafe(48)")
    else:
        print("[✗] No encontré SECRET_KEY definida")
        bloquear("Falta SECRET_KEY")

    dbg = vals.get("DEBUG", "")
    if not dbg:
        m = re.search(r"debug\s*:\s*bool\s*=\s*(\w+)", cfg_txt, re.I)
        dbg = m.group(1) if m else ""
    if dbg.lower() in ("1", "true", "si", "yes"):
        print("[!] DEBUG=True → en producción va 0 (expone trazas y recarga)")
        avisar("DEBUG=True: pon DEBUG=0 en producción")
    else:
        print("[✓] DEBUG apagado")

    cors = vals.get("CORS_ORIGINS", "")
    if cors:
        if "*" in cors:
            print("[✗] CORS_ORIGINS='*' — cualquiera llama a tu API con cookies")
            bloquear("CORS abierto con '*'")
        elif "vercel.app" in cors or "http" in cors:
            print(f"[✓] CORS_ORIGINS definida ({cors.count(',')+1} origen(es))")
        else:
            print(f"[!] CORS_ORIGINS solo local: {cors} → agrega el dominio "
                  "de Vercel al desplegar")
            avisar("CORS sin dominio de producción (agrega tu .vercel.app)")
    else:
        m = re.search(r"allow_origins\s*=\s*\[([^\]]*)\]", leer_texto(
            (api / "main.py")) if api else "")
        if m and "frontend_url" in m.group(1):
            print("[!] CORS vive en settings.frontend_url → al desplegar debe "
                  "apuntar al dominio real de Vercel")
            avisar("CORS depende de frontend_url — configúralo al desplegar")
        else:
            print("[!] No vi CORS_ORIGINS en .env — revisa main.py al desplegar")
            avisar("CORS no explícito — revisar al desplegar")

    seed = vals.get("KAREI_SEED_DEMO", "")
    if seed in ("1", "true"):
        print("[!] KAREI_SEED_DEMO=1 → siembra admin@karei.app/admin123. "
              "Para el restaurante real: 0")
        avisar("KAREI_SEED_DEMO=1 en producción siembra el demo")
    elif seed:
        print("[✓] KAREI_SEED_DEMO=0 (producción limpia)")
    else:
        print("      · KAREI_SEED_DEMO sin definir (config.py decide)")

    smtp = [k for k in vals if k.startswith("KAREI_SMTP_") and vals.get(k)]
    if "KAREI_SMTP_HOST" in vals and vals.get("KAREI_SMTP_HOST"):
        print(f"[✓] SMTP configurado ({len(smtp)}/6 variables con valor)")
    else:
        print("[!] KAREI_SMTP_HOST vacío → los correos de verificación no "
              "saldrán al desplegar")
        avisar("SMTP sin configurar (correos de verificación no salen)")

    if "KAREI_CORREO_MASTER" in vals and vals.get("KAREI_CORREO_MASTER"):
        print("[✓] KAREI_CORREO_MASTER definida (endpoints /saas/correo "
              "protegidos)")
    else:
        print("[!] KAREI_CORREO_MASTER vacía → cualquier admin podría cambiar "
              "el buzón global")
        avisar("KAREI_CORREO_MASTER sin definir")

    dbu = vals.get("DATABASE_URL", "")
    if dbu.startswith("postgresql"):
        print("[✓] DATABASE_URL apunta a Postgres (listo para Railway)")
    elif dbu.startswith("sqlite"):
        print("      · DATABASE_URL = SQLite local (OK para hoy; Railway usa "
              "Postgres)")
    else:
        print("      · DATABASE_URL local vacía → SQLite de desarrollo")


# ══════════════════════════════ [E] ZONA HORARIA ═════════════════════════
def seccion_e(api):
    titulo("[E] ZONA HORARIA — el «hoy» del cuadre vs servidor UTC")
    if api is None:
        print("[!] Sin backend en disco, no puedo escanear")
        return
    pat = re.compile(r"(datetime\.utcnow\(\)|date\.today\(\)"
                     r"|datetime\.now\(\)|time\.localtime)"
                     r"(.{0,60})")
    hallas = {}
    for carpeta, dirs, files in os.walk(api):
        dirs[:] = [d for d in dirs if d not in SKIP]
        for f in files:
            if not f.endswith(".py"):
                continue
            p = Path(carpeta) / f
            txt = leer_texto(p, 400000)
            for m in pat.finditer(txt):
                ln = txt.count("\n", 0, m.start()) + 1
                hallas.setdefault(p.name, []).append((ln, m.group(1)))
    if not hallas:
        print("[✓] No vi fechas locales ingenuas — bien.")
        return
    total = sum(len(v) for v in hallas.values())
    print(f"[!] {total} uso(s) de hora local sin zona explícita:")
    for archivo, lns in list(hallas.items())[:8]:
        for ln, que in lns[:3]:
            print(f"      · {archivo}:{ln} → {que}")
    print("  RIESGO: Railway vive en UTC. El «hoy» del Informe Z cambiaría de")
    print("  día a las 19:00 de Bogotá: las ventas de la noche caerían al día")
    print("  siguiente. CURA:ZoneInfo('America/Bogota') en los filtros de día.")
    avisar("Fechas con hora local ingenua: al desplegar en UTC el «hoy» corre "
           "5 horas (usar America/Bogota)")


# ══════════════════════════════ [F] FRONTEND ═════════════════════════════
def seccion_f(base, api):
    titulo("[F] FRONTEND — build, API URL y localhost pegado")
    web = None
    for raiz in (base, api.parent if api else None):
        if raiz is None:
            continue
        w = hallar_web(raiz)
        if w:
            web = w
            break
    if web is None:
        print("[!] No encontré el frontend (carpeta con package.json + "
              "vite.config)")
        avisar("Frontend no encontrado — verificación manual")
        return
    print(f"Carpeta frontend: {web}")

    pkg = {}
    try:
        pkg = json.loads(leer_texto(web / "package.json"))
    except Exception:
        pass
    build = (pkg.get("scripts") or {}).get("build", "")
    if build:
        print(f"[✓] build definido: «{build}»")
    else:
        print("[✗] package.json sin script build")
        bloquear("Frontend sin script build")

    if (web / "vercel.json").is_file():
        print("[✓] vercel.json presente (rewrites SPA)")
    else:
        print("[!] Sin vercel.json → en Vercel las rutas /ventas etc. darían "
              "404 al recargar")
        avisar("Falta vercel.json con rewrites SPA")

    for nombre in (".env", ".env.production", ".env.local"):
        f = web / nombre
        if not f.is_file():
            continue
        vals = {}
        for ln in leer_texto(f).splitlines():
            ln = ln.strip()
            if ln and not ln.startswith("#") and "=" in ln:
                k, _, v = ln.partition("=")
                vals[k.strip()] = v.strip()
        apiu = vals.get("VITE_API_URL", "")
        if not apiu:
            print(f"[!] {nombre}: VITE_API_URL vacía → la web no sabrá dónde "
                  "está el backend")
            avisar(f"VITE_API_URL vacía en {nombre}")
        elif re.search(r"localhost|127\.0\.0\.1", apiu):
            print(f"[✗] {nombre}: VITE_API_URL={apiu} → apunta a TU máquina; "
                  "en producción debe ser la URL pública del backend")
            bloquear(f"VITE_API_URL con localhost en {nombre}")
        else:
            print(f"[✓] {nombre}: VITE_API_URL={apiu}")

    # localhost pegado en el código
    pegados = []
    for carpeta, dirs, files in os.walk(web):
        dirs[:] = [d for d in dirs if d not in SKIP]
        for f in files:
            if not f.endswith((".ts", ".tsx", ".js", ".jsx")):
                continue
            p = Path(carpeta) / f
            txt = leer_texto(p, 200000)
            for m in re.finditer(r"https?://(localhost|127\.0\.0\.1):?8?0?0?0?",
                                 txt):
                ln = txt.count("\n", 0, m.start()) + 1
                pegados.append(f"{p.name}:{ln}")
    if pegados:
        print(f"[!] {len(pegados)} referencia(s) a localhost en el código "
              f"(ej: {', '.join(pegados[:4])})")
        print("    Si usan VITE_API_URL no molestan; si son URLs duras, "
              "sí rompen en producción.")
        avisar(f"{len(pegados)} localhost hardcodeados en el frontend "
               "(revisar si son URLs duras)")
    else:
        print("[✓] Cero localhost pegado en el código de la web")


# ══════════════════════════════ [G] INFRA ════════════════════════════════
def seccion_g(base, api):
    titulo("[G] INFRA DE DESPLIEGUE — dependencias y arranque")
    req = None
    for raiz in (api, base):
        if raiz and (raiz / "requirements.txt").is_file():
            req = raiz / "requirements.txt"
            break
    if req:
        txt = leer_texto(req).lower()
        print(f"requirements.txt: {req}")
        for dep, oblig in (("fastapi", True), ("uvicorn", True),
                           ("sqlalchemy", True), ("aiosqlite", True),
                           ("pydantic-settings", False), ("asyncpg", False),
                           ("passlib", False), ("pyjwt", False),
                           ("python-jose", False)):
            presente = dep in txt or dep.replace("-", "_") in txt
            icono = "✓" if presente else ("✗" if oblig else "·")
            nota = "" if presente else (
                " ← OBLIGATORIO" if oblig else
                (" ← para Railway+Postgres" if dep == "asyncpg" else ""))
            print(f"      [{icono}] {dep}{nota}")
            if oblig and not presente:
                bloquear(f"Falta {dep} en requirements.txt")
        if "asyncpg" not in txt:
            avisar("asyncpg no está en requirements.txt (necesario si "
                   "DATABASE_URL es Postgres en Railway)")
    else:
        print("[✗] Sin requirements.txt — Railway no sabrá qué instalar")
        bloquear("Falta requirements.txt")

    arranques = ["Procfile", "railway.json", "railway.toml", "nixpacks.toml",
                 "Dockerfile", "render.yaml", "fly.toml"]
    vistos = []
    for carpeta, dirs, files in os.walk(base):
        dirs[:] = [d for d in dirs if d not in SKIP]
        for a in arranques:
            if a in files:
                vistos.append(Path(carpeta) / a)
    if vistos:
        print("[✓] Config de arranque: " + ", ".join(str(v.name) for v in vistos))
    else:
        print("[!] Ningún Procfile/Dockerfile/railway.json → define el start "
              "command en Railway:")
        print("      uvicorn app.main:app --host 0.0.0.0 --port $PORT")
        avisar("Sin Procfile/Dockerfile: definir start command en Railway")

    gi = None
    for raiz in (base, api):
        if raiz and (raiz / ".gitignore").is_file():
            gi = raiz / ".gitignore"
            break
    db = hallar_db(base, api)
    if gi and db:
        txt = leer_texto(gi)
        if "karei.db" in txt:
            print("[✓] .gitignore excluye karei.db (la base no viaja a GitHub)")
        else:
            print("[!] .gitignore NO excluye karei.db → no subas la base con "
                  "ventas reales a GitHub")
            avisar("karei.db no está en .gitignore")


# ══════════════════════════════ [H] VEREDICTO ════════════════════════════
def seccion_h():
    titulo("[H] VEREDICTO PRE-DESPLIEGUE")
    if BLOQUEADORES:
        print(f"ESTADO: ROJO — {len(BLOQUEADORES)} bloqueador(es). "
              "No montes todavía:")
        for i, b in enumerate(BLOQUEADORES, 1):
            print(f"   {i}. {b}")
    elif not AVISOS:
        print("ESTADO: VERDE — los 7 frentes pasaron. Listo para montar 🚀")
    else:
        print("ESTADO: AMARILLO — 0 bloqueadores. Desplegable, con deberes:")
    if AVISOS:
        print(f"\n  Avisos por pulir ({len(AVISOS)}):")
        for i, a in enumerate(AVISOS, 1):
            print(f"   {i}. {a}")
    if BLOQUEADORES:
        print("\nResuelve los bloqueadores, vuelve a correr esta auditoría y "
              "cuando quede VERDE o AMARILLO se despliega.")
    elif AVISOS:
        print("\nEstos avisos se pueden ir resolviendo en la primera semana "
              "de producción.")
    print("")
    linea("=")
    print(f"Kārei {SELO} · auditoría SOLO LECTURA · nada fue modificado")
    print("Pega esta salida COMPLETA en el chat para el plan de despliegue.")
    linea("=")


def main():
    argv = sys.argv
    base = hallar_base(argv)
    api = hallar_api(base)
    print("")
    linea("═")
    print(f"  KĀREI · AUDITORÍA PRE-DESPLIEGUE · {SELO}")
    print(f"  Generada: {datetime.now():%Y-%m-%d %H:%M:%S} (hora local)")
    print(f"  Proyecto: {base}")
    linea("═")
    print("Modo: SOLO LECTURA · no escribe en la base ni en el código")
    seccion_a(base, api)
    seccion_b()
    seccion_c(base, api)
    seccion_d(base, api)
    seccion_e(api)
    seccion_f(base, api)
    seccion_g(base, api)
    seccion_h()


if __name__ == "__main__":
    try:
        main()
    except Exception:
        import traceback
        traceback.print_exc()
        print("\n[✗] La auditoría falló — pega este error en el chat.")
        sys.exit(0)