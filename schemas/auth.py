from pydantic import BaseModel, Field
from typing import Literal

class LoginBody(BaseModel):
    email: str
    password: str = Field(..., alias="motDePasse")  # alias pour accepter "motDePasse"

    class Config:
        populate_by_name = True  # permet d'utiliser aussi "password" si besoin

class RegisterBody(BaseModel):
    nom: str
    email: str
    password: str
    role: Literal["AGENT", "ADMIN"] = "AGENT"