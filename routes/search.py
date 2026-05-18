from typing import Optional
from fastapi import APIRouter, Depends
from controllers.search_controller import rechercher
from middlewares.auth import get_current_user

router = APIRouter(tags=["Recherche"], dependencies=[Depends(get_current_user)])

@router.get("/")
async def route_rechercher(
    query: Optional[str] = None,
    statut: Optional[str] = None,
    date_debut: Optional[str] = None,
    date_fin: Optional[str] = None,
):
    return await rechercher(query, statut, date_debut, date_fin)