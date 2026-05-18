from typing import Optional
from datetime import datetime
from beanie import Document, PydanticObjectId
from pydantic import Field


class DocumentScan(Document):
    # ✅ Alias = noms exacts dans MongoDB (venant de Node.js)
    visiteur_id: Optional[PydanticObjectId] = Field(None, alias="visiteurId")
    nom_fichier: str = Field(..., max_length=255, alias="nomFichier")
    chemin_fichier: str = Field(..., max_length=500, alias="cheminFichier")
    type_mime: str = Field(..., max_length=50, alias="typeMime")
    taille_fichier: int = Field(..., alias="tailleFichier")
    est_archive: bool = Field(False, alias="estArchive")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "documents"
        populate_by_name = True  # ✅