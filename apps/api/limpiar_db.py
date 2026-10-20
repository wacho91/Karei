# -*- coding: utf-8 -*-
r"""
============================================================================
Karei · limpiar_db.py (FIX E-14h) — repara las filas que quedaron con
opened_by_id / waiter_id en NULL
============================================================================
POR QUÉ: las rutas VIEJAS del backend (mapa de mesas, cocina) leen el
usuario de la sesión y del pedido. Si el id viene NULL, la ruta vieja
crashea con un 500 SIN cabeceras CORS y el navegador lo muestra como
"bloqueado por CORS" / "Network Error" (mesas que no cargan).

QUÉ HACE:
  1. Busca la base de datos (karei.db o cualquier *.db de la carpeta actual).
  2. Busca un usuario REAL en la DB (para que las relaciones resuelvan).
  3. Rellena table_sessions.opened_by_id y orders.waiter_id que estén NULL.

USO — abre una terminal DENTRO de la carpeta apps/api (donde está karei.db):

    python limpiar_db.py

(o con tu venv:  D:\Prime_TeamIA\venv\Scripts\python.exe limpiar_db.py )

Es SEGURO e idempotente: puedes correrlo las veces que quieras; solo toca
las filas con NULL y no borra nada.
============================================================================
"""
import glob
import os
import sqlite3
import sys


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


def usuario_real(con):
    cur = con.cursor()
    for tabla in ("users", "user", "usuarios", "employees", "staff"):
        try:
            filas = cur.execute(f"SELECT id FROM {tabla} LIMIT 1").fetchall()
            if filas and filas[0][0]:
                return str(filas[0][0])
        except sqlite3.Error:
            continue
    return None


def main():
    db = encontrar_db()
    if not db:
        print("[X] No encontré la base de datos.")
        print("    Ejecuta este script DENTRO de la carpeta apps/api (donde esta karei.db)")
        sys.exit(1)
    print("DB encontrada:", os.path.abspath(db))
    con = sqlite3.connect(db)
    uid = usuario_real(con)
    if not uid:
        print("[X] No hay usuarios en la DB; no puedo rellenar las relaciones.")
        print("    Crea el usuario admin desde la app y vuelve a correr este script.")
        con.close()
        sys.exit(1)
    print("Usuario para relaciones:", uid)

    cur = con.cursor()
    try:
        n1 = cur.execute(
            "SELECT COUNT(*) FROM table_sessions WHERE opened_by_id IS NULL").fetchone()[0]
        n2 = cur.execute(
            "SELECT COUNT(*) FROM orders WHERE waiter_id IS NULL").fetchone()[0]
        if n1:
            cur.execute("UPDATE table_sessions SET opened_by_id=? WHERE opened_by_id IS NULL",
                        (uid,))
        if n2:
            cur.execute("UPDATE orders SET waiter_id=? WHERE waiter_id IS NULL", (uid,))
        con.commit()
        print(f"[OK] table_sessions reparadas: {n1} | orders reparadas: {n2}")
    except sqlite3.Error as e:
        print("Aviso (no fue fatal):", e)
    finally:
        con.close()

    print("")
    print("Listo. Ahora:")
    print("  1. Refresca el POS en el navegador (F5).")
    print("  2. Las mesas deben cargar de nuevo.")
    print("  3. Prueba: clic en una mesa -> agregar productos -> ENVIAR A COCINA.")


if __name__ == "__main__":
    main()
