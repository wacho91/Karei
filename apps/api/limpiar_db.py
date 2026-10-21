# -*- coding: utf-8 -*-
r"""
============================================================================
Karei · limpiar_db.py v2 (FIX E-14i) — DES-ENVENENA la base de datos
============================================================================
QUÉ PASÓ: tables.status es un Enum de SQLAlchemy (valores válidos:
AVAILABLE, OCCUPIED, RESERVED, ...). Al abrir la mesa, pos_compat escribió
'Ocupada' (un valor que NO existe en el enum). SQLite no se quejó (su DDL
no tiene CHECK), pero después TODAS las rutas que leen esa mesa reventan:

    LookupError: 'Ocupada' is not among the defined enum values.
    Enum name: tablestatus. Possible values: AVAILABLE, OCCUPIED, ...

→ mapa de mesas 500, dashboard 500, y el navegador lo muestra como
"bloqueado por CORS" / "No se pudo conectar con el backend".

QUÉ HACE ESTE SCRIPT:
  1. Descubre los valores VÁLIDOS de cada enum:
     a) importando los modelos del proyecto (app.models / app.database),
     b) leyendo el CHECK del CREATE TABLE,
     c) usando la lista conocida del mensaje de error (AVAILABLE, OCCUPIED,
        RESERVED, OUT_OF_SERVICE) solo para tables.status.
  2. Repara tables.status ('Ocupada' → el valor OCCUPIED real del enum).
  3. Repara orders.status si escribió un valor que no existe en el enum.
  4. Rellena opened_by_id / waiter_id que estén NULL.
  5. Reporta todo. NO BORRA nada (salvo con --reset).

USO — terminal DENTRO de la carpeta apps/api (donde está karei.db):

    python limpiar_db.py            → repara (modo normal)
    python limpiar_db.py --reset    → además BORRA los pedidos abiertos de
                                      prueba y deja las mesas Libres

Correrlo con el venv del proyecto ayuda (importa los modelos):
    D:\Prime_TeamIA\venv\Scripts\python.exe limpiar_db.py
Idempotente: puedes correrlo las veces que quieras.
"""
import glob
import os
import re
import sqlite3
import sys

TERMINALES = ("PAID", "PAGADO", "CANCELLED", "CANCELED", "CANCELADO",
              "OUT_OF_SERVICE", "OUTOFSERVICE", "CLOSED")

# Lista CONOCIDA por el mensaje de error del backend de Cristian
FALLBACK_TABLES = ["AVAILABLE", "OCCUPIED", "RESERVED", "OUT_OF_SERVICE"]

SINONIMOS = {
    "ocupado": ["OCUPADA", "OCUPADO", "OCCUPIED", "BUSY", "IN_USE", "EN_USO"],
    "libre": ["LIBRE", "AVAILABLE", "FREE", "DISPONIBLE"],
    "reservada": ["RESERVADA", "RESERVA", "RESERVED", "BOOKED"],
    "limpieza": ["LIMPIEZA", "CLEANING", "CLEAN"],
    "fuera": ["OUT_OF_SERVICE", "OUTOFSERVICE", "FUERA_DE_SERVICIO", "DISABLED"],
}


def encontrar_db():
    env = os.environ.get("KAREI_DATABASE_URL")
    if env and "///" in env:
        return env.split("///", 1)[-1]
    for patron in ("karei.db", "*.db", "*.sqlite", "*.sqlite3"):
        for f in sorted(glob.glob(patron)) + sorted(
                glob.glob(os.path.join("**", patron), recursive=True)):
            if any(x in f for x in ("venv", "node_modules", "site-packages")):
                continue
            return f
    return None


def valores_enum_ddl(con, tabla, columna):
    """Valores válidos si el DDL tiene CHECK (col IN (...))."""
    try:
        fila = con.execute(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name=?", (tabla,)).fetchone()
        ddl = fila[0] if fila and fila[0] else ""
        pat = (rf"CHECK\s*\(\s*[\"'`\[]?(?:[A-Za-z_]\w*\.)?{columna}(?![\w])[\"'`\]]?"
               rf"\s+IN\s*\(([^)]*)\)")
        m = re.search(pat, ddl, re.I | re.S)
        if m:
            return re.findall(r"'((?:[^']|'')*)'", m.group(1))
    except sqlite3.Error:
        pass
    return []


def valores_enum_modelos():
    """Importa los modelos SQLAlchemy del proyecto y extrae col.type.enums.
    Devuelve {(tabla, columna): [valores]} o {} si no se pudo."""
    out = {}
    try:
        sys.path.insert(0, os.getcwd())
        from sqlalchemy import Enum as SAEnum
        from sqlalchemy.sql.schema import MetaData
        for mn in ("app.models", "app.database", "app.db", "app.models.tables",
                   "app.models.pos", "models", "database"):
            try:
                mod = __import__(mn, fromlist=["*"])
            except Exception:
                continue
            md = getattr(mod, "metadata", None)
            if md is None:
                base = getattr(mod, "Base", None)
                md = getattr(base, "metadata", None) if base is not None else None
            if isinstance(md, MetaData):
                for tname, tabla in md.tables.items():
                    for col in tabla.columns:
                        if isinstance(col.type, SAEnum):
                            out[(str(tname).lower(), str(col.name).lower())] = \
                                list(col.type.enums)
            if out:
                print(f"(enums leídos de los modelos: módulo '{mn}')")
                break
    except Exception:
        pass
    return out


def eleccion_valida(vals, grupos_preferidos):
    """Elige un valor válido probando grupos de sinónimos en orden."""
    for grupo in grupos_preferidos:
        for sin in SINONIMOS.get(grupo, [grupo]):
            for v in vals:
                if v.upper() == sin:
                    return v
    for v in vals:
        if v.upper() not in TERMINALES:
            return v
    return vals[0] if vals else None


def reparar_columna_estado(con, tabla, columna, grupos_si_invalido, reporte, fuente):
    if not fuente["vals"]:
        reporte.append(f"  ! {tabla}.{columna}: NO pude descubrir el enum → "
                       f"no toco estos valores (los estados actuales quedan igual)")
        return
    vals = fuente["vals"]
    filas = con.execute(f"SELECT rowid, {columna} FROM {tabla}").fetchall()
    n = 0
    for rowid, valor in filas:
        if valor is None or str(valor) in vals:
            continue
        nuevo = eleccion_valida(vals, grupos_si_invalido)
        con.execute(f"UPDATE {tabla} SET {columna}=? WHERE rowid=?", (nuevo, rowid))
        reporte.append(f"  [OK] {tabla}.{columna}: '{valor}' → '{nuevo}'")
        n += 1
    if n == 0:
        reporte.append(f"  · {tabla}.{columna}: todas las filas OK (enum {fuente['de']}: {vals})")


def reparar_nulos(con, uid, reporte):
    for tabla, col in (("table_sessions", "opened_by_id"), ("orders", "waiter_id")):
        try:
            n = con.execute(f"SELECT COUNT(*) FROM {tabla} WHERE {col} IS NULL").fetchone()[0]
            if n:
                con.execute(f"UPDATE {tabla} SET {col}=? WHERE {col} IS NULL", (uid,))
                reporte.append(f"  [OK] {tabla}.{col}: {n} filas rellenadas con usuario real")
            else:
                reporte.append(f"  · {tabla}.{col}: sin NULLs")
        except sqlite3.Error as e:
            reporte.append(f"  · {tabla}.{col}: {e}")


def reset_pos(con, vals_orders, vals_tables, reporte):
    """Borra pedidos/sesiones abiertos de prueba y deja mesas Libres."""
    if vals_orders:
        no_terminal = [v for v in vals_orders if v.upper() not in TERMINALES]
        abiertos = no_terminal or list(vals_orders)
        q = ",".join("?" for _ in abiertos)
        ids = [r[0] for r in con.execute(
            f"SELECT id FROM orders WHERE status IN ({q})", abiertos).fetchall()]
    else:
        ids = [r[0] for r in con.execute(
            "SELECT id FROM orders WHERE status NOT IN ('PAID','CANCELLED')").fetchall()]
    if ids:
        q = ",".join("?" for _ in ids)
        try:
            n_items = con.execute(
                f"DELETE FROM order_items WHERE order_id IN ({q})", ids).rowcount
        except sqlite3.Error:
            n_items = 0
        n_ord = con.execute(f"DELETE FROM orders WHERE id IN ({q})", ids).rowcount
        reporte.append(f"  [OK] pedidos abiertos borrados: {n_ord} (+{n_items} items)")
    try:
        n_ses = con.execute("DELETE FROM table_sessions WHERE status='OPEN'").rowcount
        if n_ses:
            reporte.append(f"  [OK] sesiones abiertas borradas: {n_ses}")
    except sqlite3.Error as e:
        reporte.append(f"  · sesiones: {e}")
    libres = eleccion_valida(vals_tables or FALLBACK_TABLES, ["libre"])
    if libres:
        n = con.execute(
            "UPDATE tables SET status=? WHERE status NOT IN (?)",
            (libres, libres)).rowcount
        if n:
            reporte.append(f"  [OK] mesas dejadas Libres: {n} → '{libres}'")


def main():
    reset = "--reset" in sys.argv
    db = encontrar_db()
    if not db:
        print("[X] No encontré la base de datos.")
        print("    Ejecuta este script DENTRO de la carpeta apps/api (donde está karei.db)")
        sys.exit(1)
    print("DB encontrada:", os.path.abspath(db))
    con = sqlite3.connect(db)
    reporte = []

    enums_modelos = valores_enum_modelos()

    def fuente_de(tabla, columna, fallback=None):
        vals = valores_enum_ddl(con, tabla, columna)
        de = "CHECK del DDL"
        if not vals:
            vals = enums_modelos.get((tabla, columna), [])
            de = "modelos del proyecto"
        if not vals and fallback:
            vals, de = fallback, "lista conocida (mensaje de error)"
        return {"vals": vals, "de": de}

    f_tables = fuente_de("tables", "status", fallback=FALLBACK_TABLES)
    f_orders = fuente_de("orders", "status")

    # 1) reparar estados
    reparar_columna_estado(con, "tables", "status", ["ocupado", "libre"], reporte, f_tables)
    reparar_columna_estado(con, "orders", "status", ["libre"], reporte, f_orders)

    # 2) usuario real para relaciones
    uid = None
    for tabla in ("users", "user", "usuarios", "employees", "staff"):
        try:
            fila = con.execute(f"SELECT id FROM {tabla} LIMIT 1").fetchone()
            if fila and fila[0]:
                uid = str(fila[0])
                break
        except sqlite3.Error:
            continue
    if uid:
        reparar_nulos(con, uid, reporte)
    else:
        reporte.append("  · sin usuarios en la DB → no puedo rellenar opened_by_id/waiter_id")

    # 3) reset opcional
    if reset:
        extra = []
        reset_pos(con, f_orders["vals"] or None, f_tables["vals"], extra)
        reporte += ["  — RESET —"] + extra

    con.commit()
    con.close()

    print("")
    print("REPORTE:")
    for linea in reporte:
        print(linea)
    print("")
    print("Listo. Ahora:")
    print("  1. Refresca el POS (F5) → las mesas y el Dashboard deben cargar.")
    if not reset:
        print("  2. La mesa 'Ocupada' tiene el pedido a medias: ábrela, agrega")
        print("     productos y ENVIAR A COCINA para completar el flujo.")
        print("     (Si prefieres empezar de cero: python limpiar_db.py --reset)")


if __name__ == "__main__":
    main()