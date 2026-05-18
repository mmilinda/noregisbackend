from fastapi import APIRouter, Depends
from controllers.auth_controller import login, register, mon_profil, LoginBody, RegisterBody
from middleware.auth import authentifier
from models.utilisateur import Utilisateur

router = APIRouter(tags=["Auth"])


@router.post("/login")
async def route_login(body: LoginBody):
    return await login(body)


@router.post("/register", status_code=201)
async def route_register(body: RegisterBody):
    return await register(body)


@router.get("/profil")
async def route_profil(utilisateur: Utilisateur = Depends(authentifier)):
    return await mon_profil(utilisateur)
