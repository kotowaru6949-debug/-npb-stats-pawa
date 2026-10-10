"""
NPB セイバーメトリクス & パワプロ査定 統括更新スクリプト
指定された年度のデータを収集・計算し、JSONおよびCSVに出力する。
"""

import os
import sys
import json
import csv
import re
import argparse
import shutil
from typing import List, Dict, Any

from scraper import scrape_year_data, resolve_team_name, get_player_defense_position
from metrics import calc_league_aggregates, calc_batter_metrics, calc_pitcher_metrics, safe_int, safe_float
from pawa_eval import eval_batter_pawa, eval_pitcher_pawa

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_PROCESSED_DIR = os.path.join(BASE_DIR, "data", "processed")
SITE_DATA_DIR = os.path.join(BASE_DIR, "site", "data")
os.makedirs(DATA_PROCESSED_DIR, exist_ok=True)
os.makedirs(SITE_DATA_DIR, exist_ok=True)

def process_year(year: int) -> Dict[str, Any]:
    print(f"\n>>> Processing Year: {year} ...")
    raw = scrape_year_data(year)
    if not raw:
        print(f"[Error] No data found for {year}")
        return None

    # 1. リーグ環境計算
    cl_lg = calc_league_aggregates(raw["cl"]["team_bat"], raw["cl"]["team_pitch"])
    pl_lg = calc_league_aggregates(raw["pl"]["team_bat"], raw["pl"]["team_pitch"]) if raw.get("pl") else None

    league_info = {
        "year": year,
        "cl": {k: round(v, 4) for k, v in cl_lg.items()},
        "pl": {k: round(v, 4) for k, v in pl_lg.items()} if pl_lg else None
    }

    batters = []
    pitchers = []

    # 2. セ・リーグ打者
    for row in raw["cl"]["ind_bat"][1:]:
        text = row["text"]
        raw_cells = row["raw"]
        team_name = resolve_team_name(raw_cells[2] if len(raw_cells) > 2 else "")
        player_link = re.search(r'href=[\'"](.*?)[\'"]', raw_cells[1]).group(1) if re.search(r'href=[\'"](.*?)[\'"]', raw_cells[1]) else ""
        position = get_player_defense_position(player_link, year)

        metrics = calc_batter_metrics(text, cl_lg)
        pawa = eval_batter_pawa(metrics, cl_lg, position)
        b_data = {
            "year": year, "league": "セ", "rank": safe_int(text[0], 1), "name": text[1], "team": team_name,
            **metrics, **pawa, "player_url": player_link
        }
        batters.append(b_data)

    # 3. パ・リーグ打者
    if raw.get("pl") and pl_lg:
        for row in raw["pl"]["ind_bat"][1:]:
            text = row["text"]
            raw_cells = row["raw"]
            team_name = resolve_team_name(raw_cells[2] if len(raw_cells) > 2 else "")
            player_link = re.search(r'href=[\'"](.*?)[\'"]', raw_cells[1]).group(1) if re.search(r'href=[\'"](.*?)[\'"]', raw_cells[1]) else ""
            position = get_player_defense_position(player_link, year)

            metrics = calc_batter_metrics(text, pl_lg)
            pawa = eval_batter_pawa(metrics, pl_lg, position)
            b_data = {
                "year": year, "league": "パ", "rank": safe_int(text[0], 1), "name": text[1], "team": team_name,
                **metrics, **pawa, "player_url": player_link
            }
            batters.append(b_data)

    # 4. セ・リーグ投手
    for row in raw["cl"]["ind_pitch"][1:]:
        text = row["text"]
        raw_cells = row["raw"]
        team_name = resolve_team_name(raw_cells[2] if len(raw_cells) > 2 else "")
        player_link = re.search(r'href=[\'"](.*?)[\'"]', raw_cells[1]).group(1) if re.search(r'href=[\'"](.*?)[\'"]', raw_cells[1]) else ""

        metrics = calc_pitcher_metrics(text, cl_lg)
        pawa = eval_pitcher_pawa(metrics, cl_lg)
        p_data = {
            "year": year, "league": "セ", "rank": safe_int(text[0], 1), "name": text[1], "team": team_name,
            **metrics, **pawa, "player_url": player_link
        }
        pitchers.append(p_data)

    # 5. パ・リーグ投手
    if raw.get("pl") and pl_lg:
        for row in raw["pl"]["ind_pitch"][1:]:
            text = row["text"]
            raw_cells = row["raw"]
            team_name = resolve_team_name(raw_cells[2] if len(raw_cells) > 2 else "")
            player_link = re.search(r'href=[\'"](.*?)[\'"]', raw_cells[1]).group(1) if re.search(r'href=[\'"](.*?)[\'"]', raw_cells[1]) else ""

            metrics = calc_pitcher_metrics(text, pl_lg)
            pawa = eval_pitcher_pawa(metrics, pl_lg)
            p_data = {
                "year": year, "league": "パ", "rank": safe_int(text[0], 1), "name": text[1], "team": team_name,
                **metrics, **pawa, "player_url": player_link
            }
            pitchers.append(p_data)

    print(f"  -> {year}: 打者 {len(batters)}名, 投手 {len(pitchers)}名 完了")
    return {
        "league": league_info,
        "batters": batters,
        "pitchers": pitchers
    }

def save_csv(data_list: List[Dict[str, Any]], filepath: str):
    if not data_list:
        return
    keys = list(data_list[0].keys())
    with open(filepath, "w", encoding="utf_8_sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=keys)
        writer.writeheader()
        writer.writerows(data_list)
    print(f"Exported CSV: {filepath}")

def main():
    parser = argparse.ArgumentParser(description="Update NPB Sabermetrics & Pawa data")
    parser.add_argument("--years", nargs="+", type=int, default=None,
                        help="Target years to scrape and calculate")
    parser.add_argument("--all", action="store_true",
                        help="Scrape and calculate all years from 1950 to 2024")
    parser.add_argument("--start", type=int, default=1950, help="Start year")
    parser.add_argument("--end", type=int, default=2024, help="End year")
    args = parser.parse_args()

    if args.all or not args.years:
        target_years = list(range(args.start, args.end + 1))
    else:
        target_years = args.years

    all_batters = []
    all_pitchers = []
    all_leagues = []

    for yr in target_years:
        res = process_year(yr)
        if res:
            all_leagues.append(res["league"])
            all_batters.extend(res["batters"])
            all_pitchers.extend(res["pitchers"])

    # 年代降順、同年内は OPS+ 降順、投手は FIP- 昇順（優秀な順）
    all_batters.sort(key=lambda x: (x["year"], x["ops_plus"]), reverse=True)
    all_pitchers.sort(key=lambda x: (-x["year"], x["fip_minus"]))

    # JSON 保存
    batters_json_path = os.path.join(DATA_PROCESSED_DIR, "batters.json")
    pitchers_json_path = os.path.join(DATA_PROCESSED_DIR, "pitchers.json")
    leagues_json_path = os.path.join(DATA_PROCESSED_DIR, "leagues.json")

    with open(batters_json_path, "w", encoding="utf-8") as f:
        json.dump(all_batters, f, ensure_ascii=False, indent=2)
    with open(pitchers_json_path, "w", encoding="utf-8") as f:
        json.dump(all_pitchers, f, ensure_ascii=False, indent=2)
    with open(leagues_json_path, "w", encoding="utf-8") as f:
        json.dump(all_leagues, f, ensure_ascii=False, indent=2)

    # CSV 保存
    save_csv(all_batters, os.path.join(DATA_PROCESSED_DIR, "batters.csv"))
    save_csv(all_pitchers, os.path.join(DATA_PROCESSED_DIR, "pitchers.csv"))

    # Webサイト用ディレクトリへコピー
    for fn in ["batters.json", "pitchers.json", "leagues.json"]:
        shutil.copy(os.path.join(DATA_PROCESSED_DIR, fn), os.path.join(SITE_DATA_DIR, fn))

    print(f"\n[Success] Complete! Total Batters: {len(all_batters)}, Total Pitchers: {len(all_pitchers)}")

if __name__ == "__main__":
    main()
