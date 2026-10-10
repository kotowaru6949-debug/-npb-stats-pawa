"""
2689web.com (日本プロ野球記録) スクレイパー
1950年〜現在の全年度に対応した動的テーブル抽出およびデータ収集モジュール。
"""

import os
import re
import time
import urllib.request
from typing import Dict, List, Any, Optional

BASE_URL = "https://2689web.com"
CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "cache")
os.makedirs(CACHE_DIR, exist_ok=True)

TEAM_NAME_MAP = [
    ("kyojin", "巨人"), ("giants", "巨人"),
    ("hanshin", "阪神"), ("tigers", "阪神"), ("osaka", "阪神"),
    ("dena", "DeNA"), ("baystars", "DeNA"), ("yokohama", "横浜"), ("taiyou", "大洋"), ("whales", "大洋"),
    ("hiroshima", "広島"), ("carp", "広島"),
    ("chunichi", "中日"), ("dragons", "中日"),
    ("yakult", "ヤクルト"), ("swallows", "ヤクルト"), ("sankei", "サンケイ"), ("kokutetsu", "国鉄"),
    ("softbank", "ソフトバンク"), ("hawks", "ソフトバンク"), ("daiei", "ダイエー"), ("daie", "ダイエー"), ("nankai", "南海"),
    ("nipponham", "日本ハム"), ("fighters", "日本ハム"), ("toei", "東映"), ("tokyu", "東映/東急"),
    ("lotte", "ロッテ"), ("marines", "ロッテ"), ("orions", "ロッテ"), ("daimai", "大毎"), ("mainichi", "毎日"),
    ("tombow", "トンボ"), ("tokyo", "東京"),
    ("rakuten", "楽天"), ("eagles", "楽天"),
    ("orix", "オリックス"), ("buffaloes", "オリックス"), ("hankyu", "阪急"), ("kintetsu", "近鉄"),
    ("seibu", "西武"), ("lions", "西武"), ("taiheiyou", "太平洋"), ("nishitetsu", "西鉄"),
    ("shouchiku", "松竹"), ("nishinihon", "西日本")
]

def resolve_team_name(img_tag_or_str: str) -> str:
    s = img_tag_or_str.lower()
    for key, name in TEAM_NAME_MAP:
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

def fetch_page(url: str, cache_filename: str, delay: float = 0.05) -> Optional[str]:
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
        # print(f"[Warn] Failed to fetch {url}: {e}")
        return None

def parse_table_rows(tbl_html: str) -> List[Dict[str, Any]]:
    rows = []
    for r in re.findall(r'<tr.*?>.*?</tr>', tbl_html, re.I | re.S):
        cells = [re.sub(r'<.*?>', '', c).strip() for c in re.findall(r'<t[hd].*?>(.*?)</t[hd]>', r, re.I | re.S)]
        raw_cells = re.findall(r'<t[hd].*?>(.*?)</t[hd]>', r, re.I | re.S)
        if cells:
            rows.append({"text": cells, "raw": raw_cells})
    return rows

def get_player_defense_position(player_url: str, year: int) -> str:
    if not player_url:
        return "指"
    clean_url = player_url.strip().lstrip("/")
    cache_name = "player_" + clean_url.replace("/", "_")
    full_url = f"{BASE_URL}/{clean_url}" if not clean_url.startswith("http") else clean_url

    content = fetch_page(full_url, cache_name, delay=0.03)
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

    positions = re.findall(r'\(([投捕一二三遊外左中右指])\)(\d+)?', pos_str)
    if not positions:
        return "外"
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
    html = fetch_page(url, cache_file, delay=0.1)
    if not html:
        return {}

    tables_html = re.findall(r'<table.*?>.*?</table>', html, re.I | re.S)

    bat_ind_tables = []
    pitch_ind_tables = []
    team_bat_tables = []
    team_pitch_tables = []

    for tbl in tables_html:
        rows = re.findall(r'<tr.*?>.*?</tr>', tbl, re.I | re.S)
        if not rows: continue
        first_row_cells = [re.sub(r'<.*?>', '', c).strip() for c in re.findall(r'<t[hd].*?>(.*?)</t[hd]>', rows[0], re.I | re.S)]
        header_text = " ".join(first_row_cells)

        if "順位" in header_text and "選手名" in header_text and "打席" in header_text:
            bat_ind_tables.append(parse_table_rows(tbl))
        elif "順位" in header_text and "選手名" in header_text and "登板" in header_text:
            pitch_ind_tables.append(parse_table_rows(tbl))
        elif "打席" in header_text and "打数" in header_text and "本塁" in header_text and "順位" not in header_text:
            team_bat_tables.append(parse_table_rows(tbl))
        elif "完投" in header_text and "投回" in header_text and "順位" not in header_text:
            team_pitch_tables.append(parse_table_rows(tbl))

    if not (bat_ind_tables and team_bat_tables):
        print(f"[Warn] Could not find required tables for year {year}")
        return {}

    # セ・リーグ (index 0), パ・リーグ (index 1)
    cl_data = {
        "team_bat": team_bat_tables[0],
        "team_pitch": team_pitch_tables[0],
        "ind_bat": bat_ind_tables[0],
        "ind_pitch": pitch_ind_tables[0]
    }

    # パ・リーグが存在する場合 (1950年以降は2リーグ制なので基本的に存在する)
    pl_data = None
    if len(bat_ind_tables) > 1 and len(team_bat_tables) > 1:
        pl_data = {
            "team_bat": team_bat_tables[1],
            "team_pitch": team_pitch_tables[1],
            "ind_bat": bat_ind_tables[1],
            "ind_pitch": pitch_ind_tables[1]
        }

    return {
        "year": year,
        "cl": cl_data,
        "pl": pl_data
    }
