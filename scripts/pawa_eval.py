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

def eval_batter_pawa(stats: Dict[str, Any], lg: Dict[str, float], position: str, fielding_info: Dict[str, Any] = None) -> Dict[str, Any]:
    """打者のパワプロ能力（ミート、パワー、走力、守備力、捕球）を査定"""
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

    # 1. ミート (1〜99) : OBP+ (出塁率傑出度) を主軸にし、AVG+ (打率傑出度) をブレンド
    obp_plus = stats.get("obp_plus", 100.0)
    avg_plus = stats.get("avg_plus", 100.0)
    meet_score = 52.0 + (obp_plus - 100.0) * 0.55 + (avg_plus - 100.0) * 0.55
    meet = int(min(max(round(meet_score), 15), 99))

    # 2. パワー (1〜99) : ISO+ (純長打力傑出度) を主軸に査定
    isop_plus = stats.get("isop_plus", 100.0)
    power_score = 30.0 + (isop_plus * 0.25)
    power = int(min(max(round(power_score), 15), 99))

    # 3. 走力 (1〜99) : 盗塁数、三塁打、併打率から算出
    gdp_penalty = (gdp / max(pa, 1)) * 120.0
    speed_score = 50.0 + (sb * 1.25) - (cs * 0.8) + (b3 * 2.5) - gdp_penalty
    speed = int(min(max(round(speed_score), 18), 99))

    # 4. 守備力 (1〜99) : RRF (相対レンジファクター) 100% で査定（ポジション補正なし）
    # 同守備位置のリーグ平均RF (100) で 52点 (D)。アウト獲得能力・守備範囲を純粋評価。
    # 外野手はレフト・センター・ライトを合算した外野手全体で相対化。
    f_info = fielding_info or {}
    primary_pos = f_info.get("primary_pos", position)
    rrf = f_info.get("rrf", 100.0)
    rf = f_info.get("rf", 0.0)
    fpct = f_info.get("fpct", 0.0)
    avg_fpct = f_info.get("avg_fpct", 0.0)

    if primary_pos == "指":
        defense = 25
    elif primary_pos == "投":
        defense = 50
    else:
        def_score = 52.0 + (rrf - 100.0) * 2.3
        defense = int(min(max(round(def_score), 15), 99))

    # 5. 捕球 / エラー回避 (1〜99) : 守備率 (FPCT) 100% で査定
    # 同ポジションのリーグ平均守備率との差分から算出。ポロリや悪送球の少なさを評価。
    if primary_pos == "指":
        fielding = 30
    elif primary_pos == "投":
        fielding = 50
    elif avg_fpct > 0 and fpct > 0:
        delta_fpct = fpct - avg_fpct
        field_score = 52.0 + (delta_fpct * 1800.0)
        fielding = int(min(max(round(field_score), 15), 99))
    else:
        fielding = int(min(max(round(55.0 - (e * 1.2)), 20), 90))

    return {
        "meet": meet, "meet_rank": score_to_rank(meet),
        "power": power, "power_rank": score_to_rank(power),
        "speed": speed, "speed_rank": score_to_rank(speed),
        "defense": defense, "defense_rank": score_to_rank(defense),
        "fielding": fielding, "fielding_rank": score_to_rank(fielding),
        "primary_pos": primary_pos,
        "rf": round(rf, 3),
        "rrf": round(rrf, 1),
        "fpct": round(fpct, 3)
    }


def eval_pitcher_pawa(stats: Dict[str, Any], lg: Dict[str, float]) -> Dict[str, Any]:
    """投手のパワプロ能力（コントロール、球威、スタミナ）を査定"""
    ip = stats["ip"]
    cg = stats["cg"]
    bb_pct = stats["bb_pct"]
    k_pct = stats["k_pct"]
    hr = stats["hr"]

    # 1. コントロール (1〜99) : BB%- (与四球抑止力傑出度、100が平均) を主軸に査定
    # リーグ平均 (100) で約58点 (D)。50以下で80+(A), 25以下で87+(A〜S)
    bb_pct_minus = stats.get("bb_pct_minus", 100.0)
    ctrl_score = 96.0 - (bb_pct_minus * 0.38)
    control = int(min(max(round(ctrl_score), 15), 99))

    # 2. 球威 / 奪三振力 (1〜99) : K%+ (奪三振傑出度) と HR%- (被弾抑止傑出度) で査定
    # リーグ平均 (100) で約62点 (C)。K%+ 150+ で80+(A), 180+ で90+(S)
    # 被本塁打が平均より多ければ減点、少なければ加点
    k_pct_plus = stats.get("k_pct_plus", 100.0)
    hr_pct_minus = stats.get("hr_pct_minus", 100.0)
    stuff_score = 30.0 + (k_pct_plus * 0.32) - ((hr_pct_minus - 100.0) * 0.12)
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
