"""Chat routes."""

from __future__ import annotations

import logging
import os
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.deps import DbSession, get_bot_or_404, get_db
from app.models import Bot, Conversation, Message
from app.services.chat import (
    build_prompt,
    generate_answer,
    get_recent_messages,
    _looks_like_refusal,
    should_prompt_for_email,
    classify_intent,
    get_conversational_response,
    is_nonsense_input,
)
from app.services.retrieval import (
    RetrievalObservations,
    retrieve,
)

router = APIRouter(prefix="/bots/{bot_id}/chat", tags=["chat"])

logger = logging.getLogger(__name__)


class ChatRequest(BaseModel):
    message: str
    conversation_id: str | None = None


class SourceChunk(BaseModel):
    document_filename: str
    chunk_content: str
    similarity_score: float


class RetrievalDebugInfo(BaseModel):
    query: str
    query_rewritten: bool
    hybrid_enabled: bool
    vector_candidates: int
    keyword_candidates: int
    combined_candidates: int
    final_chunks: int
    relevance_scores: List[float]
    duration_ms: float
    refusal: bool
    refusal_reason: str
    degraded: bool = False
    degraded_reason: str = ""


class ChatResponse(BaseModel):
    conversation_id: str
    message_id: str
    answer: str
    sources: list[SourceChunk]
    prompt_for_email: bool = False
    retrieval_details: Optional[RetrievalDebugInfo] = None


@router.post("", response_model=ChatResponse)
def chat(
    bot_id: str,
    request: ChatRequest,
    db: DbSession,
    x_debug_retrieval: Optional[str] = Header(default=None, convert_underscores=False),
):
    bot = get_bot_or_404(bot_id, db)

    # Get or create conversation
    conversation_id = request.conversation_id
    if conversation_id:
        try:
            conv_uuid = uuid.UUID(conversation_id)
        except (ValueError, TypeError):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid conversation_id",
            )
        conversation = db.get(Conversation, conv_uuid)
        if not conversation or conversation.bot_id != bot.id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Conversation not found",
            )
    else:
        conversation = Conversation(bot_id=bot.id)
        db.add(conversation)
        db.commit()
        db.refresh(conversation)
        conversation_id = str(conversation.id)

    # Save user message
    user_message = Message(
        conversation_id=conversation.id,
        role="user",
        content=request.message,
    )
    db.add(user_message)
    db.commit()
    db.refresh(user_message)

    # Fetch recent conversation messages for query rewriting / context,
    # excluding the message just saved (the current question) so rewriting
    # only considers *previous* turns and first questions skip the rewrite.
    recent_messages = get_recent_messages(
        conversation.id,
        db,
        exclude_message_id=user_message.id,
    )
    conversation_message_dicts = [
        {"role": m["role"], "content": m["content"]}
        for m in recent_messages
    ]

    # ------------------------------------------------------------------
    # Intent classification — bypass RAG for basic conversational / nonsense
    # ------------------------------------------------------------------
    is_conv, conv_category = classify_intent(request.message)
    is_nonsense = is_nonsense_input(request.message)

    if is_nonsense:
        answer_text = (
            "I'm not sure I understood that. Could you please rephrase your question?"
        )
        sources: List[SourceChunk] = []
        prompt_for_email = False
    elif is_conv:
        answer_text = get_conversational_response(conv_category, bot.name)
        sources = []
        prompt_for_email = False
    else:
        # Run retrieval pipeline for business questions.
        try:
            context = retrieve(
                bot.id,
                request.message,
                conversation_messages=conversation_message_dicts,
            )
        except Exception as exc:
            logger.exception("Retrieval failed for bot %s", bot_id)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="DeskMind is temporarily unable to retrieve information. Please try again.",
            ) from exc

        observations: RetrievalObservations = context.observations

        # Decide whether to call the LLM.
        if observations.refusal or not context.chunks:
            if observations.degraded:
                # Retrieval could not run properly (e.g. the embedding provider is
                # rate-limited). Say so honestly instead of claiming the knowledge
                # base lacks the answer — the user should retry, not give up.
                answer_text = (
                    "I couldn't search my knowledge base just now because the "
                    "retrieval service is temporarily rate-limited. "
                    "Please try again in a minute."
                )
            else:
                answer_text = "I don't know based on the available knowledge."
            sources = []
            prompt_for_email = False
        else:
            prompt = build_prompt(request.message, context.chunks)
            try:
                answer_text = generate_answer(prompt)
            except Exception as exc:
                logger.exception("Generation failed for bot %s", bot_id)
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="DeskMind is temporarily unable to generate a response. Please try again.",
                ) from exc

            # If the model hedges or refuses, treat it as an unsupported answer.
            if _looks_like_refusal(answer_text):
                sources = []
                prompt_for_email = False
            else:
                sources = [
                    SourceChunk(
                        document_filename=doc.filename,
                        chunk_content=chunk.content,
                        similarity_score=round(score, 4),
                    )
                    for chunk, doc, score in context.chunks
                ]
                prompt_for_email = should_prompt_for_email(
                    question=request.message,
                    has_relevant_chunks=len(sources) > 0,
                )

    # Save assistant message
    assistant_message = Message(
        conversation_id=conversation.id,
        role="assistant",
        content=answer_text,
    )
    db.add(assistant_message)
    db.commit()
    db.refresh(assistant_message)

    # Build optional debug payload for authenticated dashboard callers.
    debug_info = None
    if x_debug_retrieval is not None:
        debug_info = RetrievalDebugInfo(
            query=observations.retrieval_query,
            query_rewritten=observations.query_rewritten,
            hybrid_enabled=observations.hybrid_enabled,
            vector_candidates=observations.vector_candidates,
            keyword_candidates=observations.keyword_candidates,
            combined_candidates=observations.combined_candidates,
            final_chunks=observations.final_chunk_count,
            relevance_scores=observations.relevance_scores,
            duration_ms=round(observations.duration_ms, 1),
            refusal=observations.refusal,
            refusal_reason=observations.refusal_reason,
            degraded=observations.degraded,
            degraded_reason=observations.degraded_reason,
        )

    return ChatResponse(
        conversation_id=str(conversation.id),
        message_id=str(assistant_message.id),
        answer=answer_text,
        sources=sources,
        prompt_for_email=prompt_for_email,
        retrieval_details=debug_info,
    )
