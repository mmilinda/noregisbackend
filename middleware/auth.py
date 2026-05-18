import os
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from models.utilisateur import Utilisateur

bearer_scheme = HTTPBearer()


async def authentifier(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> Utilisateur:
    token = credentials.credentials
    try:
        payload = jwt.decode(
            token,
            os.getenv("JWT_SECRET", "changeme"),
            algorithms=["HS256"],
        )
        user_id: str = payload.get("id")
        if not user_id:
            raise HTTPException(status_code=401, detail="Token invalide.")
    except JWTError:
        raise HTTPException(status_code=401, detail="Token invalide ou expiré.")

    utilisateur = await Utilisateur.get(user_id)
    if not utilisateur or not utilisateur.is_actif:
        raise HTTPException(status_code=401, detail="Compte introuvable ou désactivé.")

    return utilisateur


def est_admin(utilisateur: Utilisateur = Depends(authentifier)) -> Utilisateur:
    if utilisateur.role != "ADMIN":
        raise HTTPException(status_code=403, detail="Accès refusé.")
    return utilisateur
