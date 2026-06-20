import re
from typing import List, Dict, Any

class QuestionExtractor:
    """
    Module responsible for regex extraction of questions and options from
    unstructured or semi-structured PDF text, combining multi-line anomalies,
    and resolving the correct answer based on highlight tags.
    """
    def __init__(self):
        # Match "Câu 1:" or "1." or "Câu 1." or "Câu 1 -" or "1)"
        self.question_pattern = re.compile(
            r'^(?:Câu\s+)?(\d+)\s*[\.:\)\-\/]\s*(.*)$', 
            re.IGNORECASE
        )
        # Match option beginnings: A. or B) or C -
        self.option_pattern = re.compile(
            r'^\s*([A-D])\s*[\.:\)\-\/]\s*(.*)$', 
            re.IGNORECASE
        )

    def extract(self, parsed_lines: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Parses structured lines (with text and highlight flags) and groups them
        into elegant question objects. Handles unexpected wrapping lines safely.
        """
        questions = []
        current_question = None
        current_options = []
        detected_correct = None
        
        # Buffer to keep track of multi-line continuation
        active_buffer_type = None  # 'question' or 'option'
        active_option_index = -1

        for line_data in parsed_lines:
            text = line_data.get("text", "").strip()
            is_highlighted = line_data.get("is_highlighted", False)
            
            if not text:
                continue

            # Check if this line is a new question
            q_match = self.question_pattern.match(text)
            if q_match:
                # Save previous question if exists and valid
                if current_question:
                    questions.append({
                        "question": current_question.strip(),
                        "options": current_options,
                        "correct_answer": detected_correct or "A"  # Fallback
                    })
                
                # Start new question
                current_question = q_match.group(2)
                current_options = []
                detected_correct = None
                active_buffer_type = 'question'
                active_option_index = -1
                continue

            # Check if this line starts an option
            opt_match = self.option_pattern.match(text)
            if opt_match and current_question is not None:
                opt_letter = opt_match.group(1).upper()
                opt_content = opt_match.group(2).strip()
                
                current_options.append(f"{opt_letter}. {opt_content}")
                active_option_index = len(current_options) - 1
                active_buffer_type = 'option'
                
                if is_highlighted:
                    detected_correct = opt_letter
                continue

            # Otherwise, append to existing buffer (xuống dòng bất thường)
            if active_buffer_type == 'question' and current_question is not None:
                current_question += " " + text
            elif active_buffer_type == 'option' and len(current_options) > 0:
                current_options[active_option_index] += " " + text
                if is_highlighted:
                    # In case the highlighted chunk was split to next line
                    # we derive the index letter from option prefix
                    m = self.option_pattern.match(current_options[active_option_index])
                    if m:
                        detected_correct = m.group(1).upper()

        # Append last remaining question
        if current_question:
            questions.append({
                "question": current_question.strip(),
                "options": current_options,
                "correct_answer": detected_correct or "A"
            })

        return questions
