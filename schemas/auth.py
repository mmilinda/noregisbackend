from pydantic import BaseModel
from typing import Literal

class LoginBody(BaseModel):
    email: str
    password: str  # ✅ Plus simple, l'alias 'mot_de_passe' est supprimé

class RegisterBody(BaseModel):
    nom: str
    email: str
    password: str
    role: Literal["AGENT", "ADMIN"] = "AGENT"