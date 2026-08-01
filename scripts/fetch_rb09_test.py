# -*- coding: utf-8 -*-
"""
螺纹钢(RB) 09合约 历年日线数据拉取验证脚本（双数据源）
======================================================
背景：
  "螺纹钢09" 每年是一个独立上市合约（rb0909、rb1009 ... rb2609）。
  经验证：
    - 新浪源 futures_zh_daily_sina 只有近8年合约（2019起）
    - 上期所官网 get_futures_daily 可回溯到2009年上市，但需从全市场数据中过滤
  因此策略：优先新浪（按合约直取），空数据时回退上期所官网源。

用法：
  python scripts/fetch_rb09_test.py
输出：
  1. 控制台打印每个合约的数据条数、日期区间、首尾收盘价、数据来源
  2. 保存 raw/rb09_raw.json 供检查
"""
import json
import os
import time
import sys

import akshare as ak

HERE = os.path.dirname(os.path.abspath(__file__))
RAW_DIR = os.path.join(HERE, "..", "raw")

SYMBOL = "rb"          # 螺纹钢（上期所）
CONTRACT_MONTH = "09"  # 09 合约
START_YEAR = 2009      # 螺纹钢上市年份
END_YEAR = 2026        # 数据截止年


def normalize_date(d):
    """统一日期为 YYYY-MM-DD（新浪已是该格式，交易所为 YYYYMMDD）"""
    s = str(d).replace("-", "")[:8]
    return f"{s[0:4]}-{s[4:6]}-{s[6:8]}"


def fetch_from_sina(code):
    """新浪按合约直取，返回 [{date, close}] 或 None"""
    try:
        df = ak.futures_zh_daily_sina(symbol=code)
    except Exception:
        return None
    if df is None or df.empty:
        return None
    df = df[["date", "close"]].copy()
    df["date"] = df["date"].astype(str).str.slice(0, 10)
    df["close"] = df["close"].astype(float)
    df = df.sort_values("date").drop_duplicates("date")
    return [{"date": r.date, "close": r.close} for r in df.itertuples()]


def fetch_from_shfe(code, year):
    """
    上期所官网源：拉取合约完整生命周期（上年9月 ~ 本年9月）的全市场日线，
    过滤出目标合约。返回 [{date, close}] 或 None
    """
    start = f"{year - 1}0901"
    end = f"{year}0930"
    try:
        df = ak.get_futures_daily(start_date=start, end_date=end, market="SHFE")
    except Exception as e:
        print(f"    交易所源拉取失败: {type(e).__name__} {str(e)[:60]}")
        return None
    if df is None or df.empty:
        return None
    hit = df[df["symbol"] == code.upper()].copy()
    if hit.empty:
        return None
    hit = hit[["date", "close"]].copy()
    hit["date"] = hit["date"].apply(normalize_date)
    hit["close"] = hit["close"].astype(float)
    hit = hit.sort_values("date").drop_duplicates("date")
    return [{"date": r.date, "close": r.close} for r in hit.itertuples()]


def main():
    os.makedirs(RAW_DIR, exist_ok=True)
    result = {}
    meta = {}
    ok_count = 0

    for year in range(START_YEAR, END_YEAR + 1):
        yy = str(year % 100).zfill(2)
        code = f"{SYMBOL}{yy}{CONTRACT_MONTH}"  # 如 rb2409

        records = fetch_from_sina(code)
        source = "sina"
        if not records:
            records = fetch_from_shfe(code, year)
            source = "shfe"
            time.sleep(1)
        else:
            time.sleep(0.5)

        if records:
            ok_count += 1
            result[code] = records
            meta[code] = {"source": source, "rows": len(records)}
            first, last = records[0], records[-1]
            print(
                f"  [{code}] ({source:4s}) {len(records):4d} 条  "
                f"{first['date']} ~ {last['date']}  "
                f"首日收 {first['close']:.0f}  末日收 {last['close']:.0f}"
            )
        else:
            result[code] = []
            meta[code] = {"source": None, "rows": 0}
            print(f"  [{code}] 两个数据源均无数据")

    out_path = os.path.join(RAW_DIR, "rb09_raw.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"meta": meta, "series": result}, f, ensure_ascii=False)

    total = sum(len(v) for v in result.values())
    print(f"\n完成：{ok_count}/{END_YEAR - START_YEAR + 1} 个合约有数据，共 {total} 条日线")
    print(f"原始数据已保存: {out_path}")
    return 0 if ok_count > 0 else 1


if __name__ == "__main__":
    sys.exit(main())
