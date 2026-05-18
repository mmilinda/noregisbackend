from fastapi import APIRouter, Depends
from controllers.auth_controller import login, register, mon_profil
from schemas.auth import LoginBody, RegisterBody

from middlewares.auth import get_current_user

router = APIRouter()


# ───────── LOGIN ─────────
@router.post("/login")
async def login_route(body: LoginBody):
    return await login(body)


# ───────── REGISTER ─────────
@router.post("/register")
async def register_route(body: RegisterBody):
    return await register(body)


# ───────── PROFILE (MON PROFIL) ─────────
@router.get("/me")
async def me_route(user=Depends(get_current_user)):
    return await mon_profil(user)