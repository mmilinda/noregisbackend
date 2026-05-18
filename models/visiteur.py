from typing import Optional, Literal
from datetime import datetime
from beanie import Document
from pydantic import Field


class Visiteur(Document):
    nom: str = Field(..., max_length=100)
    prenom: str = Field(..., max_length=100)
    date_naissance: Optional[datetime] = None
    numero_piece: str = Field(..., max_length=100)
    type_piece: Literal["CNI", "PASSEPORT", "PERMIS", "CARTE_SEJOUR"] = "CNI"
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "visiteurs"
        indexes = [
            [("numero_piece", 1)],  # unique géré manuellement
        ]
