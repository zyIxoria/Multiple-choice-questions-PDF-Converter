import os
import shutil
from fastapi import FastAPI, UploadFile, File, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List

from backend.database import engine, get_db, Base
from backend.models import Quiz, Question, Answer
from backend.schemas import (
    QuizBriefResponse, QuizFullResponse, QuizSubmitRequest, SubmitResponse,
    QuestionResult, AnswerResponse, UploadResponse
)
from backend.pdf_parser import PDFHighlightParser
from backend.question_extractor import QuestionExtractor

# Initialize database tables on startup
Base.metadata.create_all(bind=engine)

app = FastAPI(title="PDF to Online Quiz Converter API")

# Setup CORS policies so frontend can fetch easily
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "./temp_uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@app.get("/")
def read_root():
    return {"status": "online", "message": "PDF Quiz API is ready"}

@app.post("/upload", response_model=UploadResponse)
def upload_pdf(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """
    Handles PDF uploading, parses textual elements and visual highlights,
    reconstructs question blocks, and inserts them into SQLite.
    """
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file must be a valid PDF format."
        )

    # Save to a temporary file
    temp_path = os.path.join(UPLOAD_DIR, file.filename)
    try:
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # 1. Coordinate parsing via PyMuPDF (fitz)
        parser = PDFHighlightParser(temp_path)
        parsed_lines = parser.parse_text_with_highlights()
        
        # 2. Logic extraction via Regex
        extractor = QuestionExtractor()
        extracted_questions = extractor.extract(parsed_lines)
        
        if not extracted_questions:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Could not detect or extract any valid structured questions from this PDF."
            )

        # 3. Save Quiz and items to SQLite
        quiz_title = os.path.splitext(file.filename)[0].replace("_", " ").title()
        new_quiz = Quiz(title=quiz_title)
        db.add(new_quiz)
        db.commit()
        db.refresh(new_quiz)

        for q_data in extracted_questions:
            new_q = Question(quiz_id=new_quiz.id, content=q_data["question"])
            db.add(new_q)
            db.commit()
            db.refresh(new_q)

            for opt in q_data["options"]:
                # Option format: "A. Option name" or similar. Split or use direct.
                is_correct = False
                # Deduce correct based on single letter
                if opt.startswith(q_data["correct_answer"] + "."):
                    is_correct = True
                elif opt.strip().startswith(q_data["correct_answer"]):
                    is_correct = True
                    
                new_ans = Answer(
                    question_id=new_q.id,
                    content=opt,
                    is_correct=is_correct
                )
                db.add(new_ans)
            db.commit()

        return UploadResponse(
            success=True,
            quiz_id=new_quiz.id,
            title=new_quiz.title,
            total_questions=len(extracted_questions)
        )

    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An error occurred while processing PDF: {str(e)}"
        )
    finally:
        # Cleanup uploaded file
        if os.path.exists(temp_path):
            os.remove(temp_path)

@app.get("/quiz/{quiz_id}", response_model=QuizFullResponse)
def get_quiz_by_id(quiz_id: int, db: Session = Depends(get_db)):
    """
    Retrieves full details of a specific Quiz, including questions and options.
    Correct answers are hidden from standard Quiz responses for exam integrity.
    """
    quiz = db.query(Quiz).filter(Quiz.id == quiz_id).first()
    if not quiz:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Requested quiz not found in records."
        )
    
    # Hide is_correct from being returned to browser during test-taking
    response_quiz = QuizFullResponse.model_validate(quiz)
    for q in response_quiz.questions:
        for a in q.answers:
            a.is_correct = None
            
    return response_quiz

@app.post("/submit/{quiz_id}", response_model=SubmitResponse)
def submit_quiz(quiz_id: int, payload: QuizSubmitRequest, db: Session = Depends(get_db)):
    """
    Submits user answers, cross-references with correct SQLite database records,
    calculates correct/incorrect score percentage, and returns detailed analytics.
    """
    quiz = db.query(Quiz).filter(Quiz.id == quiz_id).first()
    if not quiz:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quiz referenced in submission does not exist."
        )

    correct_count = 0
    incorrect_count = 0
    results_list = []

    # Map choices for efficiency
    user_selections = {sel.question_id: sel.selected_answer_id for sel in payload.selections}

    for question in quiz.questions:
        selected_id = user_selections.get(question.id)
        
        # Find correct answer in base db
        correct_ans = db.query(Answer).filter(
            Answer.question_id == question.id,
            Answer.is_correct == True
        ).first()

        is_correct = False
        if correct_ans and selected_id == correct_ans.id:
            is_correct = True
            correct_count += 1
        else:
            incorrect_count += 1

        answers_mapped = [
            AnswerResponse.model_validate(ans) for ans in question.answers
        ]

        results_list.append(
            QuestionResult(
                question_id=question.id,
                question_content=question.content,
                selected_answer_id=selected_id,
                correct_answer_id=correct_ans.id if correct_ans else 0,
                is_correct=is_correct,
                answers=answers_mapped
            )
        )

    total_q = len(quiz.questions)
    score_percentage = (correct_count / total_q * 100.0) if total_q > 0 else 0.0

    return SubmitResponse(
        quiz_id=quiz.id,
        total_questions=total_q,
        correct_count=correct_count,
        incorrect_count=incorrect_count,
        score_percentage=round(score_percentage, 2),
        results=results_list
    )

@app.get("/result/{quiz_id}", response_model=SubmitResponse)
def get_quiz_results_directly(quiz_id: int, db: Session = Depends(get_db)):
    """
    Simulated results getter - loads the true correct keys directly.
    """
    quiz = db.query(Quiz).filter(Quiz.id == quiz_id).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")

    results_list = []
    correct_count = 0
    
    for question in quiz.questions:
        correct_ans = db.query(Answer).filter(
            Answer.question_id == question.id,
            Answer.is_correct == True
        ).first()
        
        answers_mapped = [
            AnswerResponse.model_validate(ans) for ans in question.answers
        ]
        
        results_list.append(
            QuestionResult(
                question_id=question.id,
                question_content=question.content,
                selected_answer_id=None,
                correct_answer_id=correct_ans.id if correct_ans else 0,
                is_correct=False,
                answers=answers_mapped
            )
        )
        
    return SubmitResponse(
        quiz_id=quiz.id,
        total_questions=len(quiz.questions),
        correct_count=0,
        incorrect_count=len(quiz.questions),
        score_percentage=0.0,
        results=results_list
    )
