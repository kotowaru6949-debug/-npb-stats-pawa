import os
import sys
import re
import time
import json
import csv
import urllib.request
from collections import defaultdict

sys.stdout.reconfigure(encoding='utf-8')

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE_DIR = os.path.join(BASE_DIR, "data", "cache")
BASE_URL = "https://2689web.com"

from scraper import scrape_year_data
from metrics import safe_int, safe_float, parse_ip
from pawa_eval import eval_batter_pawa, eval_pitcher_pawa

TEAM_MAP = {
    "giants": ("巨人", "セ"), "tigers": ("阪神", "セ"), "dragons": ("中日", "セ"),
    "swallows": ("ヤクルト", "セ"), "carp": ("広島", "セ"), "baystars": ("DeNA", "セ"),
    "whales": ("大洋", "セ"), "taiyo": ("大洋", "セ"), "kokutetsu": ("国鉄", "セ"),
    "sankei": ("サンケイ", "セ"), "robins": ("松竹", "セ"), "pirates": ("西日本", "セ"),
    "hawks": ("ソフトバンク", "パ"), "daiei": ("ダイエー", "パ"), "nankai": ("南海", "パ"),
    "lions": ("西武", "パ"), "nishitetsu": ("西鉄", "パ"), "taiheiyo": ("太平洋", "パ"), "crown": ("クラウン", "パ"),
    "fighters": ("日本ハム", "パ"), "toei": ("東映", "パ"), "tokyu": ("東急", "パ"), "flyers": ("東急/東映", "パ"),
    "marines": ("ロッテ", "パ"), "orions": ("ロッテ/毎日", "パ"), "mainichi": ("毎日", "パ"), "daimai": ("大毎", "パ"), "tokyo": ("東京", "パ"),
    "buffaloes": ("オリックス", "パ"), "braves": ("阪急", "パ"), "hankyu": ("阪急", "パ"), "kintetsu": ("近鉄", "パ"), "pearls": ("近鉄", "パ"), "bluebirds": ("近鉄", "パ"),
    "eagles": ("楽天", "パ"), "stars": ("大映", "パ"), "tombow": ("トンボ/高橋", "パ"), "takahashi": ("トンボ/高橋", "パ"), "clippers": ("西鉄", "パ")
}

def normalize_name(s):
    return re.sub(r'[\s\u3000]+', '', s)

def resolve_team(rel_url):
    clean = rel_url.lower()
    for k, (t_name, lg) in TEAM_MAP.items():
        if f"/{k}.html" in clean or f"_{k}.html" in clean:
            return t_name, lg
    return "不明", "セ"

def fetch_team_page(rel_url, delay=0.03):
    clean = rel_url.strip().lstrip('/')
    cache_name = "team_" + clean.replace('/', '_')
    cache_path = os.path.join(CACHE_DIR, cache_name)
    if os.path.exists(cache_path):
        with open(cache_path, 'r', encoding='utf-8', errors='ignore') as fp:
            text = fp.read()
        if "打席" not in text and "登板" not in text:
            with open(cache_path, 'rb') as fp:
                raw = fp.read()
            text = raw.decode('shift_jis', errors='replace')
        return text
    
    full_url = f"{BASE_URL}/{clean}"
    time.sleep(delay)
    try:
        req = urllib.request.Request(full_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=10) as resp:
            raw = resp.read()
        content = raw.decode('shift_jis', errors='replace')
        with open(cache_path, 'w', encoding='utf-8') as fp:
            fp.write(content)
        return content
    except Exception as e:
        print(f"Error fetching {full_url}: {e}")
        return None

def get_val(cells, col_map, keys, default=""):
    if isinstance(keys, str):
        keys = [keys]
    for k in keys:
        if k in col_map:
            idx = col_map[k]
            if 0 <= idx < len(cells):
                return cells[idx]
    return default

def parse_team_batter_row(cells, col_map):
    return {
        "num": get_val(cells, col_map, ["背番", "背番号"]),
        "name": get_val(cells, col_map, ["選手名"]),
        "g": safe_int(get_val(cells, col_map, ["試合"])),
        "pa": safe_int(get_val(cells, col_map, ["打席"])),
        "ab": safe_int(get_val(cells, col_map, ["打数"])),
        "r": safe_int(get_val(cells, col_map, ["得点"])),
        "h": safe_int(get_val(cells, col_map, ["安打"])),
        "2b": safe_int(get_val(cells, col_map, ["二塁"])),
        "3b": safe_int(get_val(cells, col_map, ["三塁"])),
        "hr": safe_int(get_val(cells, col_map, ["本塁"])),
        "tb": safe_int(get_val(cells, col_map, ["塁打"])),
        "rbi": safe_int(get_val(cells, col_map, ["打点"])),
        "sb": safe_int(get_val(cells, col_map, ["盗塁"])),
        "cs": safe_int(get_val(cells, col_map, ["盗刺"])),
        "sh": safe_int(get_val(cells, col_map, ["犠打"])),
        "sf": safe_int(get_val(cells, col_map, ["犠飛"])),
        "bb": safe_int(get_val(cells, col_map, ["四球"])),
        "hbp": safe_int(get_val(cells, col_map, ["死球"])),
        "so": safe_int(get_val(cells, col_map, ["三振"])),
        "gdp": safe_int(get_val(cells, col_map, ["併打"])),
        "e": safe_int(get_val(cells, col_map, ["失策"])),
        "avg": safe_float(get_val(cells, col_map, ["打率"])),
        "obp": safe_float(get_val(cells, col_map, ["出塁"])),
        "slg": safe_float(get_val(cells, col_map, ["長打"])),
        "ops": safe_float(get_val(cells, col_map, ["OPS", "ops"])),
        "age": safe_int(get_val(cells, col_map, ["年齢"])),
        "pos_tag": get_val(cells, col_map, ["守備"])
    }

def parse_team_pitcher_row(cells, col_map):
    return {
        "num": get_val(cells, col_map, ["背番", "背番号"]),
        "name": get_val(cells, col_map, ["選手名"]),
        "g": safe_int(get_val(cells, col_map, ["登板"])),
        "gs": safe_int(get_val(cells, col_map, ["先発"])),
        "cg": safe_int(get_val(cells, col_map, ["完投"])),
        "sho": safe_int(get_val(cells, col_map, ["完封"])),
        "w": safe_int(get_val(cells, col_map, ["勝利", "勝"])),
        "l": safe_int(get_val(cells, col_map, ["敗戦", "敗"])),
        "sv": safe_int(get_val(cells, col_map, ["Ｓ", "S", "セーブ"])),
        "hld": safe_int(get_val(cells, col_map, ["Ｈ", "H", "ホールド"])),
        "ip": parse_ip(get_val(cells, col_map, ["投球回"])),
        "tbf": safe_int(get_val(cells, col_map, ["打者"])),
        "h": safe_int(get_val(cells, col_map, ["安打", "被安"])),
        "hr": safe_int(get_val(cells, col_map, ["本塁", "被本"])),
        "bb": safe_int(get_val(cells, col_map, ["四球", "与四"])),
        "hbp": safe_int(get_val(cells, col_map, ["死球", "与死"])),
        "so": safe_int(get_val(cells, col_map, ["三振", "奪三"])),
        "er": safe_int(get_val(cells, col_map, ["自責"])),
        "era": safe_float(get_val(cells, col_map, ["防率", "防御率"])),
        "age": safe_int(get_val(cells, col_map, ["年齢"])),
        "pos_tag": get_val(cells, col_map, ["守備"])
    }

def calc_batter_sabermetrics(stats, lg):
    g = stats["g"]
    pa = stats["pa"]
    ab = stats["ab"]
    r = stats["r"]
    h = stats["h"]
    b2 = stats["2b"]
    b3 = stats["3b"]
    hr = stats["hr"]
    tb = stats["tb"]
    rbi = stats["rbi"]
    sb = stats["sb"]
    cs = stats["cs"]
    sh = stats["sh"]
    sf = stats["sf"]
    bb = stats["bb"]
    hbp = stats["hbp"]
    so = stats["so"]
    gdp = stats["gdp"]
    e = stats["e"]
    avg = stats["avg"]
    obp = stats["obp"]
    slg = stats["slg"]
    ops = stats["ops"]
    age = stats["age"]

    if obp == 0.0 and (ab + bb + hbp + sf) > 0:
        obp = (h + bb + hbp) / max(ab + bb + hbp + sf, 1)
    if slg == 0.0 and ab > 0 and tb > 0:
        slg = tb / ab
    if ops == 0.0:
        ops = obp + slg

    ops_plus = 100.0 * ((obp / max(lg["lg_obp"], 0.001)) + (slg / max(lg["lg_slg"], 0.001)) - 1.0)
    obp_plus = 100.0 * (obp / max(lg["lg_obp"], 0.001))
    avg_plus = 100.0 * (avg / max(lg["lg_avg"], 0.001))
    isop = slg - avg
    isop_plus = 100.0 * (isop / max(lg["lg_isop"], 0.001))
    isod = obp - avg
    k_pct = (so / max(pa, 1)) * 100.0
    bb_pct = (bb / max(pa, 1)) * 100.0
    bb_k = bb / max(so, 1)
    sb_pct = (sb / max(sb + cs, 1)) * 100.0 if (sb + cs) > 0 else 0.0
    wsb = 0.2 * sb - 0.38 * cs

    return {
        "g": g, "pa": pa, "ab": ab, "r": r, "h": h, "2b": b2, "3b": b3, "hr": hr, "tb": tb,
        "rbi": rbi, "sb": sb, "cs": cs, "sh": sh, "sf": sf, "bb": bb, "hbp": hbp, "so": so,
        "gdp": gdp, "e": e, "avg": avg, "obp": obp, "slg": slg, "ops": ops, "age": age,
        "ops_plus": round(ops_plus, 1),
        "obp_plus": round(obp_plus, 1),
        "avg_plus": round(avg_plus, 1),
        "isop": round(isop, 3),
        "isop_plus": round(isop_plus, 1),
        "isod": round(isod, 3),
        "k_pct": round(k_pct, 1),
        "bb_pct": round(bb_pct, 1),
        "bb_k": round(bb_k, 2),
        "sb_pct": round(sb_pct, 1),
        "wsb": round(wsb, 2)
    }

def calc_pitcher_sabermetrics(stats, lg):
    g = stats["g"]
    gs = stats["gs"]
    cg = stats["cg"]
    sho = stats["sho"]
    w = stats["w"]
    l = stats["l"]
    sv = stats["sv"]
    hld = stats["hld"]
    ip = stats["ip"]
    tbf = stats["tbf"]
    h = stats["h"]
    hr = stats["hr"]
    bb = stats["bb"]
    hbp = stats["hbp"]
    so = stats["so"]
    er = stats["er"]
    era = stats["era"]
    age = stats["age"]

    fip = ((13.0 * hr + 3.0 * (bb + hbp) - 2.0 * so) / max(ip, 1.0)) + lg["fip_c"]
    fip_minus = 100.0 * (fip / max(lg["lg_era"], 0.001))
    era_minus = 100.0 * (era / max(lg["lg_era"], 0.001))
    k_pct = (so / max(tbf, 1)) * 100.0
    bb_pct = (bb / max(tbf, 1)) * 100.0
    k_bb_pct = k_pct - bb_pct
    k_bb = so - bb
    k9 = (so * 9.0) / max(ip, 1.0)
    bb9 = (bb * 9.0) / max(ip, 1.0)
    hr9 = (hr * 9.0) / max(ip, 1.0)

    return {
        "g": g, "gs": gs, "cg": cg, "sho": sho, "w": w, "l": l, "sv": sv, "hld": hld,
        "ip": round(ip, 1), "tbf": tbf, "h": h, "hr": hr, "bb": bb, "hbp": hbp, "so": so,
        "er": er, "era": era, "age": age,
        "fip": round(fip, 2),
        "fip_minus": round(fip_minus, 1),
        "era_minus": round(era_minus, 1),
        "k_pct": round(k_pct, 1),
        "bb_pct": round(bb_pct, 1),
        "k_bb_pct": round(k_bb_pct, 1),
        "k_bb": k_bb,
        "k9": round(k9, 2),
        "bb9": round(bb9, 2),
        "hr9": round(hr9, 2)
    }

def main():
    print(">>> 1. Loading league info & fielding cache...")
    leagues_path = os.path.join(BASE_DIR, "site", "data", "leagues.json")
    with open(leagues_path, "r", encoding="utf-8") as fp:
        leagues_list = json.load(fp)
    leagues_map = {l["year"]: l for l in leagues_list}

    fielding_cache_path = os.path.join(BASE_DIR, "data", "fielding_cache.json")
    fielding_db = {}
    if os.path.exists(fielding_cache_path):
        with open(fielding_cache_path, "r", encoding="utf-8") as fp:
            fielding_db = json.load(fp)

    print(">>> 2. Building qualified player sets from year pages (1950-2025)...")
    qual_batters = set()
    qual_pitchers = set()

    for year in range(1950, 2026):
        data = scrape_year_data(year)
        if not data: continue
        for lg in ['cl', 'pl']:
            if not data.get(lg): continue
            for r in data[lg]['ind_bat'][1:]:
                qual_batters.add((year, normalize_name(r['text'][1])))
            for r in data[lg]['ind_pitch'][1:]:
                qual_pitchers.add((year, normalize_name(r['text'][1])))

    print(f"  Loaded {len(qual_batters)} qualified batter seasons, {len(qual_pitchers)} qualified pitcher seasons.")

    print("\n>>> 3. Collecting team pages and parsing players (PA >= 150, IP >= 30.0)...")
    all_team_urls = []
    for year in range(1950, 2026):
        year_cache = os.path.join(CACHE_DIR, f'year_{year}.html')
        if os.path.exists(year_cache):
            with open(year_cache, 'r', encoding='utf-8', errors='ignore') as fp:
                text = fp.read()
            links = re.findall(r'href=[\'"](.*?)[\'"]', text)
            for l in links:
                l = l.strip().lstrip('/')
                m = re.match(r'^([0-9]{4})/([a-z0-9_-]+)\.html$', l)
                if m and int(m.group(1)) == year:
                    pname = m.group(2)
                    if pname not in ['stats', 'allstar'] and not pname.isdigit():
                        all_team_urls.append(l)
    all_team_urls = list(dict.fromkeys(all_team_urls))
    print(f"  Found {len(all_team_urls)} team pages across 76 seasons.")

    raw_batters = []
    raw_pitchers = []
    seen_batter_keys = set()
    seen_pitcher_keys = set()

    t0 = time.time()
    for idx, t_url in enumerate(all_team_urls):
        if (idx + 1) % 150 == 0 or idx == len(all_team_urls) - 1:
            print(f"  Processing team page {idx+1}/{len(all_team_urls)}: {t_url} (elapsed: {time.time()-t0:.1f}s)...", flush=True)

        year = int(t_url.split('/')[0])
        team_name, league = resolve_team(t_url)
        content = fetch_team_page(t_url)
        if not content: continue

        tables = re.findall(r'<table.*?>.*?</table>', content, re.I | re.S)
        bat_rows = None
        pitch_rows = None

        for tbl in tables:
            rows = re.findall(r'<tr.*?>.*?</tr>', tbl, re.I | re.S)
            if not rows: continue
            r0 = [re.sub(r'<.*?>', '', c).strip() for c in re.findall(r'<t[hd].*?>(.*?)</t[hd]>', rows[0], re.I | re.S)]
            h_str = " ".join(r0)
            if "打席" in h_str and "打数" in h_str and "選手名" in h_str:
                bat_rows = rows
            elif "登板" in h_str and "投球回" in h_str and "選手名" in h_str:
                pitch_rows = rows

        # 打者抽出 (PA >= 150)
        if bat_rows:
            r0 = [re.sub(r'<.*?>', '', c).strip() for c in re.findall(r'<t[hd].*?>(.*?)</t[hd]>', bat_rows[0], re.I | re.S)]
            col_map = {col.strip(): i for i, col in enumerate(r0)}
            for r in bat_rows[1:]:
                cells = [re.sub(r'<.*?>', '', c).strip() for c in re.findall(r'<t[hd].*?>(.*?)</t[hd]>', r, re.I | re.S)]
                raw_cells = re.findall(r'<t[hd].*?>(.*?)</t[hd]>', r, re.I | re.S)
                if len(cells) >= 15 and cells[0].isdigit():
                    row_data = parse_team_batter_row(cells, col_map)
                    if row_data["pa"] >= 150:
                        b_key = (year, team_name, normalize_name(row_data["name"]))
                        if b_key in seen_batter_keys: continue
                        seen_batter_keys.add(b_key)

                        link_m = re.search(r'href=[\'"](.*?)[\'"]', raw_cells[col_map.get("選手名", 1)]) if col_map.get("選手名", 1) < len(raw_cells) else None
                        p_link = link_m.group(1).replace('../', '') if link_m else ""
                        raw_batters.append({
                            "year": year, "league": league, "team": team_name,
                            "player_url": p_link, "row_data": row_data
                        })

        # 投手抽出 (IP >= 30.0)
        if pitch_rows:
            r0 = [re.sub(r'<.*?>', '', c).strip() for c in re.findall(r'<t[hd].*?>(.*?)</t[hd]>', pitch_rows[0], re.I | re.S)]
            col_map = {col.strip(): i for i, col in enumerate(r0)}
            for r in pitch_rows[1:]:
                cells = [re.sub(r'<.*?>', '', c).strip() for c in re.findall(r'<t[hd].*?>(.*?)</t[hd]>', r, re.I | re.S)]
                raw_cells = re.findall(r'<t[hd].*?>(.*?)</t[hd]>', r, re.I | re.S)
                if len(cells) >= 15 and cells[0].isdigit():
                    row_data = parse_team_pitcher_row(cells, col_map)
                    if row_data["ip"] >= 30.0:
                        p_key = (year, team_name, normalize_name(row_data["name"]))
                        if p_key in seen_pitcher_keys: continue
                        seen_pitcher_keys.add(p_key)

                        link_m = re.search(r'href=[\'"](.*?)[\'"]', raw_cells[col_map.get("選手名", 1)]) if col_map.get("選手名", 1) < len(raw_cells) else None
                        p_link = link_m.group(1).replace('../', '') if link_m else ""
                        raw_pitchers.append({
                            "year": year, "league": league, "team": team_name,
                            "player_url": p_link, "row_data": row_data
                        })

    print(f"  Extracted total batters (PA >= 150): {len(raw_batters)}")
    print(f"  Extracted total pitchers (IP >= 30.0): {len(raw_pitchers)}")

    print("\n>>> 4. Computing sabermetrics & pawa evaluations...")
    # 各年度・各守備位置の平均RF・平均守備率を集計
    yearly_pos_totals = defaultdict(lambda: {"g": 0, "po": 0, "a": 0, "e": 0})
    for b in raw_batters:
        u = b["player_url"].strip().lstrip("/")
        p_data = fielding_db.get(u, {})
        y_str = str(b["year"])
        if y_str in p_data:
            for pos, st in p_data[y_str].items():
                k = (b["year"], pos)
                yearly_pos_totals[k]["g"] += st["g"]
                yearly_pos_totals[k]["po"] += st["po"]
                yearly_pos_totals[k]["a"] += st["a"]
                yearly_pos_totals[k]["e"] += st["e"]

    # 打者計算
    final_batters = []
    for b in raw_batters:
        year = b["year"]
        row_data = b["row_data"]
        name = row_data["name"]
        lg_info = leagues_map.get(year, {})
        lg_league = lg_info.get("cl" if b["league"] == "セ" else "pl", {})
        if not lg_league:
            lg_league = lg_info.get("cl", {})

        metrics = calc_batter_sabermetrics(row_data, lg_league)
        u = b["player_url"].strip().lstrip("/")
        p_data = fielding_db.get(u, {})
        y_str = str(year)

        # 守備位置の判定
        pos_match = re.search(r'\(([投捕一二三遊外左中右指])\)', row_data["pos_tag"])
        primary_pos = pos_match.group(1) if pos_match else "外"
        if primary_pos in ["左", "中", "右"]: primary_pos = "外"

        f_info = {"primary_pos": primary_pos, "rf": 0.0, "rrf": 100.0, "fpct": 0.0, "avg_fpct": 0.0}
        if y_str in p_data and p_data[y_str]:
            best_pos = None
            max_g = -1
            for pos, st in p_data[y_str].items():
                if st["g"] > max_g:
                    max_g = st["g"]
                    best_pos = pos
            if best_pos:
                st = p_data[y_str][best_pos]
                k = (year, best_pos)
                tot = yearly_pos_totals[k]
                avg_rf = (tot["po"] + tot["a"]) / max(tot["g"], 1)
                avg_fpct = (tot["po"] + tot["a"]) / max(tot["po"] + tot["a"] + tot["e"], 1)
                p_rf = (st["po"] + st["a"]) / max(st["g"], 1)
                rrf = (p_rf / max(avg_rf, 0.001)) * 100.0 if avg_rf > 0 else 100.0
                f_info = {
                    "primary_pos": best_pos, "rf": p_rf, "rrf": rrf,
                    "fpct": st["fpct"], "avg_fpct": avg_fpct
                }

        pawa = eval_batter_pawa(metrics, lg_league, f_info["primary_pos"], f_info)
        is_qual = (year, normalize_name(name)) in qual_batters

        final_batters.append({
            "year": year, "league": b["league"], "team": b["team"], "name": name,
            "is_qual": is_qual,
            **metrics, **pawa,
            "player_url": b["player_url"]
        })

    # 投手計算
    final_pitchers = []
    for p in raw_pitchers:
        year = p["year"]
        row_data = p["row_data"]
        name = row_data["name"]
        lg_info = leagues_map.get(year, {})
        lg_league = lg_info.get("cl" if p["league"] == "セ" else "pl", {})
        if not lg_league:
            lg_league = lg_info.get("cl", {})

        metrics = calc_pitcher_sabermetrics(row_data, lg_league)
        pawa = eval_pitcher_pawa(metrics, lg_league)
        is_qual = (year, normalize_name(name)) in qual_pitchers

        final_pitchers.append({
            "year": year, "league": p["league"], "team": p["team"], "name": name,
            "is_qual": is_qual,
            **metrics, **pawa,
            "player_url": p["player_url"]
        })

    print(f"\n>>> 5. Saving JSON and CSV outputs...")
    # ソート (年度降順, 打者はOPS+降順, 投手はFIP-昇順)
    final_batters.sort(key=lambda x: (x["year"], x["ops_plus"]), reverse=True)
    final_pitchers.sort(key=lambda x: (x["year"], -x["fip_minus"]), reverse=True)

    site_batters_json = os.path.join(BASE_DIR, "site", "data", "batters.json")
    site_pitchers_json = os.path.join(BASE_DIR, "site", "data", "pitchers.json")
    data_batters_json = os.path.join(BASE_DIR, "data", "processed", "batters.json")
    data_pitchers_json = os.path.join(BASE_DIR, "data", "processed", "pitchers.json")

    with open(site_batters_json, "w", encoding="utf-8") as fp:
        json.dump(final_batters, fp, ensure_ascii=False, indent=2)
    with open(data_batters_json, "w", encoding="utf-8") as fp:
        json.dump(final_batters, fp, ensure_ascii=False, indent=2)

    with open(site_pitchers_json, "w", encoding="utf-8") as fp:
        json.dump(final_pitchers, fp, ensure_ascii=False, indent=2)
    with open(data_pitchers_json, "w", encoding="utf-8") as fp:
        json.dump(final_pitchers, fp, ensure_ascii=False, indent=2)

    site_batters_csv = os.path.join(BASE_DIR, "site", "data", "batters.csv")
    site_pitchers_csv = os.path.join(BASE_DIR, "site", "data", "pitchers.csv")
    data_batters_csv = os.path.join(BASE_DIR, "data", "processed", "batters.csv")
    data_pitchers_csv = os.path.join(BASE_DIR, "data", "processed", "pitchers.csv")

    if final_batters:
        keys_b = list(final_batters[0].keys())
        for path in [site_batters_csv, data_batters_csv]:
            with open(path, "w", encoding="utf-8-sig", newline="") as fp:
                w = csv.DictWriter(fp, fieldnames=keys_b)
                w.writeheader()
                w.writerows(final_batters)

    if final_pitchers:
        keys_p = list(final_pitchers[0].keys())
        for path in [site_pitchers_csv, data_pitchers_csv]:
            with open(path, "w", encoding="utf-8-sig", newline="") as fp:
                w = csv.DictWriter(fp, fieldnames=keys_p)
                w.writeheader()
                w.writerows(final_pitchers)

    print(f"\n[COMPLETE] Successfully generated datasets!")
    print(f"  Total Batters (PA >= 150): {len(final_batters)} (Qual: {sum(1 for b in final_batters if b['is_qual'])})")
    print(f"  Total Pitchers (IP >= 30.0): {len(final_pitchers)} (Qual: {sum(1 for p in final_pitchers if p['is_qual'])})")

if __name__ == "__main__":
    main()
