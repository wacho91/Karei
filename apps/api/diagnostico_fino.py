#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
============================================================
 KĀREI · DIAGNÓSTICO FINO PRE-DESPLIEGUE · E-14t66
 SOLO LECTURA · no escribe en la base ni en el código
============================================================
Qué mira (y por qué):

 [A] API VIVA ...... por qué openapi.json salió «no válido» en E-14t65
 [B] SECRET_KEY .... ¿el backend corre con llave por defecto?
 [C] HUÉRFANOS ..... ¿los 10 pagos sin orden son reales o falso
                     positivo (texto '3' vs número 3)?
 [D] INVENTARIO .... por qué NO bajan los gramos al vender
 [E] FRONTEND ...... los 9 localhost: ¿proxy dev, fallback o URL dura?
 [F] ZONA HORARIA .. las horas ingenuas línea por línea (material
                     para los parches America/Bogota)
 [G] GITIGNORE ..... que no se suban karei.db ni .env a GitHub

Cómo correrlo (PowerShell, con la API PRENDIDA en otra ventana):
   cd D:\Prime_TeamIA\proyectos_generados\Karei\apps\api
   python diagnostico_fino.py

Pega la salida COMPLETA en el chat.
"""
import ast
import json
import os
import re
import sqlite3
import sys
import urllib.error
import urllib.request
from pathlib import Path

SELLO = "E-14t66"
API_URL = "http://localhost:8000"

CLAVES_ENV = [
    "SECRET_KEY", "DEBUG", "FRONTEND_URL", "DATABASE_URL",
    "KAREI_SEED_DEMO", "KAREI_SMTP_HOST", "KAREI_SMTP_PORT",
    "KAREI_SMTP_USER", "KAREI_SMTP_PASS", "KAREI_SMTP_FROM",
    "KAREI_CORREO_MASTER",
]

PALABRAS_SECRETAS = re.compile(r"secret|jwt|token|passw|clave", re.I)
PATRON_HORA = re.compile(r"datetime\.now\(\)|datetime\.utcnow\(\)|date\.today\(\)")
DIRS_SKIP = {"node_modules", "dist", "build", ".git", ".vercel",
             ".vite", "__pycache__", ".venv", ".idea", ".vscode"}

R = {"api_viva": None, "openapi_ok": None, "secret_ok": None,
     "huerfanos": None, "inventario": None, "bogota": False, "git_ok": False}


def encabezado(titulo: str) -> None:
    print()
    print("=" * 74)
    print(titulo)
    print("=" * 74)


def normalizar_id(x):
    """'3', 3 y 3.0 caen todos en '3' — la trampa clásica texto vs número."""
    if x is None:
        return None
    try:
        return str(int(float(str(x).strip())))
    except (TypeError, ValueError):
        return str(x).strip()


def abrir_ro(db: Path):
    """SQLite solo lectura; si el modo RO no se puede, abre normal sin escribir."""
    try:
        return sqlite3.connect(f"file:{db.as_posix()}?mode=ro", uri=True)
    except sqlite3.Error:
        return sqlite3.connect(str(db))


def fmt_plata(v) -> str:
    try:
        f = float(v)
        if f == int(f):
            return "$" + f"{int(f):,}".replace(",", ".")
        return "$" + f"{f:,.0f}".replace(",", ".")
    except (TypeError, ValueError):
        return f"${v}"


def probar_json(valor):
    """Convierte '[1,2]', '1,2', '3', 3, lista real → lista de ids."""
    if isinstance(valor, (list, tuple, set)):
        return list(valor)
    if valor is None:
        return []
    texto = str(valor).strip()
    if not texto:
        return []
    for parser in (json.loads, ast.literal_eval):
        try:
            datos = parser(texto)
            if isinstance(datos, (list, tuple, set)):
                return list(datos)
            if datos is None:
                return []
            return [datos]
        except Exception:
            continue
    return [p for p in re.split(r"[,;|\s]+", texto) if p]


def pedir(url: str, timeout: int = 6):
    req = urllib.request.Request(url, headers={"User-Agent": f"karei-{SELLO}"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.headers.get("content-type", ""), r.read()
    except urllib.error.HTTPError as e:
        cuerpo = b""
        try:
            cuerpo = e.read()[:1500]
        except Exception:
            pass
        ct = e.headers.get("content-type", "") if e.headers else ""
        return e.code, ct, cuerpo
    except Exception as e:
        return None, "", str(e).encode()


def resolver_base() -> Path:
    """Encuentra la carpeta del backend (donde viven karei.db y app/)."""
    candidatos = []
    if len(sys.argv) > 1:
        candidatos.append(Path(sys.argv[1]))
    aqui = Path(__file__).resolve().parent
    candidatos += [aqui, aqui.parent, aqui / "apps" / "api",
                   aqui.parent / "apps" / "api"]
    for c in candidatos:
        try:
            if (c / "karei.db").exists() or (c / "app" / "main.py").exists():
                return c.resolve()
        except Exception:
            pass
    return aqui.resolve()


# ============================================================
# [A] API VIVA
# ============================================================
def seccion_api() -> None:
    encabezado("[A] API VIVA — el caso openapi.json")
    status, ctype, cuerpo = pedir(f"{API_URL}/openapi.json")
    if status is None:
        print("[✗] El puerto 8000 NI SIQUIERA CONTESTA → la API estaba APAGADA")
        print("    cuando corriste la auditoría E-14t65. Bloqueador fantasma:")
        print("    no es código roto, es que no había nadie en la puerta.")
        print("    CURA: prende uvicorn y vuelve a correr este diagnóstico.")
        R["api_viva"] = False
        return
    R["api_viva"] = True
    print(f"      · status HTTP  : {status}")
    print(f"      · content-type : {ctype or '(vacío)'}")
    print(f"      · tamaño       : {len(cuerpo)} bytes")
    if cuerpo:
        print(f"      · primeros bytes: {cuerpo[:120]!r}")
    if status == 200 and cuerpo:
        try:
            datos = json.loads(cuerpo)
            rutas = list(datos.get("paths", {}).keys())
            pos = [r for r in rutas if "/pos" in r]
            R["openapi_ok"] = True
            print(f"[✓] openapi.json VÁLIDO: {len(rutas)} rutas totales · {len(pos)} del POS")
            prefijos = sorted({"/".join(p.split("/")[:5]) for p in rutas})
            print("      · módulos que la API declara:")
            for pref in prefijos[:30]:
                print(f"          {pref}")
            if len(prefijos) > 30:
                print(f"          … y {len(prefijos) - 30} prefijos más")
            print("    → El bloqueador 1 de E-14t65 queda DESMONTADO: la API respira.")
            return
        except Exception as exc:
            R["openapi_ok"] = False
            print(f"[✗] Contestó algo pero NO es JSON válido ({exc}).")
            print(f"    Cuerpo crudo (primeros 400): {cuerpo[:400]!r}")
            print("    SOSPECHA: un proceso viejo dueño del puerto 8000, u otro")
            print("    programa escuchando ahí.")
            print("    CURA: cierra todas los python/uvicorn y vuelve a levantar:")
            print("          uvicorn app.main:app --reload --port 8000")
            return
    st2, _, _ = pedir(f"{API_URL}/docs")
    print(f"[!] Respuesta rara (status {status}). /docs responde: {st2}")


# ============================================================
# [B] SECRET_KEY Y VARIABLES
# ============================================================
def seccion_config(api: Path) -> None:
    encabezado("[B] SECRET_KEY Y VARIABLES — valores ocultos")
    envp = api / ".env"
    if envp.exists():
        definidas = {}
        for ln in envp.read_text(encoding="utf-8", errors="replace").splitlines():
            s = ln.strip()
            if not s or s.startswith("#") or "=" not in s:
                continue
            k, _, v = s.partition("=")
            definidas[k.strip()] = v.strip()
        for clave in CLAVES_ENV:
            if definidas.get(clave):
                extra = f" → {definidas[clave]}" if clave == "DEBUG" else " (valor oculto)"
                print(f"      · {clave:<22} ✓ definida{extra}")
            else:
                print(f"      · {clave:<22} [·] NO está")
        R["secret_ok"] = bool(definidas.get("SECRET_KEY"))
    else:
        print("[!] No hay .env en el backend")
        R["secret_ok"] = False

    config = api / "app" / "core" / "config.py"
    if not config.exists():
        print("[!] No encontré app/core/config.py — pégamelo en el chat")
        return
    src = config.read_text(encoding="utf-8", errors="replace")
    campos = re.findall(r"(?m)^    ([a-zA-Z_]\w*)\s*:\s*([^=\n]+?)(?:=\s*(.+))?\s*$", src)
    if campos:
        print(f"      · Settings declara {len(campos)} campos:")
        print("        " + ", ".join(c[0] for c in campos))
    vacios = {"", '""', "''", "None", "null", "False"}
    for nombre, _tipo, default in campos:
        if not PALABRAS_SECRETAS.search(nombre):
            continue
        valor = (default or "").strip()
        if valor and valor not in vacios:
            print(f"      [!] '{nombre}' tiene VALOR POR DEFECTO en config.py → el backend")
            print(f"          corre con llave conocida si no la defines. Define {nombre.upper()} sí o sí.")
        else:
            print(f"      · '{nombre}' sin default útil → obliga a definirla en .env ✓")
    prefijo = re.search(r"env_prefix\s*=\s*[\"']([^\"']*)[\"']", src)
    print(f"      · env_prefix: {prefijo.group(1) if prefijo else '(ninguno)'}")


# ============================================================
# [C] HUÉRFANOS — ¿reales o falso positivo?
# ============================================================
def seccion_huerfanos(api: Path) -> None:
    encabezado("[C] HUÉRFANOS — ¿reales o falso positivo del detector?")
    db = api / "karei.db"
    if not db.exists():
        print(f"[✗] No encontré la base en {db}")
        R["huerfanos"] = "sin-base"
        return
    con = abrir_ro(db)
    cur = con.cursor()
    tablas = {r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    if "karei_payments" not in tablas or "orders" not in tablas:
        print("[!] Faltan karei_payments u orders. Tablas:", ", ".join(sorted(tablas)))
        con.close()
        return
    cols_pagos = [r[1] for r in cur.execute("PRAGMA table_info(karei_payments)")]
    cols_ord = [r[1] for r in cur.execute("PRAGMA table_info(orders)")]
    print(f"      · karei_payments columnas: {', '.join(cols_pagos)}")
    refs = [c for c in cols_pagos
            if ("order" in c.lower() or "orden" in c.lower()) and c.lower() != "id"]
    mapa_ord = {normalizar_id(r[0]): normalizar_id(r[0]) for r in cur.execute("SELECT id FROM orders")}
    print(f"      · órdenes en base: {len(mapa_ord)} · columnas de referencia en pagos: {refs or '(ninguna)'}")

    if not refs:
        lado = [c for c in cols_ord if "payment" in c.lower()]
        print(f"      · el pago no guarda órdenes; vínculo desde orders: {lado or '(tampoco)'}")
        if lado:
            col = lado[0]
            filas = list(cur.execute(f"SELECT id, {col} FROM orders WHERE {col} IS NOT NULL"))
            ids_pagos = {normalizar_id(r[0]) for r in cur.execute("SELECT id FROM karei_payments")}
            malas = [f"order {a} apunta a pago {b}" for a, b in filas
                     if normalizar_id(b) not in ids_pagos]
            print(f"      · órdenes con pago apuntado: {len(filas)} · a pago inexistente: {len(malas)}")
            for m in malas[:10]:
                print(f"        - {m}")
        R["huerfanos"] = "vinculo-desde-orders"
        con.close()
        return

    col_fecha = next((c for c in ("created_at", "fecha", "paid_at", "fecha_pago") if c in cols_pagos), None)
    col_metodo = next((c for c in ("metodo", "method", "medio") if c in cols_pagos), None)
    col_total = next((c for c in ("total", "monto", "valor", "amount") if c in cols_pagos), None)
    col_tenant_pago = next((c for c in ("tenant_id", "tenant") if c in cols_pagos), None)
    col_tenant_ord = next((c for c in ("tenant_id", "tenant") if c in cols_ord), None)

    columnas = ["id"] + [c for c in (col_fecha, col_metodo, col_total) if c] + refs
    n_meta = sum(1 for c in (col_fecha, col_metodo, col_total) if c)
    filas = list(cur.execute(f"SELECT {', '.join(columnas)} FROM karei_payments ORDER BY id"))

    tenant_pago = {}
    if col_tenant_pago:
        tenant_pago = {normalizar_id(a): b for a, b in cur.execute(
            f"SELECT id, {col_tenant_pago} FROM karei_payments")}
    tenant_ord = {}
    if col_tenant_ord:
        tenant_ord = {normalizar_id(a): b for a, b in cur.execute(
            f"SELECT id, {col_tenant_ord} FROM orders")}
    nombres_tenants = {}
    if "tenants" in tablas:
        for tid, tnom in cur.execute("SELECT id, name FROM tenants"):
            nombres_tenants[normalizar_id(tid)] = tnom

    huerfanos, desalineados = [], []
    for fila in filas:
        pid = fila[0]
        meta = fila[1:1 + n_meta]
        vals = fila[1 + n_meta:]
        todos, sin, ok = [], [], []
        for v in vals:
            for item in probar_json(v):
                todos.append(item)
                if normalizar_id(item) in mapa_ord:
                    ok.append(item)
                else:
                    sin.append(item)
        if sin:
            huerfanos.append((pid, sin))
        tp = normalizar_id(tenant_pago.get(normalizar_id(pid)))
        mismatch = []
        for oid in ok:
            to = normalizar_id(tenant_ord.get(normalizar_id(oid)))
            if tp and to and tp != to:
                mismatch.append((oid, to))
        if mismatch:
            desalineados.append((pid, tp, mismatch))
        f = meta[0] if col_fecha else "?"
        m = meta[1] if col_metodo else "?"
        t = fmt_plata(meta[2]) if col_total else "?"
        estado = "OK" if not sin else f"HUÉRFANO {sin}"
        print(f"      · pago {pid} · {f} · {m} · {t} · refs {len(todos)} → {estado}")

    print()
    if not filas:
        print("[!] karei_payments está vacía")
        R["huerfanos"] = "vacia"
    elif not huerfanos:
        print(f"[✓] VEREDICTO: FALSO POSITIVO — los {len(filas)} pagos tienen TODAS sus")
        print("    órdenes en la base. El detector de E-14t65 comparaba texto ('3')")
        print("    contra número (3). No toca rescate: toca corregir el detector.")
        R["huerfanos"] = "falso-positivo"
    else:
        print(f"[!] VEREDICTO: {len(huerfanos)} pago(s) de {len(filas)} con orden(es) que de verdad no existen:")
        for pid, sin in huerfanos:
            print(f"      · pago {pid} → sin orden: {sin}")
        print("    Si eran ventas de prueba borradas → se limpian. Si eran reales →")
        print("    dime y preparamos el rescate (E-14t67).")
        R["huerfanos"] = f"reales:{len(huerfanos)}"
    if desalineados:
        print(f"[!] {len(desalineados)} pago(s) cuyo DUEÑO no coincide con el dueño de sus órdenes:")
        for pid, tp, mm in desalineados[:10]:
            nom_p = nombres_tenants.get(tp, tp)
            nom_o = ", ".join(nombres_tenants.get(to, str(to)) for _, to in mm[:3])
            print(f"      · pago {pid} es de '{nom_p}' pero sus órdenes son de '{nom_o}' → desalineado")
        print("    (esto es lo que hacía invisible el dinero — _reparar_dueno lo arregla al cobrar)")
    if "payments" in tablas:
        try:
            n = cur.execute("SELECT COUNT(*) FROM payments").fetchone()[0]
            print(f"      · nota: la tabla vieja 'payments' guarda {n} fila(s) históricas — no se toca")
        except sqlite3.Error:
            pass
    con.close()


# ============================================================
# [D] INVENTARIO — por qué no bajan los gramos
# ============================================================
def col_de(cols, candidatos):
    bajos = [str(c).lower() for c in cols]
    for cand in candidatos:
        if cand in bajos:
            return cols[bajos.index(cand)]
    for cand in candidatos:
        for i, c in enumerate(bajos):
            if cand in c:
                return cols[i]
    return None


def seccion_inventario(api: Path) -> None:
    encabezado("[D] INVENTARIO — por qué NO bajan los gramos al vender")
    db = api / "karei.db"
    if not db.exists():
        print(f"[✗] No encontré la base en {db}")
        R["inventario"] = "sin-base"
        return
    con = abrir_ro(db)
    cur = con.cursor()
    tablas = {r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    requeridas = ["ingredients", "recipes", "recipe_items", "products", "order_items"]
    faltan = [t for t in requeridas if t not in tablas]
    if faltan:
        print(f"[!] Faltan tablas de inventario: {faltan}")
        print("    Si nunca se crearon, ahí empieza el problema.")
    cols = {}
    for t in ("ingredients", "recipes", "recipe_items", "products",
              "order_items", "orders", "wastes", "tenants"):
        if t in tablas:
            cols[t] = [r[1] for r in cur.execute(f"PRAGMA table_info({t})")]

    nombres_tenants = {}
    if "tenants" in tablas:
        col_nom_t = col_de(cols["tenants"], ["name", "nombre"]) or "id"
        for tid, tnom in cur.execute(f"SELECT id, {col_nom_t} FROM tenants"):
            nombres_tenants[normalizar_id(tid)] = tnom

    def col_tenant(t):
        return col_de(cols.get(t, []), ["tenant_id", "tenant"])

    # ---- la despensa: ingredients
    n_ing = 0
    col_nom_p = None
    if "ingredients" in cols:
        ci = cols["ingredients"]
        col_qty = col_de(ci, ["cantidad", "quantity", "stock", "gramos",
                              "disponible", "existencias", "qty", "amount"])
        col_nom = col_de(ci, ["nombre", "name", "titulo", "title"])
        col_t_ing = col_tenant("ingredients")
        n_ing = cur.execute("SELECT COUNT(*) FROM ingredients").fetchone()[0]
        print(f"      · INGREDIENTES (la despensa): {n_ing} fila(s) · campo de cantidad: {col_qty or '(NO HAY — raro)'}")
        if col_t_ing:
            for tid, n in cur.execute(
                    f"SELECT {col_t_ing}, COUNT(*) FROM ingredients GROUP BY {col_t_ing}"):
                print(f"          dueño {nombres_tenants.get(normalizar_id(tid), tid)}: {n}")
        if col_nom and col_qty:
            sel_t = f", {col_t_ing}" if col_t_ing else ""
            for fila in cur.execute(f"SELECT id, {col_nom}, {col_qty}{sel_t} FROM ingredients LIMIT 8"):
                iid, nom, qty = fila[0], fila[1], fila[2]
                due = ""
                if sel_t:
                    due = " · " + str(nombres_tenants.get(normalizar_id(fila[3]), fila[3]))
                print(f"          · #{iid} {nom}: {qty}{due}")
    else:
        print("[!] No existe la tabla ingredients")

    # ---- la tarjeta receta: recipes + recipe_items
    n_rec = 0
    prod_con_receta = set()
    if "recipes" in cols:
        cr = cols["recipes"]
        col_prod = col_de(cr, ["product_id", "producto_id", "id_producto", "producto"])
        col_t_rec = col_tenant("recipes")
        n_rec = cur.execute("SELECT COUNT(*) FROM recipes").fetchone()[0]
        print(f"      · RECETAS: {n_rec} fila(s) · vínculo a producto: {col_prod or '(NO HAY — raro)'}")
        if col_prod:
            for (pid,) in cur.execute(f"SELECT {col_prod} FROM recipes"):
                prod_con_receta.add(normalizar_id(pid))
        if col_t_rec:
            for tid, n in cur.execute(
                    f"SELECT {col_t_rec}, COUNT(*) FROM recipes GROUP BY {col_t_rec}"):
                print(f"          dueño {nombres_tenants.get(normalizar_id(tid), tid)}: {n}")
    else:
        print("[!] No existe la tabla recipes")

    if "recipe_items" in cols:
        cri = cols["recipe_items"]
        col_ing_ri = col_de(cri, ["ingredient_id", "ingrediente_id", "ingrediente"])
        col_g = col_de(cri, ["gramos", "cantidad", "quantity", "amount", "peso", "weight", "qty"])
        n_ri = cur.execute("SELECT COUNT(*) FROM recipe_items").fetchone()[0]
        print(f"      · LÍNEAS DE RECETA (recipe_items): {n_ri} · ingrediente: {col_ing_ri} · gramos: {col_g}")
        if col_ing_ri and col_g:
            tiene_rec_id = "recipe_id" in [str(c).lower() for c in cri]
            sel = f"SELECT {col_ing_ri}, {col_g}" + (", recipe_id" if tiene_rec_id else "") + " FROM recipe_items LIMIT 8"
            for fila in cur.execute(sel):
                ing, g = fila[0], fila[1]
                rid = fila[2] if len(fila) > 2 else "?"
                print(f"          · receta {rid} usa ingrediente #{ing} → {g} por unidad")
    else:
        print("[!] No existe la tabla recipe_items")

    # ---- los productos: ¿quiénes tienen receta?
    if "products" in cols:
        cp = cols["products"]
        col_t_prod = col_tenant("products")
        col_nom_p = col_de(cp, ["nombre", "name", "titulo"])
        n_prod = cur.execute("SELECT COUNT(*) FROM products").fetchone()[0]
        print(f"      · PRODUCTOS: {n_prod} en total · con receta amarrada: {len(prod_con_receta)}")
        if col_t_prod:
            for tid, n in cur.execute(
                    f"SELECT {col_t_prod}, COUNT(*) FROM products GROUP BY {col_t_prod}"):
                print(f"          dueño {nombres_tenants.get(normalizar_id(tid), tid)}: {n}")
            for (tid,) in cur.execute(f"SELECT DISTINCT {col_t_prod} FROM products").fetchall():
                ids_t = [normalizar_id(r[0]) for r in cur.execute(
                    f"SELECT id FROM products WHERE {col_t_prod} = ?", (tid,))]
                con_r = [i for i in ids_t if i in prod_con_receta]
                nom_t = nombres_tenants.get(normalizar_id(tid), tid)
                print(f"          · {nom_t}: {len(con_r)}/{len(ids_t)} productos con receta")

    # ---- qué se vendió y si ese plato tenía receta
    vendidos_sin_receta = []
    if "order_items" in cols and "orders" in cols:
        coi = cols["order_items"]
        col_prod_oi = col_de(coi, ["product_id", "producto_id"])
        col_oid_oi = col_de(coi, ["order_id", "orden_id"])
        col_cant_oi = col_de(coi, ["cantidad", "quantity", "qty"])
        col_t_ord = col_tenant("orders")
        if col_prod_oi and col_oid_oi and col_t_ord:
            q = (f"SELECT oi.{col_prod_oi}, o.{col_t_ord}"
                 + (f", oi.{col_cant_oi}" if col_cant_oi else "")
                 + f" FROM order_items oi JOIN orders o ON oi.{col_oid_oi} = o.id")
            por_tenant = {}
            for fila in cur.execute(q):
                pid, tid = normalizar_id(fila[0]), normalizar_id(fila[1])
                cant = float(fila[2] or 1) if len(fila) > 2 else 1.0
                d = por_tenant.setdefault(tid, {})
                d[pid] = d.get(pid, 0.0) + cant
            print("      · VENTAS (order_items) por plato:")
            if not por_tenant:
                print("          (no hay order_items vinculados a órdenes)")
            for tid, prods in por_tenant.items():
                nom_t = nombres_tenants.get(tid, tid)
                sin_r = {p: c for p, c in prods.items() if p not in prod_con_receta}
                con_r = {p: c for p, c in prods.items() if p in prod_con_receta}
                print(f"          · {nom_t}: {len(prods)} plato(s) distinto(s) vendido(s) · "
                      f"{len(con_r)} con receta · {len(sin_r)} SIN receta")
                for p, c in list(sin_r.items())[:10]:
                    nom_p = ""
                    if "products" in cols and col_nom_p:
                        r = cur.execute(f"SELECT {col_nom_p} FROM products WHERE id = ?", (p,)).fetchone()
                        nom_p = f" ({r[0]})" if r else ""
                    print(f"              - producto #{p}{nom_p} vendido ×{c:g} → SIN RECETA")
                    vendidos_sin_receta.append((tid, p, nom_p))

    # ---- mermas y auditoría: ¿el descuento se fue por otro lado?
    if "wastes" in cols:
        try:
            n_w = cur.execute("SELECT COUNT(*) FROM wastes").fetchone()[0]
            print(f"      · MERMAS (wastes): {n_w} fila(s)")
        except sqlite3.Error:
            pass
    if "audit_logs" in tablas:
        try:
            n_a = cur.execute(
                "SELECT COUNT(*) FROM audit_logs WHERE action LIKE '%ingred%' "
                "OR action LIKE '%recipe%' OR action LIKE '%inventario%' "
                "OR action LIKE '%stock%'").fetchone()[0]
            print(f"      · AUDIT_LOGS con movimientos de inventario: {n_a}")
        except sqlite3.Error:
            pass

    print()
    print("   VEREDICTO INVENTARIO:")
    if n_ing == 0:
        print("      [✗] No hay NI UN ingrediente creado → no hay despensa que descontar.")
        print("          Primero se crean los ingredientes y se les pone su cantidad en gramos.")
        R["inventario"] = "sin-ingredientes"
    elif n_rec == 0:
        print("      [✗] No hay NI UNA receta → el sistema no sabe que una hamburguesa")
        print("          gasta 150 g de carne. Sin receta no hay nada que descontar,")
        print("          aunque el código estuviera perfecto.")
        R["inventario"] = "sin-recetas"
    elif vendidos_sin_receta:
        print(f"      [!] Hay {n_rec} receta(s), pero se vendieron {len(vendidos_sin_receta)}")
        print("          línea(s) de platos SIN receta amarrada → esos platos no descuentan")
        print("          ni un gramo. Los que sí tienen receta dependen de que el cobro")
        print("          llame al descuento (ver el mapa de código de abajo).")
        R["inventario"] = "ventas-sin-receta"
    else:
        print("      [·] Hay ingredientes, recetas y ventas alineadas. Si aun así no baja,")
        print("          el cobro nunca llama al descuento → toca parche en el código")
        print("          (con el mapa de abajo te lo preparo exacto).")
        R["inventario"] = "falta-descuento-en-codigo"
    con.close()

    # ---- mapa del código: quién toca el inventario
    print()
    print("      · ¿Quién toca recetas/ingredientes en el CÓDIGO?")
    patron = re.compile(r"recipe_item|recipe|ingredient|inventario|descont|merma|waste", re.I)
    hits = {}
    for raiz, dirs, archivos in os.walk(api):
        dirs[:] = [d for d in dirs if d not in DIRS_SKIP]
        for nombre in archivos:
            if not nombre.endswith(".py"):
                continue
            if nombre.startswith(("auditoria", "diagnostico", "rescatar", "verifica", "test")):
                continue
            ruta = Path(raiz) / nombre
            try:
                lineas = ruta.read_text(encoding="utf-8", errors="replace").splitlines()
            except Exception:
                continue
            for i, ln in enumerate(lineas, 1):
                if patron.search(ln):
                    try:
                        rel = ruta.relative_to(api)
                    except ValueError:
                        rel = ruta
                    hits.setdefault(str(rel), []).append((i, ln.strip()))
    if not hits:
        print("        [✗] NINGÚN archivo del backend menciona recetas/ingredientes →")
        print("            el descuento de inventario NO EXISTE en el código: toca crearlo")
        print("            (plugin nuevo al cobro). Pégame la salida y te lo entrego.")
    else:
        for rel, ls in list(hits.items())[:12]:
            primera = ls[0]
            print(f"        · {rel}: {len(ls)} mención(es) · ej. línea {primera[0]}: {primera[1][:90]}")


# ============================================================
# [E] FRONTEND — localhost uno por uno
# ============================================================
def seccion_frontend(api: Path) -> None:
    encabezado("[E] FRONTEND — los localhost, uno por uno")
    web = api.parent / "web"                 # apps/api → hermano apps/web
    if not web.exists():
        web = api.parent.parent / "apps" / "web"
    if not web.exists():
        web = api / "apps" / "web"
    if not web.exists():
        print("[!] No encontré apps/web junto al backend")
        return
    print(f"Carpeta frontend: {web}")
    hallados = []
    for raiz, dirs, archivos in os.walk(web):
        dirs[:] = [d for d in dirs if d not in DIRS_SKIP]
        for nombre in archivos:
            es_codigo = nombre.endswith((".ts", ".tsx", ".js", ".jsx", ".html"))
            if not es_codigo and nombre != ".env":
                continue
            ruta = Path(raiz) / nombre
            try:
                lineas = ruta.read_text(encoding="utf-8", errors="replace").splitlines()
            except Exception:
                continue
            for i, ln in enumerate(lineas, 1):
                if "localhost" in ln or "127.0.0.1" in ln:
                    hallados.append((ruta.relative_to(web), i, ln.strip()))
    if not hallados:
        print("[✓] Cero localhost en el código del frontend")
    else:
        print(f"Encontré {len(hallados)} referencia(s):")
        for rel, i, ln in hallados[:40]:
            s = str(rel)
            if "vite.config" in s:
                marca = "  ← proxy de desarrollo, OK"
            elif "env" in s.lower() or s == ".env":
                marca = "  ← debe leer VITE_API_URL primero"
            else:
                marca = "  ← si es URL dura, rompe en producción"
            print(f"      · {s}:{i} · {ln[:100]}{marca}")
        if len(hallados) > 40:
            print(f"      … y {len(hallados) - 40} más")
    for nombre in (".env", ".env.production", ".env.local"):
        p = web / nombre
        if p.exists():
            for ln in p.read_text(encoding="utf-8", errors="replace").splitlines():
                if "VITE_API_URL" in ln:
                    valor = ln.partition("=")[2].strip()
                    estado = "VACÍA → en producción la web no sabrá dónde está el backend" if not valor else f"= {valor}"
                    print(f"      · {nombre} → VITE_API_URL {estado}")


# ============================================================
# [F] ZONA HORARIA
# ============================================================
def seccion_hora(api: Path) -> None:
    encabezado("[F] ZONA HORARIA — línea por línea (material para los parches)")
    blancos = []
    usa_bogota = False
    for raiz, dirs, archivos in os.walk(api):
        dirs[:] = [d for d in dirs if d not in DIRS_SKIP]
        for nombre in archivos:
            if not nombre.endswith(".py"):
                continue
            ruta = Path(raiz) / nombre
            try:
                lineas = ruta.read_text(encoding="utf-8", errors="replace").splitlines()
            except Exception:
                continue
            if any("America/Bogota" in ln for ln in lineas):
                usa_bogota = True
            for i, ln in enumerate(lineas):
                if PATRON_HORA.search(ln):
                    blancos.append((ruta, i, lineas))
    R["bogota"] = usa_bogota
    if not blancos:
        print("[✓] Ninguna hora ingenua en el backend")
    else:
        print(f"Encontré {len(blancos)} uso(s) de hora ingenua:")
        for ruta, i, lineas in blancos:
            try:
                rel = ruta.relative_to(api)
            except ValueError:
                rel = ruta
            guion = "  ← script local, no afecta producción" if rel.name.startswith(
                ("auditoria", "diagnostico", "rescatar", "verifica", "test")) else ""
            print(f"      · {rel}:{i + 1}{guion}")
            print(f"          │ {lineas[i].strip()[:120]}")
            if i + 1 < len(lineas):
                print(f"          │ {lineas[i + 1].strip()[:120]}")
    print()
    if usa_bogota:
        print("[·] Alguien ya usa America/Bogota en algún archivo")
    else:
        print("[!] NADIE usa America/Bogota → en Railway (UTC) el «hoy» del cuadre")
        print("    cambiaría de día a las 7:00 p.m. de Bogotá: las ventas de la")
        print("    noche caerían al día siguiente. Con la salida de esta sección")
        print("    te preparo los parches exactos (el helper tiempo_bogota.py ya está listo).")


# ============================================================
# [G] GITIGNORE
# ============================================================
def seccion_gitignore(api: Path) -> None:
    encabezado("[G] .GITIGNORE — secretos y ventas fuera de GitHub")
    tokens = ("karei.db", "*.db", ".env")
    rutas = [
        ("backend", api / ".gitignore"),
        ("apps", api.parent / ".gitignore"),
        ("repo", api.parent.parent / ".gitignore"),
        ("frontend", api.parent / "web" / ".gitignore"),
    ]
    hay_alguno, todo_bien = False, True
    for etiqueta, ruta in rutas:
        if ruta.exists():
            hay_alguno = True
            texto = ruta.read_text(encoding="utf-8", errors="replace")
            faltan = [t for t in tokens if t not in texto]
            if faltan:
                todo_bien = False
                print(f"      · .gitignore {etiqueta}: le faltan {faltan}")
            else:
                print(f"      · .gitignore {etiqueta}: completo ✓")
        else:
            print(f"      · .gitignore {etiqueta}: no existe")
    R["git_ok"] = hay_alguno and todo_bien
    if not R["git_ok"]:
        print("    → Pega al final del .gitignore del repo el bloque gitignore_agregar.txt (ya te lo entregué)")


# ============================================================
# VEREDICTO
# ============================================================
def veredicto() -> None:
    encabezado("[VEREDICTO] E-14t66 — qué sigue")
    if R.get("openapi_ok"):
        print("  [✓] API viva y openapi válido → el bloqueador 1 cayó")
    elif R.get("api_viva"):
        print("  [!] La API contesta pero openapi.json no es JSON → proceso viejo en el 8000")
    else:
        print("  [!] La API está apagada → prende uvicorn y vuelve a correr")
    if R.get("secret_ok"):
        print("  [✓] SECRET_KEY definida en .env")
    else:
        print("  [✗] SECRET_KEY NO está → genérala y agrégala (2 minutos, ver chat)")
    h = R.get("huerfanos")
    if h == "falso-positivo":
        print("  [✓] Huérfanos: falso positivo del detector — no hay que rescatar nada")
    elif isinstance(h, str) and h.startswith("reales"):
        print("  [!] Huérfanos reales → decidir limpieza o rescate")
    inv = R.get("inventario")
    if inv == "sin-recetas" or inv == "sin-ingredientes":
        print("  [✗] INVENTARIO: falta la receta/base — hay que sembrar datos, no parchar código")
    elif inv == "ventas-sin-receta":
        print("  [!] INVENTARIO: productos vendidos sin receta → sembrar recetas + parche de descuento")
    elif inv == "falta-descuento-en-codigo":
        print("  [!] INVENTARIO: recetas OK pero el cobro no descuenta → parche de código (E-14t67)")
    print()
    print("Pega esta salida COMPLETA en el chat: con ella te entrego el parche del")
    print("inventario, los parches de zona horaria y los nombres exactos de variables")
    print("para Railway.")
    print()
    print(f"Kārei {SELLO} · diagnóstico SOLO LECTURA · nada fue modificado")


def main() -> None:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    print("=" * 74)
    print(f"  KĀREI · DIAGNÓSTICO FINO PRE-DESPLIEGUE · {SELLO}")
    print("=" * 74)
    api = resolver_base()
    print(f"Backend: {api}")
    seccion_api()
    seccion_config(api)
    seccion_huerfanos(api)
    seccion_inventario(api)
    seccion_frontend(api)
    seccion_hora(api)
    seccion_gitignore(api)
    veredicto()


if __name__ == "__main__":
    main()