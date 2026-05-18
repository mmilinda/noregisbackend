from typing import Optional, Literal
from datetime import datetime
from beanie import Document
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

class Utilisateur(Document):
    nom: str
    email: str
    mot_de_passe: Optional[str] = None  # ⚠️ optionnel pour éviter erreur de validation
    role: Literal["AGENT", "ADMIN"] = "AGENT"
    is_actif: bool = True
    created_at: datetime = datetime.utcnow()
    updated_at: datetime = datetime.utcnow()

    class Settings:
        name = "utilisateurs"

    def set_password(self, password: str):
        self.mot_de_passe = pwd_context.hash(password)

    def check_password(self, password: str) -> bool:
        if not self.mot_de_passe:
            return False
        return pwd_context.verify(password, self.mot_de_passe)

    def verifier_mot_de_passe(self, password: str) -> bool:
        return self.check_password(password)