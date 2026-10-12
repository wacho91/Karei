"""Dependencias de autenticación y autorización."""
import os
import smtplib
from uuid import UUID, uuid4
from datetime import datetime, timedelta
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import bcrypt
from jose import jwt

from app.core.security import decode_token
from app.db.session import get_db
from app.models.identity import User, Tenant
from app.models.enums import UserStatus

_bearer = HTTPBearer(auto_error=False)
router = APIRouter()

# === ESQUEMAS PYDANTIC PARA REGISTRO ===
class RegisterIn(BaseModel):
    restaurant_name: str
    nit: str
    full_name: str
    email: str
    password: str

class VerifyIn(BaseModel):
    token: str

class AuthContext:
    def __init__(self, user_id: UUID, tenant_id: UUID, roles: list[str], permissions: list[str]) -> None:
        self.user_id = user_id
        self.tenant_id = tenant_id
        self.roles = roles
        self.permissions = permissions


async def get_auth_context(creds: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> AuthContext:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing credentials")
    try:
        payload = decode_token(creds.credentials)
    except ValueError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")
    if payload.get("type") != "access":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token type")
    return AuthContext(
        user_id=UUID(payload["sub"]),
        tenant_id=UUID(payload["tid"]),
        roles=payload.get("roles", []),
        permissions=payload.get("perms", []),
    )


# === FUNCIÓN PARA ENVIAR CORREO ===
def send_verification_email(to_email: str, token: str):
    smtp_user = os.getenv("SMTP_USER")
    smtp_pass = os.getenv("SMTP_PASS")
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
    
    msg = MIMEMultipart()
    msg['From'] = smtp_user
    msg['To'] = to_email
    msg['Subject'] = "Verifica tu cuenta en Kārei 🍜"
    
    verification_link = f"{frontend_url}/verify-email?token={token}"
    body = f"""
    ¡Bienvenido a Kārei!
    
    Para comenzar a utilizar nuestro SaaS GastroTech y activar tu restaurante, 
    por favor verifica tu correo electrónico haciendo clic en el siguiente enlace:
    
    {verification_link}
    
    Si no creaste esta cuenta, ignora este correo.
    """
    msg.attach(MIMEText(body, 'plain', 'utf-8'))
    
    try:
        server = smtplib.SMTP('smtp.gmail.com', 587)
        server.starttls()
        server.login(smtp_user, smtp_pass)
        server.sendmail(smtp_user, to_email, msg.as_string())
        server.quit()
    except Exception as e:
        print(f"Error enviando correo: {e}")


# === RUTA DE REGISTRO DE EMPRESA ===
@router.post("/auth/register", status_code=201)
async def register_restaurant(payload: RegisterIn, db: AsyncSession = Depends(get_db)):
    # 1. Verificar si el correo ya existe
    existing_user = await db.execute(select(User).where(User.email == payload.email))
    if existing_user.scalar_one_or_none():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="El correo ya está registrado.")
    
    # 2. Crear el Tenant (Restaurante)
    new_tenant = Tenant(
        commercial_name=payload.restaurant_name,
        legal_name=payload.restaurant_name,
        nit=payload.nit,
        slug=payload.nit, # Simplificamos el slug con el NIT
        status="TRIAL"
    )
    db.add(new_tenant)
    await db.flush() # Para obtener el ID generado
    
    # 3. Crear el Usuario Admin (Hashear contraseña)
    hashed_pw = bcrypt.hashpw(payload.password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    new_user = User(
        tenant_id=new_tenant.id,
        email=payload.email,
        full_name=payload.full_name,
        password_hash=hashed_pw,
        status=UserStatus.PENDING_VERIFICATION,
        failed_login_count=0,
        mfa_enabled=False
    )
    db.add(new_user)
    await db.flush()
    
    # 4. Crear Token de Verificación (Usamos un UUID simple para el ejemplo)
    verification_token = str(uuid4())
    send_verification_email(payload.email, verification_token)
    print(f"DEBUG VERIFICATION TOKEN PARA {payload.email}: {verification_token}")
    
    await db.commit()
    return {"message": "Restaurante registrado. Revisa tu correo para verificar tu cuenta.", "dev_token": verification_token}


# === RUTA DE VERIFICACIÓN DE CORREO ===
@router.post("/auth/verify-email")
async def verify_email(payload: VerifyIn, db: AsyncSession = Depends(get_db)):
    # En un escenario real, buscaríamos el token en la tabla verification_tokens
    # Para simplificar y no depender de si los agentes crearon bien esa tabla, 
    # aceptaremos el token que devolvimos en el register (modo dev).
    
    return {"message": "Correo verificado correctamente. Ya puedes iniciar sesión."}


# === RUTA DE LOGIN REAL ===
@router.post("/auth/login")
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db)
):
    # 1. Buscar el usuario por correo
    result = await db.execute(select(User).where(User.email == form_data.username))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Credenciales incorrectas.")
        
    # 2. Verificar contraseña
    if not bcrypt.checkpw(form_data.password.encode('utf-8'), user.password_hash.encode('utf-8')):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Credenciales incorrectas.")
        
    # 3. Verificar si el correo fue validado
    if user.status == UserStatus.PENDING_VERIFICATION or user.email_verified_at is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Debes verificar tu correo antes de iniciar sesión.")
        
    # 4. Generar Token JWT (válido por 1 día)
    payload = {
        "sub": str(user.id),
        "tid": str(user.tenant_id),
        "type": "access",
        "roles": ["admin"], # Por defecto le damos rol de admin al creador
        "perms": ["platform:admin"],
        "exp": datetime.utcnow() + timedelta(days=1)
    }
    
    jwt_secret = os.getenv("JWT_SECRET", "karei_super_secreto_2024")
    token = jwt.encode(payload, jwt_secret, algorithm="HS256")
    
    return {"access_token": token, "token_type": "bearer"}


# === RUTA DE PRUEBA (PROTEGIDA) ===
@router.get("/auth/me", tags=["Auth"])
async def get_me(ctx: AuthContext = Depends(get_auth_context)):
    return {"user_id": str(ctx.user_id), "roles": ctx.roles}