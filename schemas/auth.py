from pydantic import BaseModel


class LoginBody(BaseModel):
    email: str
    password: str   # IMPORTANT côté frontend


class RegisterBody(BaseModel):
    nom: str
    email: str
    password: str
    role: str = "AGENT"