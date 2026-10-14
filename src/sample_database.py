"""
SQLite Sample Storage Engine for Milk Adulteration Detection
Maintains a persistent lab record of all tested milk samples, whether from
the interactive web dashboard, presets, or live ESP32 IoT telemetry.
"""

import os
import sqlite3
from datetime import datetime
from typing import List, Dict, Any, Optional

PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(PROJECT_DIR, 'data', 'milk_history.db')

def get_db_connection():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Initializes the database schema and seeds initial benchmark lab records if empty."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS tested_samples (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sample_name TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            created_at TEXT NOT NULL,
            temperature REAL NOT NULL,
            fat INTEGER NOT NULL,
            turbidity INTEGER NOT NULL,
            color INTEGER NOT NULL,
            ph REAL NOT NULL,
            grade TEXT NOT NULL,
            conf_medium REAL NOT NULL,
            conf_low REAL NOT NULL,
            adulterant_type TEXT NOT NULL,
            severity TEXT NOT NULL,
            source TEXT NOT NULL,
            notes TEXT
        )
    """)
    conn.commit()

    # Check if empty, seed initial realistic sample records
    cursor.execute("SELECT COUNT(*) FROM tested_samples")
    count = cursor.fetchone()[0]
    if count == 0:
        seed_samples = [
            (
                "Whole Milk Batch #101",
                datetime.now().strftime("%d %b %Y, %I:%M %p"),
                datetime.now().isoformat(),
                36.5, 1, 1, 255, 6.70,
                "Medium", 96.2, 3.8,
                "None (Pure Whole Milk)", "normal",
                "Interactive Lab Test", "Morning farm collection from Tanker A"
            ),
            (
                "Suspected Caustic Wash #102",
                datetime.now().strftime("%d %b %Y, %I:%M %p"),
                datetime.now().isoformat(),
                41.0, 0, 0, 246, 8.65,
                "Low", 2.4, 97.6,
                "Detergent / Soda / Neutralizer Adulteration", "danger",
                "ESP32 IoT Node", "Detergent wash detected by alkaline pH and depleted fat"
            ),
            (
                "Soured Milk Sample #103",
                datetime.now().strftime("%d %b %Y, %I:%M %p"),
                datetime.now().isoformat(),
                44.0, 1, 0, 249, 4.60,
                "Low", 6.8, 93.2,
                "Lactic Acid Fermentation / Acid Preservative", "danger",
                "Interactive Lab Test", "High bacterial proliferation, destabilized turbidity"
            ),
            (
                "Urea Buffered Sample #104",
                datetime.now().strftime("%d %b %Y, %I:%M %p"),
                datetime.now().isoformat(),
                38.0, 1, 1, 250, 7.35,
                "Medium", 88.5, 11.5,
                "Added Neutralizer (Soda/Urea)", "warning",
                "Preset Scenario", "Mild buffer detected above normal pH range"
            ),
            (
                "Water Diluted Delivery #105",
                datetime.now().strftime("%d %b %Y, %I:%M %p"),
                datetime.now().isoformat(),
                35.0, 0, 0, 241, 6.30,
                "Low", 4.1, 95.9,
                "Water Dilution (Added Water)", "danger",
                "Interactive Lab Test", "Extensive dilution with depleted fat globules and SNF opacity"
            )
        ]
        cursor.executemany("""
            INSERT INTO tested_samples (
                sample_name, timestamp, created_at, temperature, fat, turbidity,
                color, ph, grade, conf_medium, conf_low, adulterant_type,
                severity, source, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, seed_samples)
        conn.commit()

    conn.close()

def save_sample(
    sample_name: str,
    temperature: float,
    fat: int,
    turbidity: int,
    color: int,
    ph: float,
    grade: str,
    conf_medium: float,
    conf_low: float,
    adulterant_type: str,
    severity: str,
    source: str = "Interactive Lab Test",
    notes: str = ""
) -> Dict[str, Any]:
    """Inserts a new tested sample record and returns its full dictionary."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    now = datetime.now()
    timestamp_str = now.strftime("%d %b %Y, %I:%M %p")
    created_at = now.isoformat()
    
    if not sample_name or sample_name.strip() == "":
        cursor.execute("SELECT COUNT(*) FROM tested_samples")
        next_num = cursor.fetchone()[0] + 1
        sample_name = f"Sample #{next_num:03d}"

    cursor.execute("""
        INSERT INTO tested_samples (
            sample_name, timestamp, created_at, temperature, fat, turbidity,
            color, ph, grade, conf_medium, conf_low, adulterant_type,
            severity, source, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        sample_name.strip(), timestamp_str, created_at,
        float(temperature), int(fat), int(turbidity), int(color), float(ph),
        grade, float(conf_medium), float(conf_low),
        adulterant_type, severity, source, notes.strip()
    ))
    conn.commit()
    inserted_id = cursor.lastrowid
    
    cursor.execute("SELECT * FROM tested_samples WHERE id = ?", (inserted_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row)

def get_all_samples(grade_filter: Optional[str] = None, search: Optional[str] = None, limit: int = 100) -> List[Dict[str, Any]]:
    """Retrieves tested milk samples sorted newest first, with optional search and grade filter."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    query = "SELECT * FROM tested_samples WHERE 1=1"
    params = []
    
    if grade_filter and grade_filter.lower() != 'all':
        query += " AND LOWER(grade) = LOWER(?)"
        params.append(grade_filter)
        
    if search and search.strip():
        term = f"%{search.strip()}%"
        query += " AND (sample_name LIKE ? OR adulterant_type LIKE ? OR notes LIKE ? OR source LIKE ?)"
        params.extend([term, term, term, term])
        
    query += " ORDER BY id DESC LIMIT ?"
    params.append(limit)
    
    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_sample_by_id(sample_id: int) -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM tested_samples WHERE id = ?", (sample_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def delete_sample_by_id(sample_id: int) -> bool:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM tested_samples WHERE id = ?", (sample_id,))
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return deleted

def clear_all_samples() -> int:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM tested_samples")
    count = cursor.rowcount
    conn.commit()
    conn.close()
    return count

def get_samples_stats() -> Dict[str, Any]:
    """Computes aggregated metrics from tested samples history."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT COUNT(*) FROM tested_samples")
    total = cursor.fetchone()[0]
    
    if total == 0:
        conn.close()
        return {
            "total_tested": 0,
            "medium_count": 0,
            "low_count": 0,
            "medium_pct": 0.0,
            "low_pct": 0.0,
            "adulteration_rate_pct": 0.0,
            "avg_ph": 0.0,
            "avg_temp": 0.0
        }
        
    cursor.execute("SELECT COUNT(*) FROM tested_samples WHERE LOWER(grade) = 'medium'")
    medium_count = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM tested_samples WHERE LOWER(grade) = 'low'")
    low_count = cursor.fetchone()[0]
    
    cursor.execute("SELECT AVG(ph), AVG(temperature) FROM tested_samples")
    avg_ph, avg_temp = cursor.fetchone()
    
    conn.close()
    
    return {
        "total_tested": total,
        "medium_count": medium_count,
        "low_count": low_count,
        "medium_pct": round((medium_count / total) * 100, 1),
        "low_pct": round((low_count / total) * 100, 1),
        "adulteration_rate_pct": round((low_count / total) * 100, 1),
        "avg_ph": round(float(avg_ph), 2) if avg_ph else 0.0,
        "avg_temp": round(float(avg_temp), 1) if avg_temp else 0.0
    }

def export_samples_as_csv() -> str:
    """Exports all sample records to standard CSV text."""
    samples = get_all_samples(limit=10000)
    headers = [
        "ID", "Sample Name", "Date/Time", "Temperature (C)", "Fat (0/1)",
        "Turbidity (0/1)", "Color Reflectance", "pH Level", "Predicted Grade",
        "Confidence Medium (%)", "Confidence Low (%)", "Adulterant Classification",
        "Severity", "Test Source", "Notes"
    ]
    lines = [",".join(headers)]
    for s in samples:
        row = [
            str(s['id']),
            f'"{s["sample_name"]}"',
            f'"{s["timestamp"]}"',
            str(s['temperature']),
            str(s['fat']),
            str(s['turbidity']),
            str(s['color']),
            str(s['ph']),
            f'"{s["grade"]}"',
            str(s['conf_medium']),
            str(s['conf_low']),
            f'"{s["adulterant_type"]}"',
            f'"{s["severity"]}"',
            f'"{s["source"]}"',
            f'"{s["notes"] or ""}"'
        ]
        lines.append(",".join(row))
    return "\n".join(lines)

# Auto-initialize database schema on module import
init_db()
