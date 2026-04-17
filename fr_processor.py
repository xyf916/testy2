#!/usr/bin/env python3
import sys
import os
import json
import re
import glob
import sqlite3
import time
from pathlib import Path

try:
    from docx import Document
    from docx.opc.exceptions import PackageNotFoundError
    DOCX_AVAILABLE = True
except ImportError:
    DOCX_AVAILABLE = False

DOC_CONVERTERS = []

try:
    import subprocess
    DOC_CONVERTERS.append("antiword")
except:
    pass

try:
    import win32com.client  # type: ignore[import]
    DOC_CONVERTERS.append("win32com")
except ImportError:
    pass


# ---------------------------------------------------------------------------
# SQLite cache helpers
# ---------------------------------------------------------------------------

def init_db(db_path):
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.execute('''CREATE TABLE IF NOT EXISTS fr_cache (
        fr_number TEXT PRIMARY KEY,
        title     TEXT,
        status    TEXT,
        preview   TEXT,
        file_path TEXT,
        cached_at INTEGER
    )''')
    conn.commit()
    conn.close()


def get_cached_preview(db_path, fr_number):
    try:
        conn = sqlite3.connect(db_path)
        row = conn.execute(
            'SELECT title, status, preview, file_path FROM fr_cache WHERE fr_number = ?',
            (fr_number,)
        ).fetchone()
        conn.close()
        if row:
            return {"title": row[0], "status": row[1], "content": row[2], "filePath": row[3]}
        return None
    except Exception:
        return None


def set_cached_preview(db_path, fr_number, data):
    try:
        conn = sqlite3.connect(db_path)
        conn.execute(
            '''INSERT OR REPLACE INTO fr_cache
               (fr_number, title, status, preview, file_path, cached_at)
               VALUES (?, ?, ?, ?, ?, ?)''',
            (
                fr_number,
                data.get("title", ""),
                data.get("status", ""),
                data.get("content", "")[:200],
                data.get("filePath", ""),
                int(time.time())
            )
        )
        conn.commit()
        conn.close()
    except Exception:
        pass


def clear_db(db_path):
    try:
        conn = sqlite3.connect(db_path)
        conn.execute('DELETE FROM fr_cache')
        conn.commit()
        conn.close()
    except Exception:
        pass


# ---------------------------------------------------------------------------
# File finding
# ---------------------------------------------------------------------------

def find_fr_file(fr_number, fr_folder):
    fr_num = int(fr_number)
    folder_base = (fr_num // 100) * 100
    # Subfolders are named Fr0200, FR0200, Fr14100, FR14100, etc. (4-digit zero-padded, no trailing 's')
    subfolder_padded = f"{folder_base:04d}"
    subfolder_candidates = [
        f"Fr{subfolder_padded}",
        f"FR{subfolder_padded}",
        f"fr{subfolder_padded}",
    ]

    for subfolder_name in subfolder_candidates:
        for ext in [".docx", ".doc"]:
            p = os.path.join(fr_folder, subfolder_name, f"FR{fr_number}{ext}")
            if os.path.exists(p):
                return p

    # Direct in root
    for ext in [".docx", ".doc"]:
        p = os.path.join(fr_folder, f"FR{fr_number}{ext}")
        if os.path.exists(p):
            return p

    # Fallback: recursive glob (handles any case variation or zero-padding in filename)
    for ext in [".docx", ".doc"]:
        matches = glob.glob(os.path.join(fr_folder, "**", f"*{fr_number}*{ext}"), recursive=True)
        if matches:
            return matches[0]

    return None


# ---------------------------------------------------------------------------
# Document reading
# ---------------------------------------------------------------------------

def escape_html(text):
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def read_docx(file_path):
    if not DOCX_AVAILABLE:
        raise ImportError("python-docx not installed. Run: pip install python-docx")

    doc = Document(file_path)
    content_parts = []
    headings = []
    title = ""
    status = ""
    html_parts = []

    def process_paragraph(para):
        nonlocal title, status
        text = para.text.strip()
        if not text:
            return
        style_name = para.style.name.lower() if para.style else ""

        if not title and ("heading" in style_name or "title" in style_name):
            title = text
            headings.append(text)
            html_parts.append(f"<h1>{escape_html(text)}</h1>")
        elif "heading" in style_name:
            headings.append(text)
            html_parts.append(f"<h2>{escape_html(text)}</h2>")
        else:
            content_parts.append(text)
            html_parts.append(f"<p>{escape_html(text)}</p>")

        if not status and "status" in text.lower():
            match = re.search(r"status[:\s]+(\w+)", text, re.IGNORECASE)
            if match:
                status = match.group(1).strip()

    def process_table(table):
        from docx.oxml.ns import qn
        html_parts.append('<table border="1" cellpadding="4" cellspacing="0" style="border-collapse:collapse;margin:8px 0;">')
        for row in table.rows:
            html_parts.append("<tr>")
            seen_tcs = set()
            for cell in row.cells:
                tc = cell._tc
                if id(tc) in seen_tcs:
                    continue
                seen_tcs.add(id(tc))
                grid_span = 1
                tc_pr = tc.find(qn("w:tcPr"))
                if tc_pr is not None:
                    gs = tc_pr.find(qn("w:gridSpan"))
                    if gs is not None:
                        grid_span = int(gs.get(qn("w:val"), 1))
                cell_text = cell.text.strip()
                content_parts.append(cell_text)
                colspan_attr = f' colspan="{grid_span}"' if grid_span > 1 else ""
                html_parts.append(f"<td{colspan_attr}>{escape_html(cell_text)}</td>")
            html_parts.append("</tr>")
        html_parts.append("</table>")

    for child in doc.element.body:
        tag = child.tag.split("}")[-1] if "}" in child.tag else child.tag
        if tag == "p":
            from docx.text.paragraph import Paragraph
            process_paragraph(Paragraph(child, doc))
        elif tag == "tbl":
            from docx.table import Table
            process_table(Table(child, doc))

    return {
        "title": title,
        "status": status,
        "content": "\n\n".join(content_parts),
        "headings": headings,
        "html": "\n".join(html_parts),
        "filePath": file_path
    }


def doc_to_docx(file_path):
    """Convert a .doc file to a temp .docx using Word, return the temp path."""
    import win32com.client  # type: ignore[import]
    import pythoncom  # type: ignore[import]
    import tempfile
    import shutil

    tmp_dir = tempfile.gettempdir()
    pid = os.getpid()
    # Copy the .doc to a temp location so Word lock files don't block us
    tmp_doc  = os.path.join(tmp_dir, f"fr_tmp_{pid}.doc")
    tmp_docx = os.path.join(tmp_dir, f"fr_tmp_{pid}.docx")
    shutil.copy2(file_path, tmp_doc)

    pythoncom.CoInitialize()
    word = None
    try:
        word = win32com.client.DispatchEx("Word.Application")
        word.Visible = False
        word.DisplayAlerts = 0
        doc = word.Documents.Open(os.path.abspath(tmp_doc))
        doc.SaveAs(tmp_docx, FileFormat=16)  # 16 = wdFormatXMLDocument (.docx)
        doc.Close(0)
    finally:
        try:
            if word:
                word.Quit()
        except Exception:
            pass
        pythoncom.CoUninitialize()
        try:
            os.remove(tmp_doc)
        except Exception:
            pass
    return tmp_docx


def read_doc(file_path):
    if "win32com" not in DOC_CONVERTERS:
        raise ValueError("pywin32 not installed. Run: pip install pywin32")
    tmp = doc_to_docx(file_path)
    try:
        result = read_docx(tmp)
        result["filePath"] = file_path
        return result
    finally:
        try:
            os.remove(tmp)
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Full-text search (requires prior ingestion via ingest_fr.py)
# ---------------------------------------------------------------------------

def search_fr(db_path, query, originator_filter="", fr_number_filter="", limit=50):
    try:
        conn = sqlite3.connect(db_path)
        existing = {r[0] for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type IN ('table','shadow') AND name IN ('fr_documents','fr_fts')"
        ).fetchall()}
        if 'fr_documents' not in existing or 'fr_fts' not in existing:
            conn.close()
            return {"results": [], "error": "not_indexed"}

        q = (query or "").strip()

        sql = (
            "SELECT d.fr_number, d.title, '' AS snippet, d.file_path,"
            " COALESCE(d.originator, '')"
            " FROM fr_documents d"
            " JOIN fr_fts f ON f.fr_number = d.fr_number"
            " WHERE 1=1"
        )
        params = []
        if q:
            sql += " AND (d.title LIKE ? OR f.body_text LIKE ?)"
            params.append('%' + q + '%')
            params.append('%' + q + '%')
        if originator_filter:
            sql += " AND COALESCE(d.originator, '') LIKE ?"
            params.append('%' + originator_filter + '%')
        if fr_number_filter:
            sql += " AND d.fr_number LIKE ?"
            params.append('%' + fr_number_filter + '%')
        sql += " ORDER BY CAST(d.fr_number AS INTEGER) LIMIT ?"
        params.append(limit)
        rows = conn.execute(sql, params).fetchall()
        conn.close()
        return {"results": _rows_to_results(rows)}

    except Exception as e:
        return {"results": [], "error": str(e)}


def _rows_to_results(rows):
    results = []
    for row in rows:
        results.append({
            "frNumber":   row[0],
            "title":      row[1],
            "snippet":    row[2],
            "filePath":   row[3],
            "originator": row[4] or "",
        })
    return results


# ---------------------------------------------------------------------------
# Preview and full content (with cache)
# ---------------------------------------------------------------------------

def get_preview(fr_number, fr_folder, db_path):
    # 1. Check SQLite cache first
    if db_path:
        init_db(db_path)
        cached = get_cached_preview(db_path, fr_number)
        if cached:
            return cached

    # 2. Cache miss — read from disk
    file_path = find_fr_file(fr_number, fr_folder)
    if not file_path:
        return None

    ext = os.path.splitext(file_path)[1].lower()
    if ext == ".docx":
        data = read_docx(file_path)
    elif ext == ".doc":
        data = read_doc(file_path)
    else:
        return None

    result = {
        "title": data["title"],
        "status": data["status"],
        "content": data["content"],
        "filePath": data["filePath"]
    }

    # 3. Store 200-char preview in SQLite
    if db_path:
        set_cached_preview(db_path, fr_number, result)

    return result


def get_full_content(fr_number, fr_folder):
    file_path = find_fr_file(fr_number, fr_folder)
    if not file_path:
        return None

    ext = os.path.splitext(file_path)[1].lower()
    if ext == ".docx":
        return read_docx(file_path)
    elif ext == ".doc":
        return read_doc(file_path)
    return None


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: fr_processor.py <command> [args...]"}))
        sys.exit(1)

    command = sys.argv[1]

    # clear_cache only needs db_path
    if command == "clear_cache":
        db_path = sys.argv[2] if len(sys.argv) > 2 else None
        if db_path:
            clear_db(db_path)
        print(json.dumps({"ok": True}))
        return

    # search <db_path> <query> [originator] [fr_number_filter]
    if command == "search":
        db_path          = sys.argv[2] if len(sys.argv) > 2 else None
        query            = sys.argv[3] if len(sys.argv) > 3 else ""
        originator_filter= sys.argv[4] if len(sys.argv) > 4 else ""
        fr_number_filter = sys.argv[5] if len(sys.argv) > 5 else ""
        result = search_fr(db_path, query, originator_filter, fr_number_filter)
        print(json.dumps(result))
        return

    # full_by_path <fr_number> <file_path>
    if command == "full_by_path":
        fr_number = sys.argv[2] if len(sys.argv) > 2 else ""
        file_path = sys.argv[3] if len(sys.argv) > 3 else ""
        try:
            ext = os.path.splitext(file_path)[1].lower()
            if ext == ".docx":
                result = read_docx(file_path)
            elif ext == ".doc":
                result = read_doc(file_path)
            else:
                result = {"error": "Unsupported file type"}
            print(json.dumps(result))
        except Exception as e:
            print(json.dumps({"error": str(e)}))
        return

    if len(sys.argv) < 4:
        print(json.dumps({"error": "Usage: fr_processor.py <preview|full> <fr_number> <fr_folder> [db_path]"}))
        sys.exit(1)

    fr_number = sys.argv[2]
    fr_folder = sys.argv[3]
    db_path   = sys.argv[4] if len(sys.argv) > 4 else None

    try:
        if command == "preview":
            result = get_preview(fr_number, fr_folder, db_path)
        elif command == "full":
            result = get_full_content(fr_number, fr_folder)
        else:
            result = {"error": "Unknown command"}

        if result:
            print(json.dumps(result))
        else:
            print(json.dumps({"error": "FR not found"}))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
