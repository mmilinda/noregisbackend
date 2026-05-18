from pydantic import BaseModel
from typing import Optional, Literal


class LoginBody(BaseModel):
    email: str
    password: str


class RegisterBody(BaseModel):
    nom: str
    email: str
    password: str
    role: Literal["AGENT", "ADMIN"] = "AGENT"