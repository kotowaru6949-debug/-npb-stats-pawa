"""
2689web.com (日本プロ野球記録) スクレイパー
年度ごとのチーム成績（リーグ平均用）および規定打席・投球回到達者データを収集する。
"""

import os
import re
import time
import urllib.request
from typing import Dict, List, Any, Optional

BASE_URL = "https://2689web.com"
CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "cache")
os.makedirs(CACHE_DIR, exist_ok=True)

TEAM_NAME_MAP = {
    "kyojin": "巨人", "giants": "巨人",
    "hanshin": "阪神", "tigers": "阪神",
    "dena": "DeNA", "baystars": "DeNA", "taiheiyo": "大洋", "whales": "大洋",
    "hiroshima": "広島", "carp": "広島",
    "chunichi": "中日", "dragons": "中日",
    "yakult": "ヤクルト", "swallows": "ヤクルト", "sankei": "サンケイ",
    "softbank": "ソフトバンク", "hawks": "ソフトバンク", "daiei": "ダイエー", "nankai": "南海",
    "nipponham": "日本ハム", "fighters": "日本ハム", "toei": "東映",
    "lotte": "ロッテ", "marines": "ロッテ", "orions": "オリオンズ",
    "rakuten": "楽天", "eagles": "楽天",
    "orix": "オリックス", "buffaloes": "オリックス", "braves": "阪急", "kintetsu": "近鉄",
    "seibu": "西武", "lions": "西武", "nishitetsu": "西鉄"
}

def resolve_team_name(img_tag_or_str: str) -> str:
    s = img_tag_or_str.lower()
    for key, name in TEAM_NAME_MAP.items():
        if key in s:
            return name
    return "不明"

def parse_ip(ip_str: str) -> float:
    try:
        ip_str = ip_str.strip()
        if "." in ip_str:
            parts = ip_str.split(".")
            integer_part = float(parts[0])
            frac = float(parts[1])
            if frac == 1:
                return integer_part + 1.0 / 3.0
            elif frac == 2:
                return integer_part + 2.0 / 3.0
            return float(ip_str)
        return float(ip_str)
    except Exception:
        return 0.0

def fetch_page(url: str, cache_filename: str, delay: float = 0.5) -> Optional[str]:
    cache_path = os.path.join(CACHE_DIR, cache_filename)
    if os.path.exists(cache_path):
        with open(cache_path, "r", encoding="utf-8") as f:
            return f.read()

    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
    try:
        time.sleep(delay)
        with urllib.request.urlopen(req, timeout=15) as res:
            content = res.read().decode("cp932", errors="replace")
            with open(cache_path, "w", encoding="utf-8") as f:
                f.write(content)
            return content
    except Exception as e:
        print(f"[Warn] Failed to fetch {url}: {e}")
        return None

def extract_tables(html: str) -> List[List[Dict[str, Any]]]:
    tables_html = re.findall(r'<table.*?>.*?</table>', html, re.I | re.S)
    parsed_tables = []
    for tbl in tables_html:
        rows = []
        for r in re.findall(r'<tr.*?>.*?</tr>', tbl, re.I | re.S):
            cells = [re.sub(r'<.*?>', '', c).strip() for c in re.findall(r'<t[hd].*?>(.*?)</t[hd]>', r, re.I | re.S)]
            raw_cells = re.findall(r'<t[hd].*?>(.*?)</t[hd]>', r, re.I | re.S)
            if cells:
                rows.append({"text": cells, "raw": raw_cells})
        parsed_tables.append(rows)
    return parsed_tables

def get_player_defense_position(player_url: str, year: int) -> str:
    if not player_url:
        return "指"
    clean_url = player_url.strip().lstrip("/")
    cache_name = "player_" + clean_url.replace("/", "_")
    full_url = f"{BASE_URL}/{clean_url}" if not clean_url.startswith("http") else clean_url

    content = fetch_page(full_url, cache_name, delay=0.2)
    if not content:
        return "指"

    rows = re.findall(r'<tr.*?>.*?</tr>', content, re.I | re.S)
    pos_str = ""
    for r in rows:
        cells = [re.sub(r'<.*?>', '', c).strip() for c in re.findall(r'<t[hd].*?>(.*?)</t[hd]>', r, re.I | re.S)]
        if cells and cells[0] == str(year):
            for c in cells:
                if re.search(r'\([投捕一二三遊外左中右指]\)', c):
                    pos_str = c
                    break
            if pos_str:
                break

    # Extract positions and game counts
    # e.g. "(二)129 (一)1" -> "二"
    positions = re.findall(r'\(([投捕一二三遊外左中右指])\)(\d+)?', pos_str)
    if not positions:
        return "外" # 不明時は外野など
    primary_pos = "指"
    max_games = -1
    for pos, g_str in positions:
        g = int(g_str) if g_str else 1
        if g > max_games:
            max_games = g
            primary_pos = pos
    return primary_pos

def scrape_year_data(year: int) -> Dict[str, Any]:
    url = f"{BASE_URL}/{year}.html"
    cache_file = f"year_{year}.html"
    html = fetch_page(url, cache_file)
    if not html:
        return {}

    tables = extract_tables(html)
    if len(tables) < 16:
        print(f"[Warn] Unexpected table count ({len(tables)}) for {year}")
        return {}

    # セ・リーグ (Table 2: 打撃, Table 3: 投手, Table 6: 個人打撃, Table 7: 個人投手)
    # パ・リーグ (Table 10: 打撃, Table 11: 投手, Table 14: 個人打撃, Table 15: 個人投手)
    return {
        "year": year,
        "cl": {
            "team_bat": tables[2],
            "team_pitch": tables[3],
            "ind_bat": tables[6],
            "ind_pitch": tables[7]
        },
        "pl": {
            "team_bat": tables[10],
            "team_pitch": tables[11],
            "ind_bat": tables[14],
            "ind_pitch": tables[15]
        }
    }
