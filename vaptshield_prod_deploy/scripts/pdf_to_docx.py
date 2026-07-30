#!/usr/bin/env python3
import sys
import os
from pdf2docx import Converter

def main():
    if len(sys.argv) < 3:
        print("Usage: python3 pdf_to_docx.py <input_pdf_path> <output_docx_path>")
        sys.exit(1)

    pdf_path = sys.argv[1]
    docx_path = sys.argv[2]

    if not os.path.exists(pdf_path):
        print(f"Error: Input PDF not found at {pdf_path}")
        sys.exit(1)

    # Output directory check
    os.makedirs(os.path.dirname(os.path.abspath(docx_path)), exist_ok=True)

    print(f"Starting conversion of {pdf_path} to {docx_path}...")
    try:
        cv = Converter(pdf_path)
        # Convert all pages
        cv.convert(docx_path, start=0, end=None)
        cv.close()
        print("Successfully converted PDF to DOCX")
    except Exception as e:
        print(f"Error converting PDF to DOCX: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
