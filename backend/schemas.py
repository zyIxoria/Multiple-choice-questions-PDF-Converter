from pydantic import BaseModel, ConfigDict
from typing import List, Optional
from datetime import datetime

# ==================== Answer Schemas ====================
class AnswerCreate(BaseModel):
    content: str
    is_correct: bool = False

class AnswerResponse(BaseModel):
    id: int
    question_id: int
    content: str
    is_correct: Optional[bool] = None  # None hidden from client during active test

    model_config = ConfigDict(from_attributes=True)

# ==================== Question Schemas ====================
class QuestionCreate(BaseModel):
    content: str
    answers: List[AnswerCreate]

class QuestionResponse(BaseModel):
    id: int
    quiz_id: int
    content: str
    answers: List[AnswerResponse]

    model_config = ConfigDict(from_attributes=True)

# ==================== Quiz Schemas ====================
class QuizCreate(BaseModel):
    title: str

class QuizBriefResponse(BaseModel):
    id: int
    title: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class QuizFullResponse(BaseModel):
    id: int
    title: str
    created_at: datetime
    questions: List[QuestionResponse]

    model_config = ConfigDict(from_attributes=True)

# ==================== Upload & Submission Schemas ====================
class UploadResponse(BaseModel):
    success: bool
    quiz_id: int
    title: str
    total_questions: int

class UserSelection(BaseModel):
    question_id: int
    selected_answer_id: Optional[int] = None

class QuizSubmitRequest(BaseModel):
    selections: List[UserSelection]

class QuestionResult(BaseModel):
    question_id: int
    question_content: str
    selected_answer_id: Optional[int]
    correct_answer_id: int
    is_correct: bool
    answers: List[AnswerResponse]  # Contains full fields with is_correct

class SubmitResponse(BaseModel):
    quiz_id: int
    total_questions: int
    correct_count: int
    incorrect_count: int
    score_percentage: float
    results: List[QuestionResult]
