import os
from datetime import datetime, timedelta
from fastapi import HTTPException
from jose import jwt
from models.utilisateur import Utilisateur
from schemas.auth import LoginBody, RegisterBody

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
    return jwt.encode(payload, os.getenv("JWT_SECRET", "changeme"), algorithm="HS256")

def serialize_user(user: Utilisateur):
    return {
        "id": str(user.id),
        "nom": user.nom,
        "email": user.email,
        "role": user.role,
    }

async def login(body: LoginBody):
    print("1. Login reçu pour", body.email)
    user = await Utilisateur.find_one(Utilisateur.email == body.email.lower())
    if not user:
        print("2. Utilisateur inexistant")
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")
    if not user.is_actif:
        print("3. Compte désactivé")
        raise HTTPException(status_code=403, detail="Compte désactivé")
    print("4. Vérification du mot de passe...")
    if not user.check_password(body.password):
        print("5. Mot de passe incorrect")
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")
    print("6. Génération du token")
    token = create_token(user)
    return {"success": True, "token": token, "user": serialize_user(user)}

async def register(body: RegisterBody):
    exist = await Utilisateur.find_one(Utilisateur.email == body.email.lower())
    if exist:
        raise HTTPException(status_code=409, detail="Email déjà utilisé")
    user = Utilisateur(nom=body.nom, email=body.email.lower(), mot_de_passe="")
    user.set_password(body.password)
    user.role = body.role
    await user.insert()
    return {"success": True, "user": serialize_user(user)}

async def mon_profil(user: Utilisateur):
    return {"success": True, "user": serialize_user(user)}