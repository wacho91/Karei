# -*- coding: utf-8 -*-
"""
═════════════════════════════════════════════════════════════════════════════
Kārei · diagnostico_ventas.py (E-14t58) — RADIOGRAFÍA DE LA CAJA EN 5 SEGUNDOS
═════════════════════════════════════════════════════════════════════════════
LA CADENA DE UNA VENTA (los 6 eslabones que este script verifica):

  [1] ¿El backend usa ESTA base de datos?          → sección 0 y 1
  [2] ¿El cobro quedó GUARDADO en karei_payments?  → sección 3
  [3] ¿Con qué tenant (marca) quedó cada pago?     → sección 3
  [4] ¿De quién son sus ÓRDENES (la verdad E-14w-c)? → sección 4
  [5] ¿Tu usuario tiene tenant? ¿cuál?             → sección 2
  [6] ¿Qué vería CADA usuario tras la reparación?  → sección 5 (simulación)

QUÉ HACE: SOLO LEE la base — no escribe nada, no borra nada, no toca nada.

CÓMO USARLO (desde la carpeta del backend, la misma donde corres uvicorn):
    python diagnostico_ventas.py

Al terminar: pega la SALIDA COMPLETA en el chat y vemos el eslabón roto.
============================================================================
"""
import datetime
import glob
import os
import sqlite3


def _nombre_base(url: str) -> str:
    return (str(url).replace("sqlite:///", "")
            .replace("+aiosqlite", "").strip())


def resolver_db() -> str:
    env = os.environ.get("KAREI_DATABASE_URL")
    if env:
        return _nombre_base(env)
    for modpath in ("app.core.config", "app.config", "app.settings",
                    "config", "settings"):
        try:
            mod = __import__(modpath, fromlist=["*"])
            s = getattr(mod, "settings", None)
            if s is None:
                continue
            url = (getattr(s, "DATABASE_URL", None)
                   or getattr(s, "SQLALCHEMY_DATABASE_URL", None)
                   or getattr(s, "database_url", None))
            if url:
                print(f"    (tomada de {modpath})")
                return _nombre_base(url)
        except Exception:
            pass
    candidatos = (glob.glob("*.db") + glob.glob("*.sqlite*")
                  + glob.glob(os.path.join("app", "*.db"))
                  + glob.glob(os.path.join("backend", "*.db")))
    return candidatos[0] if candidatos else ""


def _columnas(cx, tabla: str) -> set:
    try:
        return {r[1] for r in cx.execute(f"PRAGMA table_info({tabla})")}
    except Exception:
        return set()


def main():
    print("═" * 72)
    print("  KĀREI · DIAGNÓSTICO DE VENTAS (E-14t58) — solo lectura")
    print("═" * 72)

    # ── [0] TODAS las bases candidatas (¿y si el backend usa OTRA?) ──────
    print("\n[0] BASES DE DATOS ENCONTRADAS en esta carpeta y alrededores:")
    vistas = []
    for f in (glob.glob("*.db") + glob.glob("*.sqlite*")
              + glob.glob(os.path.join("app", "*.db"))
              + glob.glob(os.path.join("backend", "*.db"))
              + glob.glob(os.path.join("data", "*.db"))):
        if f in vistas:
            continue
        vistas.append(f)
        try:
            cx0 = sqlite3.connect(f)
            try:
                n = cx0.execute(
                    "SELECT COUNT(*) FROM karei_payments").fetchone()[0]
                marca = f"← {n} pago(s) guardado(s)"
            except Exception:
                marca = "(sin tabla karei_payments)"
            cx0.close()
        except Exception as e:
            marca = f"(no legible: {e})"
        print(f"    · {os.path.abspath(f)}  {marca}")

    ruta = resolver_db()
    if not ruta or not os.path.exists(ruta):
        print(f"\n[✗] No encontré la base de datos desde {os.getcwd()}")
        print("    Corre este script desde la carpeta del backend.")
        return
    print(f"\n[1] BASE ELEGIDA: {os.path.abspath(ruta)}")
    print("    (si esta NO es tu base, ese es el eslabón roto #1)")
    cx = sqlite3.connect(ruta)
    cx.row_factory = sqlite3.Row

    # ── [2] USUARIOS: quién tiene qué tenant ────────────────────────────
    print("\n[2] USUARIOS (eslabón 5 — ¿tu usuario tiene tenant?):")
    usuarios = []
    try:
        usuarios = cx.execute(
            "SELECT id, email, tenant_id FROM users").fetchall()
        for u in usuarios:
            print(f"    · {str(u['email']):<34} tenant={u['tenant_id']!r}")
    except Exception as e:
        print(f"    [✗] users no legible: {e}")

    # ── [3] PAGOS guardados (eslabones 2 y 3) ───────────────────────────
    print("\n[3] PAGOS EN karei_payments (TODOS, sin filtro):")
    pagos = []
    cols_p = _columnas(cx, "karei_payments")
    if not cols_p:
        print("    [✗] LA TABLA karei_payments NO EXISTE en esta base →")
        print("        los cobros no se guardaron AQUÍ (¿otra base? ¿zombi?)")
    else:
        falta = [c for c in ("tenant_id", "order_ids", "ticket_no")
                 if c not in cols_p]
        if falta:
            print(f"    (⚠ faltan columnas: {falta} — tabla vieja)")
        try:
            sel = ("SELECT id, paid_at, created_at, table_name, method, "
                   "subtotal, tip, total, ticket_no, tenant_id, order_ids "
                   "FROM karei_payments ORDER BY "
                   "COALESCE(paid_at, created_at) DESC")
            pagos = cx.execute(sel).fetchall()
        except Exception as e:
            try:
                sel = ("SELECT id, paid_at, created_at, table_name, method, "
                       "subtotal, tip, total, tenant_id, order_ids "
                       "FROM karei_payments ORDER BY COALESCE(paid_at, created_at) DESC")
                pagos = cx.execute(sel).fetchall()
            except Exception as e2:
                print(f"    [✗] karei_payments no legible: {e} / {e2}")
    if not pagos:
        print("    (VACÍA — ningún cobro quedó guardado en esta base)")
    hoy = datetime.date.today()
    print(f"    (HOY del servidor = {hoy.isoformat()})")
    for p in pagos:
        f = p["paid_at"] or p["created_at"]
        dia = str(f)[:10] if f else "?"
        marca_hoy = "← HOY" if dia == hoy.isoformat() else (
            "← OTRO DÍA (no sale en 'Hoy', usa filtro Todo)" if dia != "?" else "")
        try:
            total = f"${p['total']}"
        except (IndexError, KeyError):
            total = "$?"
        try:
            tn = p["tenant_id"]
        except (IndexError, KeyError):
            tn = "?"
        try:
            tirilla = p["ticket_no"]
        except (IndexError, KeyError):
            tirilla = "?"
        print(f"    · {str(f):<19} {str(p['table_name']):<10} "
              f"{str(p['method']):<10} {total:<12} "
              f"tirilla={tirilla} tenant={tn!r} {marca_hoy}")
        print(f"        ordenes={p['order_ids']!r}")

    # ── [4] LA VERDAD DE LAS ÓRDENES (eslabón 4) ────────────────────────
    print("\n[4] VERDAD DE LAS ÓRDENES (dueño E-14w-c de cada pago):")
    duenos = None
    cols_o = _columnas(cx, "orders")
    if not cols_o:
        print("    [✗] la tabla orders NO EXISTE (?!)")
    elif "tenant_id" not in cols_o:
        print("    [✗✗] TU TABLA orders NO TIENE COLUMNA tenant_id →")
        print("         la adopción E-14w-c es IMPOSIBLE en esta base.")
        print("         Columnas de orders:", sorted(cols_o))
    else:
        try:
            duenos = {str(r["id"]): r["tenant_id"] for r in
                      cx.execute("SELECT id, tenant_id FROM orders")}
            print(f"    (orders leídas: {len(duenos)} · con tenant no nulo: "
                  f"{sum(1 for v in duenos.values() if v is not None)})")
        except Exception as e:
            print(f"    [✗] orders no legible: {e}")
    if duenos is not None:
        for p in pagos:
            oids = [o.strip() for o in
                    str(p["order_ids"] or "").split(",") if o.strip()]
            if not oids:
                print(f"    · pago tirilla={p['ticket_no']} SIN order_ids → "
                      f"la reparación NO puede adoptarlo")
                continue
            ts = {("" if duenos.get(o) is None else str(duenos.get(o)))
                  if o in duenos else "⚠NO_EXISTE" for o in oids}
            if "⚠NO_EXISTE" in ts:
                ver = "ÓRDENES AUSENTES → no adoptable, oculto"
            elif len(ts) == 1:
                ver = f"todas de tenant={next(iter(ts))!r} → adopción posible"
            else:
                ver = f"ÓRDENES MIXTAS {ts} → no adoptable, oculto"
            print(f"    · pago tirilla={p['ticket_no']} órdenes={len(oids)} → {ver}")

    # ── [5] SIMULACIÓN: qué vería CADA usuario (eslabón 6) ──────────────
    print("\n[5] SIMULACIÓN (reparación + filtro, IGUAL que el backend):")
    if not pagos:
        print("    (sin pagos no hay nada que simular)")
    else:
        for u in usuarios:
            mios = str(u["tenant_id"] or "")
            visibles, razones = [], []
            for p in pagos:
                t = str(p["tenant_id"]) if p["tenant_id"] is not None else ""
                if t == mios:
                    visibles.append(p)
                    continue
                oids = [o.strip() for o in
                        str(p["order_ids"] or "").split(",") if o.strip()]
                if duenos is None or not oids:
                    razones.append(f"tirilla={p['ticket_no']}: sin ordenes/verdad")
                    continue
                if not all(o in duenos for o in oids):
                    razones.append(f"tirilla={p['ticket_no']}: órdenes no existen")
                    continue
                t_ords = {("" if duenos[o] is None else str(duenos[o]))
                          for o in oids}
                if t_ords == {mios}:
                    visibles.append(p)   # adoptado
                else:
                    razones.append(
                        f"tirilla={p['ticket_no']}: órdenes de {t_ords}, no de {mios!r}")
            email = str(u["email"])
            print(f"    · {email:<34} tenant={mios!r} → VERÍA "
                  f"{len(visibles)} de {len(pagos)} pago(s)")
            for r in razones[:6]:
                print(f"        oculto: {r}")

    # ── [6] VEREDICTO ───────────────────────────────────────────────────
    print("\n[6] VEREDICTO RÁPIDO:")
    if not pagos:
        print("    · karei_payments VACÍA → los cobros NO se guardaron aquí.")
        print("      Mira la sección [0]: ¿otra base tiene tus pagos?")
        print("      Si ninguna: uvicorn zombi viejo escribiendo en otra ruta")
        print("      o 'database is locked'. Cierra TODOS los uvicorn y reintenta.")
    else:
        ten = sorted({str(p["tenant_id"]) for p in pagos})
        print(f"    · {len(pagos)} pago(s) en la base · tenants de los pagos: {ten}")
        print("    · Si tu usuario vería >0 en [5] pero /ventas muestra 0 →")
        print("      el CÓDIGO vivo está viejo: mira Swagger /api/v1/pos/reportes/pagos")
        print("      → el campo \"version\" debe decir E-14w-c (si dice E-14w-b u otra,")
        print("        el pos_cuenta_live nuevo NO quedó aplicado).")
        print("    · Si tu usuario vería 0 → la culpa es de datos (secciones 3-4):")
        print("      pega esta salida completa y te doy el SQL de rescate exacto.")
    cx.close()
    print("═" * 72)


if __name__ == "__main__":
    main()