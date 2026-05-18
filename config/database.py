import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from dotenv import load_dotenv

load_dotenv()


async def connect_db():
    from models.visiteur import Visiteur
    from models.utilisateur import Utilisateur
    from models.visite import Visite
    from models.document import DocumentScan

    mongodb_uri = os.getenv("MONGODB_URI")
    if not mongodb_uri:
        raise Exception("MONGODB_URI n'est pas définie dans les variables d'environnement")

    client = AsyncIOMotorClient(mongodb_uri)
    client.get_io_loop = asyncio.get_event_loop

    db_name = os.getenv("DB_NAME", "registre_visiteurs")
    db = client[db_name]

    await init_beanie(
        database=db,
        document_models=[Visiteur, Utilisateur, Visite, DocumentScan],
    )

    print("✅ MongoDB connectée avec Beanie")