import os
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from bson import ObjectId
from models.utilisateur import Utilisateur

bearer_scheme = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> Utilisateur:
    token = credentials.credentials

    try:
        payload = jwt.decode(
            token,
            os.getenv("JWT_SECRET"),
            algorithms=["HS256"],
        )
        user_id = payload.get("id")
        if not user_id:
            raise HTTPException(status_code=401, detail="Token invalide.")
    except JWTError:
        raise HTTPException(status_code=401, detail="Token invalide ou expiré.")

    try:
        utilisateur = await Utilisateur.get(ObjectId(user_id))
    except Exception:
        raise HTTPException(status_code=401, detail="ID utilisateur invalide.")

    if not utilisateur or not utilisateur.is_actif:
        raise HTTPException(status_code=401, detail="Compte introuvable ou désactivé.")

    return utilisateur


def est_admin(utilisateur: Utilisateur = Depends(get_current_user)) -> Utilisateur:
    if utilisateur.role != "ADMIN":
        raise HTTPException(status_code=403, detail="Accès refusé.")
    return utilisateur