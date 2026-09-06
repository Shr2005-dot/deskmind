"""Check existing data in the database."""
import os
from dotenv import load_dotenv
load_dotenv(".env")

from sqlalchemy import create_engine, text

engine = create_engine(os.getenv("DATABASE_URL"))
with engine.connect() as c:
    print("=== Users ===")
    rows = c.execute(text("select id, email, created_at from public.users order by created_at desc limit 10")).fetchall()
    for r in rows:
        print(r)
    
    print("\n=== Bots ===")
    rows = c.execute(text("select id, user_id, name, created_at from public.bots order by created_at desc limit 10")).fetchall()
    for r in rows:
        print(r)
    
    print("\n=== Documents ===")
    rows = c.execute(text("select id, bot_id, filename, uploaded_at, source_url, title, fetched_at from public.documents order by uploaded_at desc limit 10")).fetchall()
    for r in rows:
        print(r)
    
    print("\n=== Leads ===")
    rows = c.execute(text("select id, bot_id, email, question, status, created_at from public.leads order by created_at desc limit 10")).fetchall()
    for r in rows:
        print(r)
    
    print("\n=== Conversations ===")
    rows = c.execute(text("select id, bot_id, created_at from public.conversations order by created_at desc limit 5")).fetchall()
    for r in rows:
        print(r)
    
    print("\n=== Messages ===")
    rows = c.execute(text("select id, conversation_id, role, content, created_at from public.messages order by created_at desc limit 5")).fetchall()
    for r in rows:
        print(r)
