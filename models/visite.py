from typing import Optional, Literal
from datetime import datetime
from beanie import Document, PydanticObjectId
from pydantic import Field

class Visite(Document):
    visiteur_id: Optional[PydanticObjectId] = None
    personne_visitee: Optional[str] = None
    service: str = Field(..., max_length=100)
    heure_entree: datetime = Field(default_factory=datetime.utcnow)
    heure_sortie: Optional[datetime] = None
    statut: Literal["EN_COURS", "TERMINE", "ANNULE"] = "EN_COURS"
    motif: Optional[str] = Field(default=None, max_length=255)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "visites"