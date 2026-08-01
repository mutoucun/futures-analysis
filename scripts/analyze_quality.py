# -*- coding: utf-8 -*-
"""
数据质量分析 + 合并脚本
=======================
1. 重新拉取 2019-2026 新浪数据（含成交量列）
2. 合并 2009-2018 上期所数据（已含成交量）
3. 质量检查：
   - 交割月 artifact：交割月前几日成交量=0、收盘价冻结（虚高/虚低），
     需截断到"最后一个有成交的交易日"才是真实收盘
   - 检查各合约窗口内缺失交易日
4. 输出清洗后的 rb09_merged.json（每合约截断到有效成交末日）
"""
import json
import os
import time

import akshare as ak

HERE = os.path.dirname(os.path.abspath(__file__))
RAW_DIR = os.path.join(HERE, "..", "raw")

START_YEAR = 2009
END_YEAR = 2026
SINA_START = 2019  # 新浪源覆盖起点

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


def load_shfe_part():
    """读取上期所 2009-2018 提取结果（已含 volume）"""
    path = os.path.join(RAW_DIR, "rb09_shfe_2009_2018.json")
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def analyze_contract(code, rows):
    """质量分析：返回 (截断后rows, 报告dict)"""
    if not rows:
        return [], None
    # 最后一个有成交量的交易日
    last_active_idx = -1
    for i, r in enumerate(rows):
        if r.get("volume", 0) and r["volume"] > 0:
            last_active_idx = i
    dead_days = len(rows) - 1 - last_active_idx if last_active_idx >= 0 else len(rows)
    truncated = rows[: last_active_idx + 1] if last_active_idx >= 0 else []

    # 缺失交易日检查（合约窗口内、交割月前）
    missing = []
    if truncated:
        start8 = truncated[0]["date"].replace("-", "")
        end8 = truncated[-1]["date"].replace("-", "")
        have = {r["date"].replace("-", "") for r in truncated}
        for day in TRADE_CALENDAR:
            if start8 <= day <= end8 and day not in have:
                missing.append(fmt(day))

    report = {
        "raw_rows": len(rows),
        "active_rows": len(truncated),
        "dead_tail_days": dead_days,  # 交割冻结天数
        "raw_last_close": rows[-1]["close"],
        "active_last_close": truncated[-1]["close"] if truncated else None,
        "missing_trade_days": missing,
    }
    return truncated, report


def main():
    merged = {}
    reports = {}

    shfe_part = load_shfe_part()

    for year in range(START_YEAR, END_YEAR + 1):
        yy = str(year % 100).zfill(2)
        code = f"rb{yy}09"

        if year < SINA_START:
            rows = shfe_part.get(code, [])
            source = "shfe"
        else:
            rows = fetch_sina_with_volume(code)
            source = "sina"
            time.sleep(0.5)

        truncated, report = analyze_contract(code, rows)
        merged[code] = truncated
        if report:
            reports[code] = {"source": source, **report}
            miss = report["missing_trade_days"]
            print(
                f"  [{code}] ({source}) 原始{report['raw_rows']:4d}条 -> 有效{report['active_rows']:4d}条 | "
                f"交割冻结尾部 {report['dead_tail_days']} 天 "
                f"(冻结价 {report['raw_last_close']:.0f} -> 真实末日收 {report['active_last_close']:.0f}) | "
                f"缺失交易日 {len(miss)} 天"
            )
            if miss:
                print(f"      缺失: {', '.join(miss[:10])}{' ...' if len(miss) > 10 else ''}")
        else:
            print(f"  [{code}] 无数据")

    out_path = os.path.join(RAW_DIR, "rb09_merged.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"reports": reports, "series": merged}, f, ensure_ascii=False)

    total = sum(len(v) for v in merged.values())
    print(f"\n清洗后合计 {total} 条，已保存 {out_path}")


if __name__ == "__main__":
    main()
