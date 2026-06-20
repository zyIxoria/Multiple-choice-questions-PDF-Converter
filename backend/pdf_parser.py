import fitz  # PyMuPDF
from typing import List, Dict, Any

class PDFHighlightParser:
    """
    Parser for extracting text blocks and highlight regions from a PDF file.
    Matches text line coordinates with highlight annotation bounds to detect
    which answers are correct.
    """
    def __init__(self, file_path: str):
        self.file_path = file_path

    def extract_highlights(self) -> List[Dict[str, Any]]:
        """
        Reads the PDF and extracts highlighted coordinate boxes per page.
        Returns:
            List of dicts containing page number and coordinates of highlight rectangles.
        """
        doc = fitz.open(self.file_path)
        highlights = []

        for page_num in range(len(doc)):
            page = doc[page_num]
            annot = page.first_annot
            while annot:
                # Type 8 is highlight annotation in PDF standard
                if annot.type[0] == 8:
                    rect = annot.rect  # High-precision bounding box
                    highlights.append({
                        "page": page_num,
                        "rect": (rect.x0, rect.y0, rect.x1, rect.y1)
                    })
                annot = annot.next

        doc.close()
        return highlights

    def parse_text_with_highlights(self) -> List[Dict[str, Any]]:
        """
        Combines raw text lines and cross-references them with highlight intersections.
        Returns a flow of lines, each annotated with whether it was highlighted.
        """
        doc = fitz.open(self.file_path)
        parsed_lines = []

        for page_num in range(len(doc)):
            page = doc[page_num]
            
            # Extract highlight coordinates for this page
            page_highlights = []
            annot = page.first_annot
            while annot:
                if annot.type[0] == 8:
                    page_highlights.append(annot.rect)
                annot = annot.next

            # Extract words with detailed positioning: (x0, y0, x1, y1, "word", block_no, line_no, word_no)
            words = page.get_text("words")
            
            # Group words into line structures or use block structures for clean reconstruction
            blocks = page.get_text("blocks")
            # blocks are tuples: (x0, y0, x1, y1, "text", block_no, block_type)
            for b in blocks:
                if b[6] == 0:  # Text block
                    lines = b[4].split('\n')
                    for line in lines:
                        clean_line = line.strip()
                        if not clean_line:
                            continue
                            
                        # Estimate highlight intersection by searching matching words coordinates
                        is_highlighted = False
                        # We also check if the block rect intersects with any of our highlights
                        block_rect = fitz.Rect(b[0], b[1], b[2], b[3])
                        
                        for h_rect in page_highlights:
                            # If they intersect significantly
                            intersection = block_rect & h_rect
                            if intersection.get_area() > 0.3 * h_rect.get_area():
                                # Double-check by filtering individual words in the lines
                                # To keep coordinates robust, we fallback to marking highlighted
                                is_highlighted = True
                                break
                                
                        parsed_lines.append({
                            "text": clean_line,
                            "is_highlighted": is_highlighted,
                            "page": page_num
                        })

        doc.close()
        return parsed_lines
