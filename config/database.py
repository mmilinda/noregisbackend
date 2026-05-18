import os
import motor.motor_asyncio
from beanie import init_beanie
from dotenv import load_dotenv

load_dotenv()


async def connect_db():
    from models.visiteur import Visiteur
    from models.utilisateur import Utilisateur
    from models.visite import Visite
    from models.document import DocumentScan

    client = motor.motor_asyncio.AsyncIOMotorClient(os.getenv("MONGODB_URI"))
    db = client.get_default_database()

    await init_beanie(
        database=db,
        document_models=[Visiteur, Utilisateur, Visite, DocumentScan],
    )

    # Événements de connexion
    client.get_io_loop = None  # supprime avertissement
    print("✅ MongoDB Atlas connectée")
