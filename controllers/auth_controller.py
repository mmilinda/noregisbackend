import os
from datetime import datetime, timedelta
from fastapi import HTTPException
from jose import jwt
from pydantic import BaseModel
from models.utilisateur import Utilisateur


# ── Schémas de requête ────────────────────────────────────────────────────────

class LoginBody(BaseModel):
    email: str
    mot_de_passe: str


class RegisterBody(BaseModel):
    nom: str
    email: str
    mot_de_passe: str
    role: str = "AGENT"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _creer_token(user: Utilisateur) -> str:
    expires_str = os.getenv("JWT_EXPIRES_IN", "8h")
    hours = int(expires_str.replace("h", "")) if "h" in expires_str else 8
    payload = {
        "id":   str(user.id),
        "role": user.role,
        "exp":  datetime.utcnow() + timedelta(hours=hours),
    }
    return jwt.encode(payload, os.getenv("JWT_SECRET", "changeme"), algorithm="HS256")


def _user_public(user: Utilisateur) -> dict:
    return {"id": str(user.id), "nom": user.nom, "email": user.email, "role": user.role}


# ── Handlers ──────────────────────────────────────────────────────────────────

async def login(body: LoginBody):
    if not body.email or not body.mot_de_passe:
        raise HTTPException(status_code=400, detail="Email et mot de passe requis.")

    utilisateur = await Utilisateur.find_one(Utilisateur.email == body.email.lower())
    if not utilisateur:
        raise HTTPException(status_code=401, detail="Identifiants incorrects.")
    if not utilisateur.is_actif:
        raise HTTPException(status_code=403, detail="Compte désactivé.")
    if not utilisateur.verifier_mot_de_passe(body.mot_de_passe):
        raise HTTPException(status_code=401, detail="Identifiants incorrects.")

    token = _creer_token(utilisateur)
    return {
        "success": True,
        "message": "Connexion réussie.",
        "token": token,
        "utilisateur": _user_public(utilisateur),
    }


async def register(body: RegisterBody):
    if not body.nom or not body.email or not body.mot_de_passe:
        raise HTTPException(status_code=400, detail="Nom, email et mot de passe requis.")

    existe = await Utilisateur.find_one(Utilisateur.email == body.email.lower())
    if existe:
        raise HTTPException(status_code=409, detail="Email déjà utilisé.")

    utilisateur = Utilisateur(
        nom=body.nom,
        email=body.email.lower(),
        mot_de_passe=body.mot_de_passe,
        role=body.role,
    )
    utilisateur.hacher_mot_de_passe()
    await utilisateur.insert()

    return {
        "success": True,
        "message": "Compte créé avec succès.",
        "utilisateur": _user_public(utilisateur),
    }


async def mon_profil(utilisateur: Utilisateur):
    return {"success": True, "utilisateur": _user_public(utilisateur)}
