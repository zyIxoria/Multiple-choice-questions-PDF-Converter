import React, { useState, useEffect, useRef } from "react";
import { 
  FileText, 
  Upload, 
  CheckCircle2, 
  XOctagon, 
  ChevronLeft, 
  ChevronRight, 
  Play, 
  RefreshCw, 
  Clock, 
  Grid, 
  Home, 
  BookOpen, 
  Check, 
  X, 
  AlertCircle,
  HelpCircle
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// ==================== Interfaces ====================

interface QuizBrief {
  id: string;
  title: string;
  createdAt: string;
  total_questions: number;
}

interface Answer {
  id: string;
  content: string;
}

interface Question {
  id: string;
  content: string;
  answers: Answer[];
}

interface QuizFull {
  id: string;
  title: string;
  createdAt: string;
  questions: Question[];
}

interface Selection {
  question_id: string;
  selected_answer_id: string | null;
}

interface QuestionResult {
  question_id: string;
  question_content: string;
  selected_answer_id: string | null;
  correct_answer_id: string;
  correct_letter: string;
  is_correct: boolean;
  answers: Answer[];
}

interface SubmitResponse {
  quiz_id: string;
  total_questions: number;
  correct_count: number;
  incorrect_count: number;
  score_percentage: number;
  results: QuestionResult[];
}

type AppScreen = "HOME" | "ACTIVE_TEST" | "RESULT";

export default function App() {
  const [screen, setScreen] = useState<AppScreen>("HOME");
  const [quizzes, setQuizzes] = useState<QuizBrief[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  // Custom alert & confirm states for smooth iframe execution
  const [confirmModal, setConfirmModal] = useState<{
    visible: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
  } | null>(null);

  const [alertModal, setAlertModal] = useState<{
    visible: boolean;
    title: string;
    description: string;
  } | null>(null);
  
  // Active exam states
  const [activeQuizId, setActiveQuizId] = useState<string | null>(null);
  const [quizDetails, setQuizDetails] = useState<QuizFull | null>(null);
  const [selections, setSelections] = useState<Selection[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [testTime, setTestTime] = useState(0); // in seconds
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Uploading states
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [uploadProgressMsg, setUploadProgressMsg] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Submission / results states
  const [submitting, setSubmitting] = useState(false);
  const [examResult, setExamResult] = useState<SubmitResponse | null>(null);

  // Load available quizzes
  const fetchQuizzesList = async () => {
    setLoadingList(true);
    try {
      const res = await fetch("/api/quizzes");
      if (res.ok) {
        const data = await res.json();
        setQuizzes(data);
      }
    } catch (err) {
      console.error("Error loading quizzes:", err);
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    fetchQuizzesList();
  }, []);

  // Timer logic for exam
  useEffect(() => {
    if (screen === "ACTIVE_TEST") {
      timerRef.current = setInterval(() => {
        setTestTime(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [screen]);

  // Handle Drag events
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processUploadedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processUploadedFile(e.target.files[0]);
    }
  };

  // Convert PDF and process
  const processUploadedFile = async (file: File) => {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setUploadError("Hệ thống chỉ chấp nhận file định dạng PDF.");
      return;
    }

    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);
    setUploadProgressMsg("Đang tải file lên máy chủ...");

    // Cycling messages to simulate state progress to the user elegantly
    const progressNotes = [
      "Đang upload PDF lên backend...",
      "Phân tích lớp toạ độ của tài liệu...",
      "Sử dụng Gemini AI định vị các khối văn bản...",
      "Trích xuất các ô màu Highlight (đáp án đúng)...",
      "Xử lý lỗi xuống dòng, dọn dẹp ký tự thừa...",
      "Sắp xếp câu hỏi và lập chỉ mục cơ sở dữ liệu...",
    ];

    let noteIdx = 0;
    const interval = setInterval(() => {
      if (noteIdx < progressNotes.length - 1) {
        noteIdx++;
        setUploadProgressMsg(progressNotes[noteIdx]);
      }
    }, 4500);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      clearInterval(interval);

      if (!res.ok) {
        const errObj = await res.json();
        throw new Error(errObj.error || "Gặp sự cố khi phân tích PDF.");
      }

      const result = await res.json();
      setUploadSuccess(`Đã chuyển đổi thành công! Nhận diện được ${result.total_questions} câu hỏi từ tài liệu "${result.title}".`);
      fetchQuizzesList();
    } catch (err: any) {
      clearInterval(interval);
      setUploadError(err.message || "Không thể xử lý file PDF này.");
    } finally {
      setUploading(false);
    }
  };

  // Start a Quiz
  const startQuiz = async (quizId: string) => {
    try {
      const res = await fetch(`/api/quiz/${quizId}`);
      if (!res.ok) {
        setAlertModal({
          visible: true,
          title: "Thông báo lỗi",
          description: "Không thể tải thông tin bài thi này từ hệ thống."
        });
        return;
      }
      const data: QuizFull = await res.json();
      setQuizDetails(data);
      setActiveQuizId(quizId);
      
      // Initialize layout selections
      const initialSels = data.questions.map(q => ({
        question_id: q.id,
        selected_answer_id: null
      }));
      setSelections(initialSels);
      setCurrentQuestionIndex(0);
      setTestTime(0);
      setScreen("ACTIVE_TEST");
    } catch (err) {
      console.error(err);
      setAlertModal({
        visible: true,
        title: "Thông báo lỗi",
        description: "Đã xảy ra lỗi hệ thống khi khởi chạy bài thi."
      });
    }
  };

  // Select Option
  const handleSelectOption = (questionId: string, answerId: string) => {
    setSelections(prev => 
      prev.map(s => s.question_id === questionId ? { ...s, selected_answer_id: answerId } : s)
    );
  };

  // Submit test
  const executeSubmission = async () => {
    if (!activeQuizId) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/submit/${activeQuizId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selections })
      });

      if (!res.ok) {
        throw new Error("Không thể chấm điểm bài thi.");
      }

      const data: SubmitResponse = await res.json();
      setExamResult(data);
      setScreen("RESULT");
    } catch (err: any) {
      setAlertModal({
        visible: true,
        title: "Thông báo lỗi",
        description: err.message || "Gặp lỗi trong quá trình nộp bài."
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitExam = () => {
    if (!activeQuizId) return;
    
    // Check if there are unanswered questions
    const unansweredCount = selections.filter(s => s.selected_answer_id === null).length;
    
    let description = "Bạn có chắc chắn muốn nộp câu trả lời và chấm điểm bài ôn luyện này không?";
    if (unansweredCount > 0) {
      description = `Bạn vẫn còn ${unansweredCount} câu hỏi chưa hoàn thành. Bạn có chắc chắn muốn nộp bài thi ngay không?`;
    }

    setConfirmModal({
      visible: true,
      title: "Xác nhận nộp bài thi",
      description: description,
      onConfirm: () => {
        setConfirmModal(null);
        executeSubmission();
      }
    });
  };

  // Helper formatting for time
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-800" id="app_root">
      {/* HEADER BAR */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200" id="sys_header">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div 
            className="flex items-center space-x-3 cursor-pointer" 
            onClick={() => {
              if (screen === "ACTIVE_TEST") {
                setConfirmModal({
                  visible: true,
                  title: "Quay về trang chủ?",
                  description: "Tiến trình làm bài thi trắc nghiệm hiện tại của bạn sẽ bị hủy bỏ hoàn toàn.",
                  onConfirm: () => {
                    setConfirmModal(null);
                    setScreen("HOME");
                  }
                });
              } else {
                setScreen("HOME");
              }
            }} 
            id="brand_title_container"
          >
            <span className="p-2 bg-indigo-600 rounded-lg text-white scale-100 hover:scale-105 transition-transform">
              <FileText className="w-5 h-5" />
            </span>
            <div>
              <h1 className="font-display font-bold text-lg tracking-tight bg-gradient-to-r from-indigo-700 to-indigo-500 bg-clip-text text-transparent">
                PDF Highlighting Quizzer
              </h1>
              <p className="text-[10px] text-slate-500 font-mono tracking-wide uppercase">
                Interactive Exam Engine AI
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {screen !== "HOME" && (
              <button
                onClick={() => {
                  if (screen === "RESULT") {
                    setScreen("HOME");
                  } else {
                    setConfirmModal({
                      visible: true,
                      title: "Quay về trang chủ?",
                      description: "Tiến trình làm bài thi trắc nghiệm hiện tại của bạn sẽ bị hủy bỏ hoàn toàn.",
                      onConfirm: () => {
                        setConfirmModal(null);
                        setScreen("HOME");
                      }
                    });
                  }
                }}
                className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 bg-white hover:bg-slate-50 hover:text-slate-900 transition-colors"
                id="btn_back_home"
              >
                <Home className="w-3.5 h-3.5" />
                <span>Trang chủ</span>
              </button>
            )}

            <div className="hidden sm:flex items-center space-x-1 text-xs text-slate-400 font-mono">
              <span>Status:</span>
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-emerald-600 font-medium font-sans">Active</span>
            </div>
          </div>
        </div>
      </header>

      {/* CORE FRAMEWORK STAGE */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        <AnimatePresence mode="wait">
          
          {/* SCREEN 1: HOME & UPLOAD VIEW */}
          {screen === "HOME" && (
            <motion.div
              key="home_screen"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.3 }}
              className="space-y-8"
              id="home_view"
            >
              {/* HERO CAPTION */}
              <div className="text-center max-w-3xl mx-auto space-y-4 py-4">
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 tracking-wide inline-block">
                  🎯 Chuyển Đổi Không Giới Hạn
                </span>
                <h2 className="text-3xl sm:text-4xl font-display font-bold text-slate-900 tracking-tight">
                  Biến tài liệu PDF Quiz thành <span className="text-indigo-600 underline decoration-indigo-300">Hệ Thống Trắc Nghiệm</span> tuyệt vời
                </h2>
                <p className="text-slate-600 sm:text-base text-sm max-w-2xl mx-auto font-light leading-relaxed">
                  Đăng tải tài liệu PDF chứa câu hỏi trắc nghiệm. Hệ thống sẽ tự động sử dụng trí tuệ thông minh nhân tạo kết hợp phân tích lớp toạ độ để định nghĩa các vùng được đánh dấu (Highlighted answers) thành đáp án đúng hoàn chỉnh.
                </p>
              </div>

              {/* GRID LAYOUTS */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                
                {/* LEFT PORTION: UPLOAD AREA */}
                <div className="lg:col-span-7 space-y-6">
                  <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                    <h3 className="font-display font-semibold text-slate-900 text-md flex items-center space-x-2 mb-4">
                      <span>📤 Đăng tải tài liệu học tập</span>
                    </h3>

                    {/* Drag and drop module */}
                    <div
                      onDragEnter={handleDrag}
                      onDragOver={handleDrag}
                      onDragLeave={handleDrag}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={`relative border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all ${
                        dragActive 
                          ? "border-indigo-500 bg-indigo-50/50 scale-[1.01]" 
                          : "border-slate-300 hover:border-indigo-400 bg-slate-50/50 hover:bg-slate-50"
                      }`}
                      id="drop_zone"
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        accept=".pdf"
                        onChange={handleFileChange}
                        disabled={uploading}
                      />

                      <div className="p-4 bg-white rounded-full shadow-sm border border-slate-100 text-indigo-600 mb-4">
                        <Upload className="w-8 h-8 animate-bounce" />
                      </div>

                      <p className="font-medium text-slate-800 text-sm text-center">
                        Kéo và thả file PDF của bạn tại đây
                      </p>
                      <p className="text-xs text-slate-400 mt-1.5 text-center">
                        Hoặc bấm vào vùng này để quét tài liệu từ thiết bị (Tối đa 15MB)
                      </p>

                      <div className="mt-4 flex items-center space-x-2.5 px-3 py-1 bg-amber-50 rounded-lg border border-amber-200 text-[11px] text-amber-800">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>PDF phải có đáp án đúng được tô màu (Highlight) sẵn.</span>
                      </div>
                    </div>

                    {/* Loader */}
                    {uploading && (
                      <div className="mt-6 p-5 bg-indigo-50/60 rounded-xl border border-indigo-100 flex items-center space-x-4" id="upload_loader">
                        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin shrink-0"></div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-900">Đang biến đổi PDF bằng Gemini AI...</p>
                          <p className="text-xs text-indigo-700 font-mono truncate animate-pulse mt-0.5">{uploadProgressMsg}</p>
                        </div>
                      </div>
                    )}

                    {/* Error Alerts */}
                    {uploadError && (
                      <div className="mt-6 p-4 bg-red-50 rounded-xl border border-red-200 flex items-start space-x-3 text-red-800" id="upload_error_box">
                        <XOctagon className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-semibold">Tải lên thất bại</p>
                          <p className="text-xs text-red-700/90 mt-1">{uploadError}</p>
                        </div>
                      </div>
                    )}

                    {/* Success notification */}
                    {uploadSuccess && (
                      <div className="mt-6 p-4 bg-emerald-50 rounded-xl border border-emerald-200 flex items-start space-x-3 text-emerald-800" id="upload_success_box">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-semibold">Thành công</p>
                          <p className="text-xs text-emerald-800/90 mt-1">{uploadSuccess}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* DOCUMENTATION MANUAL CARD */}
                  <div className="bg-gradient-to-br from-indigo-900 to-slate-900 text-white rounded-2xl p-6 shadow-md relative overflow-hidden">
                    <div className="absolute right-0 bottom-0 opacity-10 translate-y-1/4 translate-x-1/4">
                      <FileText className="w-64 h-64" />
                    </div>
                    <div className="relative z-10 space-y-4">
                      <span className="px-2 py-0.5 bg-indigo-500 rounded-md text-[10px] font-bold tracking-wider uppercase">
                        Hướng dẫn chuẩn
                      </span>
                      <h4 className="font-display font-bold text-lg text-white">Làm sao để hệ thống nhận diện đúng?</h4>
                      <ul className="text-xs text-slate-300 space-y-2 list-disc pl-4 leading-relaxed">
                        <li>Đáp án trắc nghiệm trên văn bản gốc phải được đánh dấu bằng công cụ <strong>Highlight</strong> của các trình đọc PDF.</li>
                        <li>Đảm bảo file PDF là dạng text có thể bôi đen và sao chép.</li>
                        <li>Hệ thống hỗ trợ các màu sắc Highlight chuẩn như màu Vàng, Xanh lá, Xanh lam, Cam, Hồng.</li>
                        <li>Định dạng câu hỏi nên ở dạng chuẩn: Câu 1, Câu 2... hoặc 1., 2..</li>
                      </ul>
                    </div>
                  </div>
                </div>

                {/* RIGHT PORTION: CONVERTED EXAMS ARCHIVE */}
                <div className="lg:col-span-5 space-y-6">
                  <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col min-h-[350px]">
                    <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
                      <h3 className="font-display font-semibold text-slate-900 text-md flex items-center space-x-2">
                        <BookOpen className="w-4 h-4 text-indigo-600" />
                        <span>Kho bài thi trắc nghiệm hiện có</span>
                      </h3>
                      <button 
                        onClick={fetchQuizzesList}
                        className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors"
                        title="Tải lại danh sách"
                        id="btn_reload"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {loadingList ? (
                      <div className="flex-1 flex flex-col items-center justify-center py-12" id="list_loader">
                        <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mb-3"></div>
                        <p className="text-xs text-slate-500 font-mono">Đang nạp các cấu trúc đề thi...</p>
                      </div>
                    ) : quizzes.length === 0 ? (
                      <div className="flex-1 flex flex-col items-center justify-center py-12 text-center" id="empty_list">
                        <HelpCircle className="w-12 h-12 text-slate-300 mb-3" />
                        <p className="text-sm font-medium text-slate-700">Chưa có bài thi trực tuyến nào</p>
                        <p className="text-xs text-slate-400 mt-1 max-w-[240px] mx-auto">Tải lên một file PDF trắc nghiệm để bắt đầu ôn luyện ngay hôm nay!</p>
                      </div>
                    ) : (
                      <div className="space-y-4 max-h-[440px] overflow-y-auto pr-1" id="quiz_list_container">
                        {quizzes.map((q) => (
                          <div 
                            key={q.id}
                            className="p-4 border border-slate-100 hover:border-indigo-100 bg-slate-50/50 hover:bg-indigo-50/20 rounded-xl transition-all flex items-start justify-between group"
                          >
                            <div className="min-w-0 pr-2">
                              <h4 className="font-semibold text-slate-800 text-xs sm:text-sm line-clamp-1 group-hover:text-indigo-700 transition-colors">
                                {q.title}
                              </h4>
                              <div className="flex items-center space-x-3 text-[11px] text-slate-400 font-mono mt-1">
                                <span>{q.total_questions} câu hỏi</span>
                                <span>•</span>
                                <span>{new Date(q.createdAt).toLocaleDateString("vi-VN")}</span>
                              </div>
                            </div>

                            <button
                              onClick={() => startQuiz(q.id)}
                              className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 shadow-sm shrink-0 transition-all active:scale-[0.98]"
                            >
                              <Play className="w-3 h-3 fill-current" />
                              <span>Làm bài</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </motion.div>
          )}

          {/* SCREEN 2: ACTIVE TEST-TAKING BOARD */}
          {screen === "ACTIVE_TEST" && quizDetails && (
            <motion.div
              key="active_test_screen"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-8"
              id="active_test_view"
            >
              {/* LEFT SIDE: EXAM INFORMATION TABLE & JUMPER GRID */}
              <div className="lg:col-span-4 space-y-6">
                
                {/* TIMER & PROGRESS */}
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
                  <div>
                    <h3 className="font-display font-medium text-slate-400 text-xs tracking-wider uppercase mb-1">Đề thi ôn luyện</h3>
                    <h2 className="font-bold text-slate-900 text-base line-clamp-2">{quizDetails.title}</h2>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="flex items-center space-x-2 text-slate-600">
                      <Clock className="w-4 h-4 text-indigo-600 shrink-0" />
                      <span className="text-xs font-semibold uppercase tracking-wider">Thời gian</span>
                    </div>
                    <span className="font-mono font-bold text-lg text-slate-800">{formatTime(testTime)}</span>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-slate-500 font-mono">
                      <span>Đã hoàn thành</span>
                      <span>
                        {selections.filter(s => s.selected_answer_id !== null).length} / {quizDetails.questions.length} câu
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-indigo-600 transition-all duration-300"
                        style={{ 
                          width: `${(selections.filter(s => s.selected_answer_id !== null).length / quizDetails.questions.length) * 100}%` 
                        }}
                      ></div>
                    </div>
                  </div>
                </div>

                {/* VISUAL JUMPER GRID BOARD */}
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <h3 className="font-display font-semibold text-slate-800 text-xs flex items-center space-x-2">
                      <Grid className="w-4 h-4 text-indigo-600" />
                      <span>Sơ đồ câu hỏi</span>
                    </h3>
                  </div>

                  <div className="grid grid-cols-5 sm:grid-cols-6 lg:grid-cols-5 xl:grid-cols-6 gap-2 max-h-[220px] overflow-y-auto pr-1 py-1">
                    {quizDetails.questions.map((q, idx) => {
                      const selection = selections.find(s => s.question_id === q.id);
                      const isAnswered = selection && selection.selected_answer_id !== null;
                      const isActive = idx === currentQuestionIndex;

                      return (
                        <button
                          key={q.id}
                          onClick={() => setCurrentQuestionIndex(idx)}
                          className={`h-9 rounded-lg border text-xs font-bold font-mono transition-all flex items-center justify-center ${
                            isActive
                              ? "bg-indigo-600 border-indigo-600 text-white shadow-sm ring-2 ring-indigo-500/20"
                              : isAnswered
                              ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                              : "bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50"
                          }`}
                        >
                          {(idx + 1).toString().padStart(2, "0")}
                        </button>
                      );
                    })}
                  </div>

                  <div className="pt-2 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                    <span className="flex items-center space-x-1">
                      <span className="w-2.5 h-2.5 rounded bg-indigo-50 border border-indigo-200 inline-block"></span>
                      <span>Đã làm</span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <span className="w-2.5 h-2.5 rounded bg-white border border-slate-200 inline-block"></span>
                      <span>Chưa chọn</span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <span className="w-2.5 h-2.5 rounded bg-indigo-600 inline-block"></span>
                      <span>Đang chọn</span>
                    </span>
                  </div>
                </div>

                {/* CRITICAL ACTION: NỘP BÀI */}
                <button
                  onClick={handleSubmitExam}
                  disabled={submitting}
                  className="w-full py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold tracking-wide shadow-md shadow-indigo-600/10 hover:shadow-indigo-600/20 active:scale-[0.99] transition-all flex items-center justify-center space-x-2 shrink-0 disabled:opacity-50"
                >
                  {submitting ? (
                    <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  ) : (
                    <>
                      <span>Nộp bài & Chấm điểm</span>
                      <Check className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>

              {/* RIGHT SIDE: INTERACTIVE ACTIVE QUESTION CARD */}
              <div className="lg:col-span-8 flex flex-col bg-white border border-slate-200 rounded-2xl p-6 shadow-sm min-h-[460px]">
                
                {/* Question title index */}
                <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
                  <span className="px-3 py-1 bg-indigo-50 rounded-lg text-indigo-700 font-mono font-bold text-xs">
                    Câu hỏi {currentQuestionIndex + 1} / {quizDetails.questions.length}
                  </span>
                  
                  <span className="text-[11px] text-slate-400 italic">
                    Chọn đáp án bên dưới để ghi nhận trả lời
                  </span>
                </div>

                {/* Question Text wrapper */}
                <div className="flex-1 space-y-8">
                  <div>
                    <h3 className="font-display font-semibold text-slate-900 text-base sm:text-lg leading-relaxed whitespace-pre-wrap">
                      {quizDetails.questions[currentQuestionIndex].content}
                    </h3>
                  </div>

                  {/* Options layout */}
                  <div className="grid grid-cols-1 gap-4">
                    {quizDetails.questions[currentQuestionIndex].answers.map((ans) => {
                      const selected = selections.find(
                        s => s.question_id === quizDetails.questions[currentQuestionIndex].id
                      )?.selected_answer_id === ans.id;

                      return (
                        <button
                          key={ans.id}
                          onClick={() => handleSelectOption(quizDetails.questions[currentQuestionIndex].id, ans.id)}
                          className={`text-left p-4 rounded-xl border-2 transition-all flex items-start space-x-3.5 ${
                            selected 
                              ? "border-indigo-600 bg-indigo-50 text-indigo-900 shadow-sm" 
                              : "border-slate-100 hover:border-slate-300 hover:bg-slate-50 bg-slate-50/30 text-slate-700"
                          }`}
                        >
                          <span className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-all mt-0.5 ${
                            selected 
                              ? "border-indigo-600 bg-indigo-600 text-white" 
                              : "border-slate-300 bg-white"
                          }`}>
                            {selected && <span className="w-2 h-2 rounded-full bg-white"></span>}
                          </span>
                          
                          <span className="text-xs sm:text-sm leading-relaxed">{ans.content}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* PAGINATION BUTTONS ROW */}
                <div className="mt-8 pt-4 border-t border-slate-100 flex items-center justify-between">
                  <button
                    onClick={() => setCurrentQuestionIndex(prev => Math.max(0, prev - 1))}
                    disabled={currentQuestionIndex === 0}
                    className="inline-flex items-center space-x-2 px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-white transition-all transition-colors cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Lùi lại</span>
                  </button>

                  <button
                    onClick={() => setCurrentQuestionIndex(prev => Math.min(quizDetails.questions.length - 1, prev + 1))}
                    disabled={currentQuestionIndex === quizDetails.questions.length - 1}
                    className="inline-flex items-center space-x-2 px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-white transition-all transition-colors cursor-pointer"
                  >
                    <span>Tiếp theo</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

              </div>
            </motion.div>
          )}

          {/* SCREEN 3: EXAM STATS & DETAILED RESULTS SHEET */}
          {screen === "RESULT" && examResult && quizDetails && (
            <motion.div
              key="result_screen"
              initial={{ opacity: 0, scale: 1.02 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-8"
              id="result_view"
            >
              {/* SCORE BOARD AND GAUGES */}
              <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
                
                {/* Visual scorecard */}
                <div className="md:col-span-5 flex flex-col items-center justify-center p-6 bg-gradient-to-br from-indigo-900 to-indigo-950 rounded-2xl text-white relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-3 opacity-10">
                    <FileText className="w-24 h-24" />
                  </div>
                  
                  <span className="text-[10px] font-bold tracking-wider text-indigo-300 uppercase mb-2">
                    Điểm số cuối cùng (Thang điểm 10)
                  </span>
                  <div className="relative flex items-baseline font-display">
                    <span className="text-64 font-bold tracking-tight">
                      {examResult.total_questions > 0 ? ((examResult.correct_count / examResult.total_questions) * 10).toFixed(1) : "0.0"}
                    </span>
                    <span className="text-xl font-medium text-indigo-300 ml-1">/ 10</span>
                  </div>

                  <p className="text-xs text-indigo-200 mt-2 font-mono text-center">
                    Tỷ lệ đúng: {examResult.score_percentage}% • ({examResult.correct_count}/{examResult.total_questions} câu)
                  </p>
                </div>

                {/* Analytical logs */}
                <div className="md:col-span-7 space-y-6">
                  <div>
                    <span className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">KẾT QUẢ ĐÁNH GIÁ</span>
                    <h2 className="text-xl sm:text-2xl font-display font-bold text-slate-900 truncate mt-1">
                      {quizDetails.title}
                    </h2>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3.5 bg-emerald-50 rounded-xl border border-emerald-100 text-emerald-800 text-center">
                      <span className="block text-18 font-bold font-mono">{examResult.correct_count}</span>
                      <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-600">Trả lời đúng</span>
                    </div>

                    <div className="p-3.5 bg-red-50 rounded-xl border border-red-100 text-red-800 text-center">
                      <span className="block text-18 font-bold font-mono">{examResult.incorrect_count}</span>
                      <span className="text-[10px] uppercase font-bold tracking-wider text-red-600">Trả lời sai</span>
                    </div>

                    <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 text-slate-700 text-center">
                      <span className="block text-18 font-bold font-mono">{formatTime(testTime)}</span>
                      <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Thời gian làm</span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3 pt-2">
                    <button
                      onClick={() => startQuiz(quizDetails.id)}
                      className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white font-semibold text-xs sm:text-sm shadow-sm hover:bg-indigo-700 transition-colors cursor-pointer"
                    >
                      <RefreshCw className="w-4 h-4" />
                      <span>Thi lại bài này</span>
                    </button>

                    <button
                      onClick={() => setScreen("HOME")}
                      className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 font-semibold text-xs sm:text-sm hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <Home className="w-4 h-4" />
                      <span>Quay lại trang chủ</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* DETAILED QUESTIONS REVIEW LOG */}
              <div className="space-y-6">
                <hr className="border-slate-200" />
                <h3 className="font-display font-bold text-slate-900 text-lg flex items-center space-x-2">
                  <span>📋 Chi tiết từng câu hỏi</span>
                  <span className="text-xs font-normal text-slate-400 hover:underline">(Xem đáp án nguồn được Highlight của PDF)</span>
                </h3>

                <div className="space-y-6" id="questions_review_container">
                  {examResult.results.map((resItem, idx) => {
                    return (
                      <div 
                        key={resItem.question_id}
                        className={`p-6 bg-white border rounded-2xl shadow-sm relative ${
                          resItem.is_correct 
                            ? "border-emerald-200 bg-emerald-50/10" 
                            : "border-red-200 bg-red-50/10"
                        }`}
                      >
                        {/* Correct badge */}
                        <div className="absolute right-6 top-6">
                          {resItem.is_correct ? (
                            <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold uppercase tracking-wider">
                              <Check className="w-3 h-3" />
                              <span>Đáp án đúng</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full bg-red-100 text-red-800 text-[10px] font-bold uppercase tracking-wider">
                              <X className="w-3 h-3" />
                              <span>Sai lệch</span>
                            </span>
                          )}
                        </div>

                        {/* Title index */}
                        <div className="mb-3">
                          <span className="text-slate-400 font-mono text-xs font-bold bg-slate-100 px-2 py-0.5 rounded">
                            Câu hỏi {(idx + 1).toString().padStart(2, "0")}
                          </span>
                        </div>

                        <h4 className="font-semibold text-slate-900 text-base mb-4 leading-relaxed pr-24 whitespace-pre-wrap">
                          {resItem.question_content}
                        </h4>

                        {/* Choice list block */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                          {resItem.answers.map((ans) => {
                            const isUserSelected = resItem.selected_answer_id === ans.id;
                            const isTrueCorrect = resItem.correct_answer_id === ans.id;

                            let buttonStyle = "border-slate-100 bg-slate-50/30 text-slate-700";
                            let icon = null;

                            if (isTrueCorrect) {
                              buttonStyle = "border-emerald-600 bg-emerald-50 text-emerald-900 font-medium ring-1 ring-emerald-500/10";
                              icon = <Check className="w-4 h-4 text-emerald-600 shrink-0" />;
                            } else if (isUserSelected && !isTrueCorrect) {
                              buttonStyle = "border-red-600 bg-red-50 text-red-900 font-medium ring-1 ring-red-500/10";
                              icon = <X className="w-4 h-4 text-red-600 shrink-0" />;
                            }

                            return (
                              <div
                                key={ans.id}
                                className={`p-4 rounded-xl border flex items-start space-x-3 text-xs sm:text-sm ${buttonStyle}`}
                              >
                                {icon ? icon : <div className="w-4 h-4 rounded-full border border-slate-300 bg-white shrink-0"></div>}
                                <span>{ans.content}</span>
                              </div>
                            );
                          })}
                        </div>

                        {/* Metadata explanation of prompt highlight */}
                        <div className="mt-4 p-3 bg-slate-50 border border-slate-100 rounded-xl flex items-center space-x-2.5 text-xs text-slate-500">
                          <HelpCircle className="w-4 h-4 text-indigo-500 shrink-0" />
                          <span>Gemini đã nhận diện đáp án gốc nằm trong vùng bản đồ Highlight đúng là <strong>Đáp án {resItem.correct_letter}</strong>.</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* FOOTER BAR */}
      <footer className="border-t border-slate-200 bg-white py-6" id="sys_footer">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400 font-mono">
          <div className="flex items-center space-x-1.5">
            <span>Powered by</span>
            <span className="text-indigo-600 font-bold font-sans">Google Gemini AI</span>
            <span>&</span>
            <span className="text-slate-600 font-bold font-sans">PyMuPDF Core</span>
          </div>

          <div>
            <span>© 2026 PDF Quiz Converter System Applet.</span>
          </div>
        </div>
      </footer>

      {/* CUSTOM CONFIRMATION MODAL */}
      <AnimatePresence>
        {confirmModal && confirmModal.visible && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" id="confirm_modal_backdrop">
            {/* Backdrop overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirmModal(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            
            {/* Modal main content */}
            <motion.div
              initial={{ scale: 0.95, y: 16, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 16, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              className="relative w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden p-6 z-10"
              id="confirm_modal_body"
            >
              <div className="flex items-start space-x-4">
                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-full shrink-0">
                  <HelpCircle className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-slate-900">{confirmModal.title}</h3>
                  <p className="text-xs sm:text-sm text-slate-500 mt-2 leading-relaxed whitespace-pre-wrap">
                    {confirmModal.description}
                  </p>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setConfirmModal(null)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-medium rounded-xl transition-all"
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const cb = confirmModal.onConfirm;
                    setConfirmModal(null);
                    cb();
                  }}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-medium rounded-xl transition-all shadow-md shadow-indigo-600/10"
                >
                  Đồng ý
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CUSTOM ALERT MODAL */}
      <AnimatePresence>
        {alertModal && alertModal.visible && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" id="alert_modal_backdrop">
            {/* Backdrop overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setAlertModal(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            
            {/* Modal main content */}
            <motion.div
              initial={{ scale: 0.95, y: 16, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 16, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              className="relative w-full max-w-sm bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden p-6 z-10"
              id="alert_modal_body"
            >
              <div className="flex items-start space-x-4">
                <div className="p-3 bg-red-50 text-red-600 rounded-full shrink-0">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-slate-900">{alertModal.title}</h3>
                  <p className="text-xs sm:text-sm text-slate-500 mt-2 leading-relaxed whitespace-pre-wrap">
                    {alertModal.description}
                  </p>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => setAlertModal(null)}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-medium rounded-xl transition-all shadow-md"
                >
                  Đã rõ
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
