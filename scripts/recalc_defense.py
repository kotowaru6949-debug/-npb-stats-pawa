import os
import json
import csv
from collections import defaultdict
from pawa_eval import eval_batter_pawa

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIELDING_CACHE_FILE = os.path.join(BASE_DIR, "data", "fielding_cache.json")
BATTERS_JSON_SITE = os.path.join(BASE_DIR, "site", "data", "batters.json")
BATTERS_JSON_DATA = os.path.join(BASE_DIR, "data", "processed", "batters.json")
BATTERS_CSV_SITE = os.path.join(BASE_DIR, "site", "data", "batters.csv")
BATTERS_CSV_DATA = os.path.join(BASE_DIR, "data", "processed", "batters.csv")
LEAGUES_JSON_FILE = os.path.join(BASE_DIR, "site", "data", "leagues.json")

def main():
    print(">>> Loading data...")
    with open(FIELDING_CACHE_FILE, "r", encoding="utf-8") as f:
        fielding_db = json.load(f)

    with open(BATTERS_JSON_SITE, "r", encoding="utf-8") as f:
        batters = json.load(f)

    with open(LEAGUES_JSON_FILE, "r", encoding="utf-8") as f:
        leagues = json.load(f)
    leagues_map = {l["year"]: l for l in leagues}

    # 1. 各年度・各ポジションの合計集計
    yearly_pos_totals = defaultdict(lambda: {"g": 0, "po": 0, "a": 0, "e": 0})
    for b in batters:
        u = b.get("player_url", "").strip().lstrip("/")
        p_data = fielding_db.get(u, {})
        y_str = str(b["year"])
        if y_str in p_data:
            for pos, st in p_data[y_str].items():
                k = (b["year"], pos)
                yearly_pos_totals[k]["g"] += st["g"]
                yearly_pos_totals[k]["po"] += st["po"]
                yearly_pos_totals[k]["a"] += st["a"]
                yearly_pos_totals[k]["e"] += st["e"]

    # 2. 全打者の守備・能力値を再計算
    updated_batters = []
    print(f">>> Recalculating {len(batters)} batters with RRF-based defense and FPCT-based fielding...")

    for b in batters:
        u = b.get("player_url", "").strip().lstrip("/")
        p_data = fielding_db.get(u, {})
        y_str = str(b["year"])

        f_info = {
            "primary_pos": b.get("primary_pos", "指"),
            "rf": 0.0, "rrf": 100.0, "fpct": 0.0, "avg_fpct": 0.0
        }

        if y_str in p_data and p_data[y_str]:
            # 試合数が最大のポジション
            best_pos = None
            max_g = -1
            for pos, st in p_data[y_str].items():
                if st["g"] > max_g:
                    max_g = st["g"]
                    best_pos = pos

            st = p_data[y_str][best_pos]
            k = (b["year"], best_pos)
            tot = yearly_pos_totals[k]

            avg_rf = (tot["po"] + tot["a"]) / max(tot["g"], 1)
            avg_fpct = (tot["po"] + tot["a"]) / max(tot["po"] + tot["a"] + tot["e"], 1)

            p_rf = (st["po"] + st["a"]) / max(st["g"], 1)
            rrf = (p_rf / max(avg_rf, 0.001)) * 100.0 if avg_rf > 0 else 100.0

            f_info = {
                "primary_pos": best_pos,
                "rf": p_rf,
                "rrf": rrf,
                "fpct": st["fpct"],
                "avg_fpct": avg_fpct
            }

        lg_info = leagues_map.get(b["year"], {})
        lg_league = lg_info.get("cl" if b.get("league") == "セ" else "pl", {})
        if not lg_league:
            lg_league = lg_info.get("cl", {})

        pawa = eval_batter_pawa(b, lg_league, f_info["primary_pos"], f_info)

        b_new = {**b, **pawa}
        updated_batters.append(b_new)

    print(">>> Saving updated batters.json...")
    with open(BATTERS_JSON_SITE, "w", encoding="utf-8") as f:
        json.dump(updated_batters, f, ensure_ascii=False, indent=2)
    with open(BATTERS_JSON_DATA, "w", encoding="utf-8") as f:
        json.dump(updated_batters, f, ensure_ascii=False, indent=2)

    print(">>> Saving updated batters.csv...")
    if updated_batters:
        keys = list(updated_batters[0].keys())
        for path in [BATTERS_CSV_SITE, BATTERS_CSV_DATA]:
            with open(path, "w", encoding="utf-8-sig", newline="") as f:
                writer = csv.DictWriter(f, fieldnames=keys)
                writer.writeheader()
                writer.writerows(updated_batters)

    print(">>> All done! Batters data updated successfully.")

if __name__ == "__main__":
    main()
