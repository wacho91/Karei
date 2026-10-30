# -*- coding: utf-8 -*-
"""
Kārei · HORA DE BOGOTÁ · E-14t66
================================
La cura para el «hoy» del cuadre cuando el backend viva en Railway (UTC).

El problema: los plugins usan datetime.now() / datetime.utcnow() /
date.today() sin zona horaria. En tu PC el reloj es de Bogotá y todo
cuadra. En Railway el reloj es UTC: a las 7:00 p.m. de Bogotá ya es
«mañana» → las ventas de la noche caerían al día siguiente en el
Informe Z y en el cuadre del día.

Regla de oro:
  · Para DECIDIR de qué día es una venta → Bogotá (este módulo).
  · Los parches van punto por punto sobre cada línea del diagnóstico
    [F], no en bloque: primero ver el material y luego parchar.

Va en:  apps/api/app/core/tiempo_bogota.py  (archivo nuevo, no toca nada)
Import: from app.core.tiempo_bogota import hoy_bogota, rango_dia_bogota
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

BOGOTA = ZoneInfo("America/Bogota")
UTC = timezone.utc


def ahora_bogota() -> datetime:
    """El ahora, con conciencia de zona (Bogotá)."""
    return datetime.now(BOGOTA)


def hoy_bogota() -> date:
    """HOY según el reloj de Bogotá, no según el servidor."""
    return ahora_bogota().date()


def rango_dia_bogota(dia: date | None = None) -> tuple[datetime, datetime]:
    """
    (inicio, fin) del día `dia` en Bogotá, con zona consciente.
    fin es EXCLUSIVO (00:00 del día siguiente) → para filtros:
        WHERE fecha >= :inicio AND fecha < :fin
    Así no se pierde ni una venta de las 11:59 p.m.
    """
    d = dia or hoy_bogota()
    inicio = datetime.combine(d, time.min, tzinfo=BOGOTA)
    fin = inicio + timedelta(days=1)
    return inicio, fin


def rango_dia_bogota_utc(dia: date | None = None) -> tuple[datetime, datetime]:
    """
    El mismo rango del día en Bogotá, pero convertido a UTC naive.
    Útil cuando la base guarda horas en UTC (el típico utcnow()).
    """
    inicio, fin = rango_dia_bogota(dia)
    return (inicio.astimezone(UTC).replace(tzinfo=None),
            fin.astimezone(UTC).replace(tzinfo=None))


def utc_naive_a_bogota(dt: datetime) -> datetime:
    """
    Datetime naive que viene en UTC (ej. un utcnow() guardado)
    → devuelve el mismo instante pero con hora de Bogotá.
    """
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(BOGOTA)


def entre_dia_bogota(cuando: datetime, dia: date | None = None) -> bool:
    """
    ¿`cuando` cae dentro del día `dia` según el reloj de Bogotá?
    Acepta naive-UTC (el típico utcnow() guardado) o consciente de zona.
    """
    if cuando.tzinfo is None:
        cuando = cuando.replace(tzinfo=UTC)
    inicio, fin = rango_dia_bogota(dia)
    return inicio <= cuando < fin