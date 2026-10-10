"""
パワプロ風能力査定モジュール
スタッツとセイバーメトリクス指標から 1〜100 (G〜S) の能力値をロジカルに算出する。
"""

from typing import Dict, Any

def score_to_rank(score: int) -> str:
    """1〜100の数値をパワプロのG〜Sランクに変換"""
    if score >= 90: return "S"
    if score >= 80: return "A"
    if score >= 70: return "B"
    if score >= 60: return "C"
    if score >= 50: return "D"
    if score >= 40: return "E"
    if score >= 20: return "F"
    return "G"

def eval_batter_pawa(stats: Dict[str, Any], lg: Dict[str, float], position: str) -> Dict[str, Any]:
    """打者のパワプロ能力（ミート、パワー、走力、守備力）を査定"""
    avg = stats["avg"]
    hr = stats["hr"]
    sb = stats["sb"]
    cs = stats["cs"]
    b3 = stats["3b"]
    gdp = stats["gdp"]
    pa = stats["pa"]
    isop = stats["isop"]
    k_pct = stats["k_pct"]
    e = stats["e"]

    # 1. ミート (1〜99)
    # リーグ平均打率（.240〜.250）で約52点
    # .300で72点(B), .330で83点(A), .360で93点(S)
    diff_avg = avg - lg["lg_avg"]
    meet_score = 52.0 + (diff_avg * 350.0) + (max(0.0, 18.0 - k_pct) * 0.4)
    meet = int(min(max(round(meet_score), 15), 99))

    # 2. パワー (1〜99)
    # 本塁打数と純長打力(IsoP)の複合
    # 40本超で88+, 30本で80+, 20本で70+, 10本で58+
    rel_isop = isop / max(lg["lg_isop"], 0.01)
    power_score = 35.0 + (hr * 1.25) + (rel_isop * 15.0)
    power = int(min(max(round(power_score), 15), 99))

    # 3. 走力 (1〜99)
    # 盗塁数、三塁打、併打率から算出
    # 40盗塁以上で90+(S), 25盗塁で80+(A), 15盗塁で70+(B), 5盗塁で55+(D)
    gdp_penalty = (gdp / max(pa, 1)) * 120.0
    speed_score = 50.0 + (sb * 1.25) - (cs * 0.8) + (b3 * 2.5) - gdp_penalty
    speed = int(min(max(round(speed_score), 18), 99))

    # 4. 守備力 (1〜99)
    # 主守備位置の基礎点 + 失策・実力補正
    pos_base = {
        "遊": 72, "捕": 68, "二": 65, "中": 63,
        "三": 58, "左": 50, "右": 52, "外": 52,
        "一": 45, "指": 25, "投": 50
    }
    base = pos_base.get(position, 50)
    # 失策による減点（失策少なければボーナス）
    error_adjustment = max(-15.0, min(10.0, 6.0 - (e * 0.8)))
    defense_score = base + error_adjustment
    defense = int(min(max(round(defense_score), 20), 96))

    return {
        "meet": meet, "meet_rank": score_to_rank(meet),
        "power": power, "power_rank": score_to_rank(power),
        "speed": speed, "speed_rank": score_to_rank(speed),
        "defense": defense, "defense_rank": score_to_rank(defense),
        "primary_pos": position
    }

def eval_pitcher_pawa(stats: Dict[str, Any], lg: Dict[str, float]) -> Dict[str, Any]:
    """投手のパワプロ能力（コントロール、球威、スタミナ）を査定"""
    ip = stats["ip"]
    cg = stats["cg"]
    bb_pct = stats["bb_pct"]
    k_pct = stats["k_pct"]
    hr = stats["hr"]

    # 1. コントロール (1〜99)
    # リーグ平均 BB% (7.5%) で約58点
    # BB% 3.0%未満で90+(S), 4.5%で82+(A), 6.0%で72+(B)
    ctrl_score = 95.0 - (bb_pct * 5.2)
    control = int(min(max(round(ctrl_score), 15), 99))

    # 2. 球威 / 奪三振力 (1〜99)
    # リーグ平均 K% (19%) で約60点
    # K% 28%以上で90+(S), 24%で80+(A), 20%で70+(B)
    hr_rate_penalty = (hr / max(ip, 1.0)) * 15.0
    stuff_score = 25.0 + (k_pct * 2.2) - hr_rate_penalty
    stuff = int(min(max(round(stuff_score), 15), 99))

    # 3. スタミナ (1〜99)
    # 投球回数と完投数から算出
    # 200回・完投多数で90+(S), 180回で83+(A), 150回で74+(B), 130回で65+(C)
    stam_score = 30.0 + (ip * 0.28) + (cg * 2.5)
    stamina = int(min(max(round(stam_score), 25), 99))

    return {
        "control": control, "control_rank": score_to_rank(control),
        "stuff": stuff, "stuff_rank": score_to_rank(stuff),
        "stamina": stamina, "stamina_rank": score_to_rank(stamina)
    }
