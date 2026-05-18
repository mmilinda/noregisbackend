from typing import Optional, Literal
from datetime import datetime
from beanie import Document, PydanticObjectId
from pydantic import Field


class Visite(Document):
    # ✅ Alias = noms exacts dans MongoDB (venant de Node.js)
    visiteur_id: PydanticObjectId = Field(..., alias="visiteurId")
    personne_visitee: str = Field(..., max_length=150, alias="personneVisitee")
    service: str = Field(..., max_length=100)
    heure_entree: datetime = Field(default_factory=datetime.utcnow, alias="heureEntree")
    heure_sortie: Optional[datetime] = Field(None, alias="heureSortie")
    statut: Literal["EN_COURS", "TERMINE", "ANNULE"] = "EN_COURS"
    motif: Optional[str] = Field(default=None, max_length=255)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "visites"
        populate_by_name = True  # ✅