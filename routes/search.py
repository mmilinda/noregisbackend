from typing import Optional
from fastapi import APIRouter, Depends
from controllers.search_controller import rechercher
from middlewares.auth import authentifier

router = APIRouter(tags=["Recherche"], dependencies=[Depends(authentifier)])


@router.get("/")
async def route_rechercher(
    query: Optional[str] = None,
    statut: Optional[str] = None,
    date_debut: Optional[str] = None,
    date_fin: Optional[str] = None,
):
    return await rechercher(query, statut, date_debut, date_fin)
