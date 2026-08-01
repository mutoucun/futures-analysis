# -*- coding: utf-8 -*-
"""
郑商所历史日线高速下载器（2013-2019 菜粕09合约）
================================================
新浪源只有近8年合约（菜粕 2020+），更早的数据从郑商所官网逐日接口拉取。
akshare 内置的 get_futures_daily(market='CZCE') 可用但串行逐日很慢；
本脚本用 线程池并行 + 逐日磁盘缓存 加速，且中断可断点续传。

只拉取每年 1-9 月（09合约的交割年窗口，季节性分析所需的全部数据）。

用法：
  python scripts/fetch_rm_history.py
输出：
  raw/czce_cache/YYYYMMDD.json   逐日原始缓存（断点续传用）
  raw/rm09_czce_2013_2019.json   提取后的历年合约日线 {code: [{date, close, volume}]}
"""
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

HERE = os.path.dirname(os.path.abspath(__file__))
RAW_DIR = os.path.join(HERE, "..", "raw")
CACHE_DIR = os.path.join(RAW_DIR, "czce_cache")

SYMBOL_UPPER = "RM"
CONTRACT_MONTH = "09"
START_YEAR = 2013   # 菜粕2012-12上市，首个09合约为RM309
END_YEAR = 2019     # 2020+ 已由新浪源覆盖

# akshare 内置交易日历（1990-2026），避免对非交易日发请求
import akshare.futures.futures_daily_bar as fdb
TRADE_CALENDAR = set(fdb.calendar)


def normalize_date(d):
    s = str(d).replace("-", "")[:8]
    return f"{s[0:4]}-{s[4:6]}-{s[6:8]}"


def fetch_one_day(day_str):
    """拉取单日郑商所全市场数据，带磁盘缓存。返回 (day_str, records 或 None)"""
    cache_path = os.path.join(CACHE_DIR, f"{day_str}.json")
    if os.path.exists(cache_path):
        try:
            with open(cache_path, encoding="utf-8") as f:
                return day_str, json.load(f)
        except Exception:
            pass  # 缓存损坏则重拉

    import akshare as ak
    for attempt in range(3):
        try:
            df = ak.get_futures_daily(start_date=day_str, end_date=day_str, market="CZCE")
            records = []
            if df is not None and not df.empty:
                for r in df[["symbol", "date", "close", "volume"]].itertuples(index=False):
                    close = r.close
                    if close in ("", None):
                        continue
                    records.append({
                        "symbol": str(r.symbol).strip(),
                        "date": normalize_date(r.date),
                        "close": float(close),
                        "volume": float(r.volume or 0),
                    })
            with open(cache_path, "w", encoding="utf-8") as f:
                json.dump(records, f, ensure_ascii=False)
            return day_str, records
        except Exception:
            time.sleep(1 + attempt)
    print(f"  [警告] {day_str} 重试3次仍失败，跳过")
    return day_str, None


def main():
    os.makedirs(CACHE_DIR, exist_ok=True)

    # 收集需要拉取的交易日子（每年仅 1-1 ~ 9-30 交割年窗口）
    days_needed = []
    for year in range(START_YEAR, END_YEAR + 1):
        for day in TRADE_CALENDAR:
            if day.startswith(str(year)):
                mmdd = day[4:]
                if "0101" <= mmdd <= "0930":
                    days_needed.append(day)
    days_needed.sort()
    cached = sum(1 for d in days_needed if os.path.exists(os.path.join(CACHE_DIR, f"{d}.json")))
    print(f"需拉取 {len(days_needed)} 个交易日（{START_YEAR}-{END_YEAR} 每年1-9月），已缓存 {cached} 个")

    t0 = time.time()
    day_data = {}
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(fetch_one_day, d): d for d in days_needed}
        done = 0
        for fut in as_completed(futures):
            day_str, records = fut.result()
            day_data[day_str] = records
            done += 1
            if done % 100 == 0:
                print(f"  进度 {done}/{len(days_needed)}  用时 {time.time()-t0:.0f}s")
    print(f"拉取完成，用时 {time.time()-t0:.0f}s")

    # 从缓存中逐年提取 RM{Y}09 收盘价（郑商所旧码为3位，如 RM309/RM909）
    result = {}
    for year in range(START_YEAR, END_YEAR + 1):
        code = f"{SYMBOL_UPPER}{year % 10}{CONTRACT_MONTH}"  # 如 RM309 / RM909
        rows_for_year = []
        for day in days_needed:
            if not day.startswith(str(year)):
                continue
            records = day_data.get(day)
            if not records:
                continue
            for rec in records:
                if rec["symbol"].upper() == code:
                    rows_for_year.append({
                        "date": rec["date"],
                        "close": rec["close"],
                        "volume": rec["volume"],
                    })
                    break
        rows_for_year.sort(key=lambda r: r["date"])
        result[code.lower()] = rows_for_year
        if rows_for_year:
            first, last = rows_for_year[0], rows_for_year[-1]
            print(f"  [{code}] {len(rows_for_year):4d} 条  {first['date']} ~ {last['date']}  末日收 {last['close']:.0f}")
        else:
            print(f"  [{code}] 无数据")

    out_path = os.path.join(RAW_DIR, "rm09_czce_2013_2019.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False)
    total = sum(len(v) for v in result.values())
    print(f"\n合计 {total} 条，已保存 {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
