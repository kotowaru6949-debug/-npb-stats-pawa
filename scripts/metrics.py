"""
セイバーメトリクス計算モジュール
OPS+, FIP, FIP-, K-BB%, wSB 等を算出する。
欠損値（ハイフン等）や古い時代の特殊表記にも堅牢に対応。
"""

from typing import Dict, List, Any
from scraper import parse_ip

def safe_float(val: Any, default: float = 0.0) -> float:
    if val is None:
        return default
    s = str(val).strip()
    if s in ("", "-", "--", "---", "*"):
        return default
    try:
        return float(s)
    except (ValueError, TypeError):
        return default

def safe_int(val: Any, default: int = 0) -> int:
    if val is None:
        return default
    s = str(val).strip()
    if s in ("", "-", "--", "---", "*"):
        return default
    try:
        return int(float(s))
    except (ValueError, TypeError):
        return default

def get_cell(row_list: List[str], idx: int, default: str = "") -> str:
    if 0 <= idx < len(row_list):
        return row_list[idx]
    return default

def calc_league_aggregates(team_bat_rows: List[Dict[str, Any]], team_pitch_rows: List[Dict[str, Any]]) -> Dict[str, float]:
    """各リーグのチーム合計からリーグ環境（平均値）を算出"""
    # 打撃集計 (Row 0 is header)
    total_ab = sum(safe_float(get_cell(r["text"], 3)) for r in team_bat_rows[1:])
    total_h = sum(safe_float(get_cell(r["text"], 5)) for r in team_bat_rows[1:])
    total_2b = sum(safe_float(get_cell(r["text"], 6)) for r in team_bat_rows[1:])
    total_3b = sum(safe_float(get_cell(r["text"], 7)) for r in team_bat_rows[1:])
    total_hr = sum(safe_float(get_cell(r["text"], 8)) for r in team_bat_rows[1:])
    total_tb = sum(safe_float(get_cell(r["text"], 9)) for r in team_bat_rows[1:])
    total_sf = sum(safe_float(get_cell(r["text"], 14)) for r in team_bat_rows[1:])
    total_bb = sum(safe_float(get_cell(r["text"], 15)) for r in team_bat_rows[1:])
    total_hbp = sum(safe_float(get_cell(r["text"], 17)) for r in team_bat_rows[1:])
    total_so = sum(safe_float(get_cell(r["text"], 18)) for r in team_bat_rows[1:])

    lg_avg = total_h / max(total_ab, 1.0)
    denom_obp = total_ab + total_bb + total_hbp + total_sf
    lg_obp = (total_h + total_bb + total_hbp) / max(denom_obp, 1.0)
    lg_slg = total_tb / max(total_ab, 1.0)
    lg_ops = lg_obp + lg_slg
    lg_isop = lg_slg - lg_avg

    # 投手集計
    total_ip = sum(parse_ip(get_cell(r["text"], 9)) for r in team_pitch_rows[1:])
    total_tbf = sum(safe_float(get_cell(r["text"], 10)) for r in team_pitch_rows[1:])
    total_p_hr = sum(safe_float(get_cell(r["text"], 13)) for r in team_pitch_rows[1:])
    total_p_bb = sum(safe_float(get_cell(r["text"], 14)) for r in team_pitch_rows[1:])
    total_p_hbp = sum(safe_float(get_cell(r["text"], 15)) for r in team_pitch_rows[1:])
    total_p_so = sum(safe_float(get_cell(r["text"], 16)) for r in team_pitch_rows[1:])
    total_er = sum(safe_float(get_cell(r["text"], 20)) for r in team_pitch_rows[1:])

    lg_era = (total_er * 9.0) / max(total_ip, 1.0)
    # FIP 定数 C (リーグ全体のFIP期待値とERAが一致するように調整)
    fip_c = lg_era - ((13.0 * total_p_hr + 3.0 * (total_p_bb + total_p_hbp) - 2.0 * total_p_so) / max(total_ip, 1.0))

    lg_k_pct = (total_p_so / max(total_tbf, 1.0)) * 100.0
    lg_bb_pct = (total_p_bb / max(total_tbf, 1.0)) * 100.0
    lg_hr_pct = (total_p_hr / max(total_tbf, 1.0)) * 100.0

    return {
        "lg_avg": lg_avg,
        "lg_obp": lg_obp,
        "lg_slg": lg_slg,
        "lg_ops": lg_ops,
        "lg_isop": lg_isop,
        "lg_era": lg_era,
        "fip_c": fip_c,
        "total_ip": total_ip,
        "lg_k_pct": round(lg_k_pct, 2),
        "lg_bb_pct": round(lg_bb_pct, 2),
        "lg_hr_pct": round(lg_hr_pct, 2)
    }

def calc_batter_metrics(cells: List[str], lg: Dict[str, float]) -> Dict[str, Any]:
    """打者のセイバー指標を算出"""
    g = safe_int(get_cell(cells, 3))
    pa = safe_int(get_cell(cells, 4))
    ab = safe_int(get_cell(cells, 5))
    r = safe_int(get_cell(cells, 6))
    h = safe_int(get_cell(cells, 7))
    b2 = safe_int(get_cell(cells, 8))
    b3 = safe_int(get_cell(cells, 9))
    hr = safe_int(get_cell(cells, 10))
    tb = safe_int(get_cell(cells, 11))
    rbi = safe_int(get_cell(cells, 12))
    sb = safe_int(get_cell(cells, 13))
    cs = safe_int(get_cell(cells, 14))
    sh = safe_int(get_cell(cells, 15))
    sf = safe_int(get_cell(cells, 16))
    bb = safe_int(get_cell(cells, 17))
    hbp = safe_int(get_cell(cells, 19))
    so = safe_int(get_cell(cells, 20))
    gdp = safe_int(get_cell(cells, 21))
    e = safe_int(get_cell(cells, 22))
    avg = safe_float(get_cell(cells, 23))
    obp = safe_float(get_cell(cells, 24))
    slg = safe_float(get_cell(cells, 25))
    ops = safe_float(get_cell(cells, 26))
    age = safe_int(get_cell(cells, 27))

    # 出塁率・長打率が空の場合の再計算補正（1950年代初期等）
    if obp == 0.0 and (ab + bb + hbp + sf) > 0:
        obp = (h + bb + hbp) / max(ab + bb + hbp + sf, 1)
    if slg == 0.0 and ab > 0 and tb > 0:
        slg = tb / ab
    if ops == 0.0:
        ops = obp + slg

    # セイバー時代補正指標 (100が平均)
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
    # wSB (走塁得点貢献)
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

def calc_pitcher_metrics(cells: List[str], lg: Dict[str, float]) -> Dict[str, Any]:
    """投手のセイバー指標を算出"""
    g = safe_int(get_cell(cells, 3))
    gs = safe_int(get_cell(cells, 4))
    cg = safe_int(get_cell(cells, 6))
    sho = safe_int(get_cell(cells, 7))
    w = safe_int(get_cell(cells, 9))
    l = safe_int(get_cell(cells, 10))
    sv = safe_int(get_cell(cells, 11))
    hld = safe_int(get_cell(cells, 12))
    ip = parse_ip(get_cell(cells, 13))
    tbf = safe_int(get_cell(cells, 14))
    h = safe_int(get_cell(cells, 16))
    hr = safe_int(get_cell(cells, 17))
    bb = safe_int(get_cell(cells, 18))
    hbp = safe_int(get_cell(cells, 19))
    so = safe_int(get_cell(cells, 20))
    er = safe_int(get_cell(cells, 24))
    era = safe_float(get_cell(cells, 25))
    age = safe_int(get_cell(cells, 27))

    # FIP
    fip = ((13.0 * hr + 3.0 * (bb + hbp) - 2.0 * so) / max(ip, 1.0)) + lg["fip_c"]
    # FIP- (100が平均、低いほど優秀)
    fip_minus = 100.0 * (fip / max(lg["lg_era"], 0.001))
    era_minus = 100.0 * (era / max(lg["lg_era"], 0.001))
    k_pct = (so / max(tbf, 1)) * 100.0
    bb_pct = (bb / max(tbf, 1)) * 100.0
    hr_pct = (hr / max(tbf, 1)) * 100.0
    k_bb_pct = k_pct - bb_pct
    k_bb = so - bb

    lg_k = lg.get("lg_k_pct", 19.0)
    lg_bb = lg.get("lg_bb_pct", 7.5)
    lg_hr = lg.get("lg_hr_pct", 2.0)
    k_pct_plus = 100.0 * (k_pct / max(lg_k, 0.001))
    bb_pct_minus = 100.0 * (bb_pct / max(lg_bb, 0.001))
    hr_pct_minus = 100.0 * (hr_pct / max(lg_hr, 0.001))

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
        "hr_pct": round(hr_pct, 2),
        "k_bb_pct": round(k_bb_pct, 1),
        "k_pct_plus": round(k_pct_plus, 1),
        "bb_pct_minus": round(bb_pct_minus, 1),
        "hr_pct_minus": round(hr_pct_minus, 1),
        "k_bb": k_bb,
        "k9": round(k9, 2),
        "bb9": round(bb9, 2),
        "hr9": round(hr9, 2)
    }
