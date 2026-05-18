from typing import Optional, Literal
from datetime import datetime
from beanie import Document
from pydantic import Field


class Visiteur(Document):
    nom: str = Field(..., max_length=100)
    prenom: str = Field(..., max_length=100)

    # ✅ Alias = noms exacts dans MongoDB (venant de Node.js)
    date_naissance: Optional[datetime] = Field(None, alias="dateNaissance")
    numero_piece: str = Field(..., max_length=100, alias="numeroPiece")
    type_piece: Literal["CNI", "PASSEPORT", "PERMIS", "CARTE_SEJOUR"] = Field("CNI", alias="typePiece")

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "visiteurs"
        populate_by_name = True  # ✅