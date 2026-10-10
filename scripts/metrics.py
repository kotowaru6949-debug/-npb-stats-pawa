"""
セイバーメトリクス計算モジュール
OPS+, FIP, FIP-, K-BB%, wSB 等を算出する。
"""

from typing import Dict, List, Any
from scraper import parse_ip

def calc_league_aggregates(team_bat_rows: List[Dict[str, Any]], team_pitch_rows: List[Dict[str, Any]]) -> Dict[str, float]:
    """各リーグのチーム合計からリーグ環境（平均値）を算出"""
    # 打撃集計 (Row 0 is header)
    total_ab = sum(float(r["text"][3]) for r in team_bat_rows[1:])
    total_h = sum(float(r["text"][5]) for r in team_bat_rows[1:])
    total_2b = sum(float(r["text"][6]) for r in team_bat_rows[1:])
    total_3b = sum(float(r["text"][7]) for r in team_bat_rows[1:])
    total_hr = sum(float(r["text"][8]) for r in team_bat_rows[1:])
    total_tb = sum(float(r["text"][9]) for r in team_bat_rows[1:])
    total_sf = sum(float(r["text"][14]) for r in team_bat_rows[1:])
    total_bb = sum(float(r["text"][15]) for r in team_bat_rows[1:])
    total_hbp = sum(float(r["text"][17]) for r in team_bat_rows[1:])
    total_so = sum(float(r["text"][18]) for r in team_bat_rows[1:])

    lg_avg = total_h / max(total_ab, 1.0)
    lg_obp = (total_h + total_bb + total_hbp) / max(total_ab + total_bb + total_hbp + total_sf, 1.0)
    lg_slg = total_tb / max(total_ab, 1.0)
    lg_ops = lg_obp + lg_slg
    lg_isop = lg_slg - lg_avg

    # 投手集計
    total_ip = sum(parse_ip(r["text"][9]) for r in team_pitch_rows[1:])
    total_tbf = sum(float(r["text"][10]) for r in team_pitch_rows[1:])
    total_p_hr = sum(float(r["text"][13]) for r in team_pitch_rows[1:])
    total_p_bb = sum(float(r["text"][14]) for r in team_pitch_rows[1:])
    total_p_hbp = sum(float(r["text"][15]) for r in team_pitch_rows[1:])
    total_p_so = sum(float(r["text"][16]) for r in team_pitch_rows[1:])
    total_er = sum(float(r["text"][20]) for r in team_pitch_rows[1:])

    lg_era = (total_er * 9.0) / max(total_ip, 1.0)
    # FIP 定数 C (リーグ全体のFIP期待値とERAが一致するように調整)
    fip_c = lg_era - ((13.0 * total_p_hr + 3.0 * (total_p_bb + total_p_hbp) - 2.0 * total_p_so) / max(total_ip, 1.0))

    return {
        "lg_avg": lg_avg,
        "lg_obp": lg_obp,
        "lg_slg": lg_slg,
        "lg_ops": lg_ops,
        "lg_isop": lg_isop,
        "lg_era": lg_era,
        "fip_c": fip_c,
        "total_ip": total_ip
    }

def calc_batter_metrics(cells: List[str], lg: Dict[str, float]) -> Dict[str, Any]:
    """打者のセイバー指標を算出"""
    g = int(cells[3])
    pa = int(cells[4])
    ab = int(cells[5])
    r = int(cells[6])
    h = int(cells[7])
    b2 = int(cells[8])
    b3 = int(cells[9])
    hr = int(cells[10])
    tb = int(cells[11])
    rbi = int(cells[12])
    sb = int(cells[13])
    cs = int(cells[14])
    sh = int(cells[15])
    sf = int(cells[16])
    bb = int(cells[17])
    hbp = int(cells[19])
    so = int(cells[20])
    gdp = int(cells[21])
    e = int(cells[22])
    avg = float(cells[23])
    obp = float(cells[24])
    slg = float(cells[25])
    ops = float(cells[26])
    age = int(cells[27])

    # OPS+ (Baseball-Reference方式: 100が平均)
    ops_plus = 100.0 * ((obp / max(lg["lg_obp"], 0.001)) + (slg / max(lg["lg_slg"], 0.001)) - 1.0)
    isop = slg - avg
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
        "isop": round(isop, 3),
        "isod": round(isod, 3),
        "k_pct": round(k_pct, 1),
        "bb_pct": round(bb_pct, 1),
        "bb_k": round(bb_k, 2),
        "sb_pct": round(sb_pct, 1),
        "wsb": round(wsb, 2)
    }

def calc_pitcher_metrics(cells: List[str], lg: Dict[str, float]) -> Dict[str, Any]:
    """投手のセイバー指標を算出"""
    g = int(cells[3])
    gs = int(cells[4])
    cg = int(cells[6])
    sho = int(cells[7])
    w = int(cells[9])
    l = int(cells[10])
    sv = int(cells[11])
    hld = int(cells[12])
    ip = parse_ip(cells[13])
    tbf = int(cells[14])
    h = int(cells[16])
    hr = int(cells[17])
    bb = int(cells[18])
    hbp = int(cells[19])
    so = int(cells[20])
    er = int(cells[24])
    era = float(cells[25])
    age = int(cells[27])

    # FIP
    fip = ((13.0 * hr + 3.0 * (bb + hbp) - 2.0 * so) / max(ip, 1.0)) + lg["fip_c"]
    # FIP- (100が平均、低いほど優秀)
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
