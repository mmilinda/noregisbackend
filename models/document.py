from typing import Optional
from datetime import datetime
from beanie import Document, PydanticObjectId
from pydantic import Field


class DocumentScan(Document):
    visiteur_id: Optional[PydanticObjectId] = None

    nom_fichier: str = Field(..., max_length=255)
    chemin_fichier: str = Field(..., max_length=500)
    type_mime: str = Field(..., max_length=50)

    taille_fichier: int

    est_archive: bool = False

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "documents"