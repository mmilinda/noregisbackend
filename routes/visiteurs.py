from fastapi import APIRouter, Depends
from controllers.visiteur_controller import (
    creer_visiteur, lister_visiteurs, get_visiteur, modifier_visiteur,
    VisiteurBody, VisiteurUpdate,
)
from middlewares.auth import get_current_user

router = APIRouter(tags=["Visiteurs"], dependencies=[Depends(get_current_user)])

@router.get("/")
async def route_lister(page: int = 1, limit: int = 20):
    return await lister_visiteurs(page, limit)

@router.post("/", status_code=201)
async def route_creer(body: VisiteurBody):
    return await creer_visiteur(body)

@router.get("/{visiteur_id}")
async def route_get(visiteur_id: str):
    return await get_visiteur(visiteur_id)

@router.put("/{visiteur_id}")
async def route_modifier(visiteur_id: str, body: VisiteurUpdate):
    return await modifier_visiteur(visiteur_id, body)