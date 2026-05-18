from pydantic import BaseModel, Field
from typing import Literal


class LoginBody(BaseModel):
    email: str
    # ✅ accepte "motDePasse" depuis le frontend (Node.js convention)
    password: str = Field(..., alias="motDePasse")

    class Config:
        populate_by_name = True


class RegisterBody(BaseModel):
    nom: str
    email: str
    password: str
    role: Literal["AGENT", "ADMIN"] = "AGENT"