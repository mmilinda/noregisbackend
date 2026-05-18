from pydantic import BaseModel, Field
from typing import Literal

class LoginBody(BaseModel):
    email: str
    password: str = Field(..., alias="motDePasse")  # accepte le camelCase du front

    class Config:
        populate_by_name = True

class RegisterBody(BaseModel):
    nom: str
    email: str
    password: str
    role: Literal["AGENT", "ADMIN"] = "AGENT"