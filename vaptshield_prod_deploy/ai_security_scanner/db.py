import os
import json
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

load_dotenv()


def get_db_connection():
    return psycopg2.connect(
        host=os.getenv("PGHOST", ""),
        port=os.getenv("PGPORT", "6543"),
        dbname=os.getenv("PGDATABASE", "postgres"),
        user=os.getenv("PGUSER", ""),
        password=os.getenv("PGPASSWORD", ""),
        sslmode="require",
    )


async def update_scan_status(scan_id: str, status: str, **kwargs):
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        sets = ["status = %s"]
        params = [status]
        for key, value in kwargs.items():
            sets.append(f"{key} = %s")
            params.append(value)
        params.append(scan_id)
        cur.execute(
            f"UPDATE ai_security_scans SET {', '.join(sets)} WHERE id = %s",
            params,
        )
        conn.commit()
    finally:
        conn.close()


async def save_scan_results(scan_id: str, findings: list, summary: dict):
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        findings_data = [
            {
                "probe_name": f.probe_name,
                "category": f.category,
                "owasp_category": f.owasp_category.value,
                "payload": f.payload[:500],
                "response": f.response[:1000],
                "vulnerable": f.vulnerable,
                "severity": f.severity.value,
                "evidence": f.evidence[:500],
                "description": f.description,
                "remediation": f.remediation,
            }
            for f in findings
        ]
        cur.execute(
            "UPDATE ai_security_scans SET results = %s::jsonb, summary = %s::jsonb WHERE id = %s",
            [json.dumps(findings_data), json.dumps(summary), scan_id],
        )
        conn.commit()
    finally:
        conn.close()
