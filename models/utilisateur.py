from typing import Literal, Optional
from datetime import datetime
from beanie import Document
from pydantic import Field
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class Utilisateur(Document):
    nom: str
    email: str

    # ✅ "motDePasse" = nom exact du champ dans MongoDB (Node.js)
    mot_de_passe: Optional[str] = Field(None, alias="motDePasse")

    role: Literal["AGENT", "ADMIN"] = "AGENT"

    # ✅ "isActif" = nom exact du champ dans MongoDB (Node.js)
    is_actif: bool = Field(True, alias="isActif")

    # ✅ default_factory pour avoir une date fraîche à chaque création
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "utilisateurs"
        populate_by_name = True  # ✅ obligatoire avec les alias

    def set_password(self, password: str):
        self.mot_de_passe = pwd_context.hash(password)

    def check_password(self, password: str) -> bool:
        if not self.mot_de_passe:
            return False
        return pwd_context.verify(password, self.mot_de_passe)

    def verifier_mot_de_passe(self, password: str) -> bool:
        return self.check_password(password)