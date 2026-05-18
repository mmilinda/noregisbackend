import os
from datetime import datetime, timedelta
from fastapi import HTTPException
from jose import jwt

from models.utilisateur import Utilisateur
from schemas.auth import LoginBody, RegisterBody


# ───────── TOKEN ─────────
def create_token(user: Utilisateur):
    hours = int(os.getenv("JWT_EXPIRES_IN", "8h").replace("h", ""))

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


# ───────── SERIALIZE USER ─────────
def serialize_user(user: Utilisateur):
    return {
        "id": str(user.id),
        "nom": user.nom,
        "email": user.email,
        "role": user.role,
    }


# ───────── LOGIN ─────────
async def login(body: LoginBody):

    user = await Utilisateur.find_one(
        Utilisateur.email == body.email.lower()
    )

    if not user:
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")

    if not user.is_actif:
        raise HTTPException(status_code=403, detail="Compte désactivé")

    # 🔥 CORRECTION ICI
    if not user.verifier_mot_de_passe(body.password):
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
        mot_de_passe=body.password,
        role=body.role
    )

    user.hacher_mot_de_passe()
    await user.insert()

    return {
        "success": True,
        "user": serialize_user(user)
    }


# ───────── PROFILE ─────────
async def me(user: Utilisateur):
    return {
        "success": True,
        "user": serialize_user(user)
    }