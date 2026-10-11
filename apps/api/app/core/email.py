"""Envío de emails vía smtplib (síncrono, ejecutado en threadpool)."""
import smtplib
from email.message import EmailMessage

from app.core.config import settings


def _send_sync(to_email: str, subject: str, html_body: str) -> None:
    msg = EmailMessage()
    msg["From"] = f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.set_content("Este correo requiere un cliente compatible con HTML.")
    msg.add_alternative(html_body, subtype="html")

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as server:
        if settings.smtp_use_tls:
            server.starttls()
        if settings.smtp_user:
            server.login(settings.smtp_user, settings.smtp_password)
        server.send_message(msg)


async def send_email(to_email: str, subject: str, html_body: str) -> None:
    import anyio

    await anyio.to_thread.run_sync(_send_sync, to_email, subject, html_body)


def render_verification_email(full_name: str, token: str) -> str:
    link = f"{settings.frontend_url}/verify-email?token={token}"
    return (
        f"<h2>Hola {full_name}</h2>"
        f"<p>Confirma tu cuenta haciendo clic en el siguiente enlace:</p>"
        f'<p><a href="{link}">Verificar mi correo</a></p>'
        f"<p>El enlace expira en {settings.verification_token_hours} horas.</p>"
    )


def render_password_reset_email(full_name: str, token: str) -> str:
    link = f"{settings.frontend_url}/reset-password?token={token}"
    return (
        f"<h2>Hola {full_name}</h2>"
        f"<p>Recibimos una solicitud para restablecer tu contraseña.</p>"
        f'<p><a href="{link}">Restablecer contraseña</a></p>'
        f"<p>El enlace expira en {settings.password_reset_hours} horas.</p>"
    )
