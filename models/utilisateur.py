from typing import Literal
from datetime import datetime
from beanie import Document
from pydantic import Field
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class Utilisateur(Document):
    nom: str = Field(..., max_length=100)
    email: str = Field(..., max_length=150)
    mot_de_passe: str
    role: Literal["AGENT", "ADMIN"] = "AGENT"
    is_actif: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "utilisateurs"

    def hacher_mot_de_passe(self) -> None:
        """Hash le mot de passe en place."""
        self.mot_de_passe = pwd_context.hash(self.mot_de_passe)

    def verifier_mot_de_passe(self, mot_de_passe: str) -> bool:
        """Compare un mot de passe clair avec le hash stocké."""
        return pwd_context.verify(mot_de_passe, self.mot_de_passe)
