import os
from datetime import datetime, timedelta
from fastapi import HTTPException
from jose import jwt

from models.utilisateur import Utilisateur
from schemas.auth import LoginBody, RegisterBody


# ───────── TOKEN ─────────
def create_token(user: Utilisateur):
    expires = os.getenv("JWT_EXPIRES_IN", "8h")

    try:
        hours = int(expires.replace("h", ""))
    except:
        hours = 8

    payload = {
        "id": str(user.id),
        "role": user.role,
        "exp": datetime.utcnow() + timedelta(hours=hours),
    }

    return jwt.encode(
        payload,
        os.getenv("JWT_SECRET", "changeme"),
        algorithm="HS256"
    )


# ───────── SERIALIZE ─────────
def serialize_user(user: Utilisateur):
    return {
        "id": str(user.id),
        "nom": user.nom,
        "email": user.email,
        "role": user.role,
    }


# ───────── LOGIN (FRONT COMPATIBLE) ─────────
async def login(body: LoginBody):

    user = await Utilisateur.find_one(
        Utilisateur.email == body.email.lower()
    )

    if not user:
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")

    if not user.is_actif:
        raise HTTPException(status_code=403, detail="Compte désactivé")

    if not user.check_password(body.password):
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")

    token = create_token(user)

    return {
        "success": True,
        "token": token,
        "user": serialize_user(user)
    }


# ───────── REGISTER ─────────
async def register(body: RegisterBody):

    exist = await Utilisateur.find_one(
        Utilisateur.email == body.email.lower()
    )

    if exist:
        raise HTTPException(status_code=409, detail="Email déjà utilisé")

    user = Utilisateur(
        nom=body.nom,
        email=body.email.lower(),
        mot_de_passe=""
    )

    user.set_password(body.password)
    user.role = body.role

    await user.insert()

    return {
        "success": True,
        "user": serialize_user(user)
    }


# ───────── PROFIL (GARDÉ COMME TU VEUX) ─────────
async def mon_profil(user: Utilisateur):
    return {
        "success": True,
        "user": serialize_user(user)
    }