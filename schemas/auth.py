from pydantic import BaseModel, Field
from typing import Optional, Literal


class LoginBody(BaseModel):
    email: str
    # Accepte aussi bien "password" que "mot_de_passe"
    password: str = Field(..., alias="mot_de_passe")

    class Config:
        populate_by_name = True   # permet d'utiliser "password" ou "mot_de_passe" indifféremment


class RegisterBody(BaseModel):
    nom: str
    email: str
    password: str
    role: Literal["AGENT", "ADMIN"] = "AGENT"