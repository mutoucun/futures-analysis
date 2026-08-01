# -*- coding: utf-8 -*-
"""
豆粕09 / 菜粕09 数据合并清洗脚本
================================
豆粕 M：新浪源 m1909~m2609（2019-2026；更早合约已退市，新浪/腾讯/和讯均无，
        大商所官网被 WAF 拦截，故历史从 2019 起）
菜粕 RM：郑商所官网 2013-2019（fetch_rm_history.py 已提取）+ 新浪源 2020-2026

清洗规则（与螺纹钢09一致）：
  - 交割月 artifact：交割月前几日成交量=0、收盘价冻结 → 截断到最后有成交日
  - 检查窗口内缺失交易日
输出：
  raw/m09_merged.json   {reports, series: {code: {deliveryYear, rows}}}
  raw/rm09_merged.json  同上
"""
import json
import os
import time

import akshare as ak

HERE = os.path.dirname(os.path.abspath(__file__))
RAW_DIR = os.path.join(HERE, "..", "raw")

import akshare.futures.futures_daily_bar as fdb
TRADE_CALENDAR = sorted(fdb.calendar)  # 'YYYYMMDD'


def fmt(day8):
    return f"{day8[0:4]}-{day8[4:6]}-{day8[6:8]}"


def fetch_sina_with_volume(code):
    """新浪按合约直取，返回 [{date, close, volume}]"""
    df = ak.futures_zh_daily_sina(symbol=code)
    if df is None or df.empty:
        return []
    df = df[["date", "close", "volume"]].copy()
    df["date"] = df["date"].astype(str).str.slice(0, 10)
    df["close"] = df["close"].astype(float)
    df["volume"] = df["volume"].fillna(0).astype(float).astype(int)
    df = df.sort_values("date").drop_duplicates("date")
    return [{"date": r.date, "close": r.close, "volume": r.volume} for r in df.itertuples()]


def analyze_contract(code, rows):
    """质量分析：返回 (截断后rows, 报告dict)"""
    if not rows:
        return [], None
    # 郑商所源存在 close<=0 的异常行（如 rm609 末日 volume=56/close=0），
    # 先整体剔除，否则纯成交量截断会让 0 价残留污染年末收盘
    invalid_close = [r for r in rows if not (r.get("close") and r["close"] > 0)]
    rows = [r for r in rows if r.get("close") and r["close"] > 0]
    last_active_idx = -1
    for i, r in enumerate(rows):
        if r.get("volume", 0) and r["volume"] > 0:
            last_active_idx = i
    dead_days = len(rows) - 1 - last_active_idx if last_active_idx >= 0 else len(rows)
    truncated = rows[: last_active_idx + 1] if last_active_idx >= 0 else []

    missing = []
    if truncated:
        start8 = truncated[0]["date"].replace("-", "")
        end8 = truncated[-1]["date"].replace("-", "")
        have = {r["date"].replace("-", "") for r in truncated}
        for day in TRADE_CALENDAR:
            if start8 <= day <= end8 and day not in have:
                missing.append(fmt(day))

    report = {
        "raw_rows": len(rows) + len(invalid_close),
        "invalid_close_rows": [r["date"] for r in invalid_close],
        "active_rows": len(truncated),
        "dead_tail_days": dead_days,
        "raw_last_close": (rows[-1]["close"] if rows else None),
        "active_last_close": truncated[-1]["close"] if truncated else None,
        "missing_trade_days": missing,
    }
    return truncated, report


def process(tasks, czce_part=None):
    """tasks: [(code_key, sina_symbol 或 None, deliveryYear, source)] 返回 {reports, series}"""
    merged = {}
    reports = {}
    for code_key, sina_symbol, delivery_year, source in tasks:
        if source == "sina":
            rows = fetch_sina_with_volume(sina_symbol)
            time.sleep(0.5)
        else:
            rows = (czce_part or {}).get(code_key, [])

        truncated, report = analyze_contract(code_key, rows)
        merged[code_key] = {"deliveryYear": delivery_year, "rows": truncated}
        if report:
            reports[code_key] = {"source": source, **report}
            miss = report["missing_trade_days"]
            inv = report["invalid_close_rows"]
            raw_last = report["raw_last_close"]
            act_last = report["active_last_close"]
            print(
                f"  [{code_key}] ({source}) 原始{report['raw_rows']:4d}条 -> 有效{report['active_rows']:4d}条 | "
                f"剔除close<=0 {len(inv)} 条 | 交割冻结尾部 {report['dead_tail_days']} 天 "
                f"(冻结价 {raw_last if raw_last is not None else '-'} -> 真实末日收 {act_last if act_last is not None else '-'}) | "
                f"缺失交易日 {len(miss)} 天"
            )
            if inv:
                print(f"      close<=0: {', '.join(inv)}")
            if miss:
                print(f"      缺失: {', '.join(miss[:10])}{' ...' if len(miss) > 10 else ''}")
        else:
            print(f"  [{code_key}] 无数据")
    return {"reports": reports, "series": merged}


def main():
    # ---- 豆粕 M：2019-2026 全部来自新浪（DCE 合约代码 m + 4位YYMM） ----
    print("=" * 70)
    print("豆粕09（M）2019-2026 · 新浪源")
    print("=" * 70)
    m_tasks = []
    for year in range(2019, 2027):
        yy = str(year % 100).zfill(2)
        m_tasks.append((f"m{yy}09", f"m{yy}09", year, "sina"))
    m_merged = process(m_tasks)
    m_path = os.path.join(RAW_DIR, "m09_merged.json")
    with open(m_path, "w", encoding="utf-8") as f:
        json.dump(m_merged, f, ensure_ascii=False)
    print(f"豆粕合计 {sum(len(v['rows']) for v in m_merged['series'].values())} 条 -> {m_path}\n")

    # ---- 菜粕 RM：2013-2019 郑商所 + 2020-2026 新浪 ----
    print("=" * 70)
    print("菜粕09（RM）2013-2019 郑商所 + 2020-2026 新浪")
    print("=" * 70)
    czce_path = os.path.join(RAW_DIR, "rm09_czce_2013_2019.json")
    with open(czce_path, encoding="utf-8") as f:
        czce_part = json.load(f)

    rm_tasks = []
    for year in range(2013, 2020):
        rm_tasks.append((f"rm{year % 10}09", None, year, "czce"))
    for year in range(2020, 2027):
        yy = str(year % 100).zfill(2)
        rm_tasks.append((f"rm{yy}09", f"RM{yy}09", year, "sina"))
    rm_merged = process(rm_tasks, czce_part)
    rm_path = os.path.join(RAW_DIR, "rm09_merged.json")
    with open(rm_path, "w", encoding="utf-8") as f:
        json.dump(rm_merged, f, ensure_ascii=False)
    print(f"菜粕合计 {sum(len(v['rows']) for v in rm_merged['series'].values())} 条 -> {rm_path}")


if __name__ == "__main__":
    main()
