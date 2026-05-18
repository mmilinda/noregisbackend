from typing import Optional
from fastapi import APIRouter, Depends
from controllers.visite_controller import (
    enregistrer_entree, enregistrer_sortie, lister_visites, visites_en_cours,
    EntreeBody,
)
from middlewares.auth import get_current_user

router = APIRouter(tags=["Visites"], dependencies=[Depends(get_current_user)])

@router.get("/")
async def route_lister(statut: Optional[str] = None, date: Optional[str] = None, page: int = 1, limit: int = 20):
    return await lister_visites(statut, date, page, limit)

@router.get("/en-cours")
async def route_en_cours():
    return await visites_en_cours()

@router.post("/entree", status_code=201)
async def route_entree(body: EntreeBody):
    return await enregistrer_entree(body)

@router.post("/sortie/{visite_id}")
async def route_sortie(visite_id: str):
    return await enregistrer_sortie(visite_id)