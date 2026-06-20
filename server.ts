import express from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// Set up server-side Gemini client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// JSON parsing middleware
app.use(express.json());

// In-Memory store (backed optionally by local file fallback)
const DATA_FILE = path.join(process.cwd(), "quizzes_db.json");

interface QuizAnswer {
  id: string;
  content: string;
}

interface QuizQuestion {
  id: string;
  content: string;
  answers: QuizAnswer[];
  correctAnswerLetter: string; // "A", "B", etc.
}

interface Quiz {
  id: string;
  title: string;
  createdAt: string;
  questions: QuizQuestion[];
}

function loadQuizzes(): Quiz[] {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, "utf-8");
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error("Error reading db file, fallback.", err);
  }
  return [];
}

function saveQuizzes(quizzes: Quiz[]) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(quizzes, null, 2), "utf-8");
  } catch (err) {
    console.error("Error writing db file.", err);
  }
}

// In-memory array initialized from file
let quizzesStore: Quiz[] = loadQuizzes();

// Multer memory storage for PDF imports
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // Max 15MB
});

// ==================== API ENDPOINTS ====================

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// List all quizzes
app.get("/api/quizzes", (req, res) => {
  const brief_list = quizzesStore.map(q => ({
    id: q.id,
    title: q.title,
    createdAt: q.createdAt,
    total_questions: q.questions.length
  }));
  res.json(brief_list);
});

// PDF Upload & Extraction API
app.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No file was uploaded." });
      return;
    }

    if (!req.file.originalname.toLowerCase().endsWith(".pdf")) {
      res.status(400).json({ error: "Only PDF materials are permitted." });
      return;
    }

    const base64Pdf = req.file.buffer.toString("base64");
    // Decode originalname to absolute standard UTF-8 correct characters in Node
    const unicodeFilename = Buffer.from(req.file.originalname, "binary").toString("utf8");
    const docName = unicodeFilename.replace(/\.[^/.]+$/, "").replace(/_/g, " ");

    const systemPrompt = `You are a professional PDF document parser.
Your absolute objective is to parse this quiz PDF to extract questions.
Key Condition: In this PDF, the correct option for each question is highlighted with a background color (yellow, blue, green, orange, or other color overlays).
Scan the document, locate the background highlights, and determine the exact choice (A, B, C, or D) mapped to that highlighted area.

Return a JSON array of parsed questions, where each question contains:
- question: The full description of the question. Combine wrapping lines and rectify spacing cleanly.
- options: All options/choices detected (normally 4: A, B, C, D). Keep their option prefix (e.g. "A. Option content").
- correct_answer: The letter ("A", "B", "C", "D") that has background highlighting in the PDF. If highlighting is somehow missing, infer the correct answer conceptually.

Proceed carefully with structured JSON output matching the target schema.`;

    // Process PDF directly using the Gemini 3.5 Flash multimodal capability
    const genResponse = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        {
          inlineData: {
            data: base64Pdf,
            mimeType: "application/pdf"
          }
        },
        { text: systemPrompt }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              question: { type: Type.STRING },
              options: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              correct_answer: { type: Type.STRING }
            },
            required: ["question", "options", "correct_answer"]
          }
        }
      }
    });

    const aiOutput = genResponse.text;
    if (!aiOutput) {
      throw new Error("No structure extracted from Gemini parser.");
    }

    const extractedData = JSON.parse(aiOutput.trim());
    if (!Array.isArray(extractedData) || extractedData.length === 0) {
      throw new Error("Extracted quiz structure is empty or invalid format.");
    }

    // Convert into stored structures
    const quizId = "quiz_" + Date.now();
    const formattedQuestions: QuizQuestion[] = extractedData.map((q, idx) => {
      const qId = `q_${idx}_${Date.now()}`;
      
      const answers: QuizAnswer[] = q.options.map((opt: string, optIdx: number) => {
        return {
          id: `ans_${optIdx}_${Date.now()}`,
          content: opt
        };
      });

      return {
        id: qId,
        content: q.question,
        answers: answers,
        correctAnswerLetter: q.correct_answer.toUpperCase().trim()
      };
    });

    const newQuiz: Quiz = {
      id: quizId,
      title: docName.trim(),
      createdAt: new Date().toISOString(),
      questions: formattedQuestions
    };

    quizzesStore.unshift(newQuiz);
    saveQuizzes(quizzesStore);

    res.json({
      success: true,
      quiz_id: newQuiz.id,
      title: newQuiz.title,
      total_questions: newQuiz.questions.length
    });

  } catch (err: any) {
    console.error("Extraction error:", err);
    res.status(500).json({ error: "Failed to extract PDF coordinates. " + (err.message || "") });
  }
});

// Fetch detailed Quiz data (excluding exact matches for options)
app.get("/api/quiz/:id", (req, res) => {
  const quiz = quizzesStore.find(q => q.id === req.params.id);
  if (!quiz) {
    res.status(404).json({ error: "Quiz not found." });
    return;
  }

  // Deep clone to prevent mutating internal structures
  res.json({
    id: quiz.id,
    title: quiz.title,
    createdAt: quiz.createdAt,
    questions: quiz.questions.map(q => ({
      id: q.id,
      content: q.content,
      answers: q.answers // Correct answers are hidden to promote academic testing!
    }))
  });
});

// Submit answers and obtain full visual correct-wrong feedback
app.post("/api/submit/:id", (req, res) => {
  const quiz = quizzesStore.find(q => q.id === req.params.id);
  if (!quiz) {
    res.status(404).json({ error: "Quiz not found." });
    return;
  }

  const { selections } = req.body as { selections: { question_id: string; selected_answer_id: string | null }[] };
  if (!selections) {
    res.status(400).json({ error: "Missing answers/selections." });
    return;
  }

  const results: any[] = [];
  let correct_count = 0;

  const selectionMap = new Map(selections.map(s => [s.question_id, s.selected_answer_id]));

  for (const q of quiz.questions) {
    const selectedId = selectionMap.get(q.id) || null;
    
    // Find matching correct option
    let correctId = "";
    // Match correct answer letter (e.g. "A" or "B") from the list
    const foundCorrect = q.answers.find(ans => {
      const cleanUpper = ans.content.trim().toUpperCase();
      return cleanUpper.startsWith(q.correctAnswerLetter + ".") || cleanUpper.startsWith(q.correctAnswerLetter);
    });

    if (foundCorrect) {
      correctId = foundCorrect.id;
    } else if (q.answers.length > 0) {
      // Fallback in case of custom formats
      correctId = q.answers[0].id;
    }

    const is_correct = selectedId !== null && selectedId === correctId;
    if (is_correct) {
      correct_count++;
    }

    results.push({
      question_id: q.id,
      question_content: q.content,
      selected_answer_id: selectedId,
      correct_answer_id: correctId,
      correct_letter: q.correctAnswerLetter,
      is_correct: is_correct,
      answers: q.answers
    });
  }

  const total = quiz.questions.length;
  const score_percentage = total > 0 ? (correct_count / total) * 100 : 0;

  res.json({
    quiz_id: quiz.id,
    total_questions: total,
    correct_count: correct_count,
    incorrect_count: total - correct_count,
    score_percentage: Math.round(score_percentage * 100) / 100,
    results: results
  });
});


// Dev vs production setup
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port [${PORT}]`);
  });
}

startServer();
