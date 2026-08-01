# -*- coding: utf-8 -*-
"""
上期所历史日线高速下载器（2009-2018 螺纹钢09合约）
==================================================
新浪源只有近8年合约，更早的数据只能从上期所官网逐日接口拉取。
akshare 内置的 get_futures_daily 是串行逐日，10年数据要1小时以上；
本脚本用 线程池并行 + 逐日磁盘缓存 加速到几分钟，且中断可断点续传。

只拉取每年 1-9 月（09合约的交割年窗口，季节性分析所需的全部数据）。

用法：
  python scripts/fetch_shfe_history.py
输出：
  raw/shfe_cache/kxYYYYMMDD.json  逐日原始缓存（断点续传用）
  raw/rb09_raw.json               合并后的完整验证数据（2009-2026）
"""
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests

HERE = os.path.dirname(os.path.abspath(__file__))
RAW_DIR = os.path.join(HERE, "..", "raw")
CACHE_DIR = os.path.join(RAW_DIR, "shfe_cache")

URL_TMPL = "https://www.shfe.com.cn/data/tradedata/future/dailydata/kx%s.dat"
HEADERS = {"User-Agent": "Mozilla/4.0 (compatible; MSIE 5.5; Windows NT)"}

SYMBOL_UPPER = "RB"
CONTRACT_MONTH = "09"
START_YEAR = 2009
END_YEAR = 2018   # 2019+ 已由新浪源覆盖

# akshare 内置交易日历（1990-2026），避免对非交易日发请求
import akshare.futures.futures_daily_bar as fdb
TRADE_CALENDAR = set(fdb.calendar)

session_local = {}


def get_session():
    import threading
    tid = threading.get_ident()
    if tid not in session_local:
        s = requests.Session()
        s.headers.update(HEADERS)
        session_local[tid] = s
    return session_local[tid]


def fetch_one_day(day_str):
    """拉取单日全市场数据，带磁盘缓存。返回 (day_str, json_dict 或 None)"""
    cache_path = os.path.join(CACHE_DIR, f"kx{day_str}.json")
    if os.path.exists(cache_path):
        try:
            with open(cache_path, encoding="utf-8") as f:
                return day_str, json.load(f)
        except Exception:
            pass  # 缓存损坏则重拉

    url = URL_TMPL % day_str
    for attempt in range(3):
        try:
            resp = get_session().get(url, timeout=15)
            if resp.status_code == 404:
                return day_str, None
            resp.raise_for_status()
            data = resp.json()
            with open(cache_path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False)
            return day_str, data
        except Exception:
            time.sleep(1 + attempt)
    print(f"  [警告] {day_str} 重试3次仍失败，跳过")
    return day_str, None


def extract_rb(rows, code_upper, day_str):
    """从单日全市场数据中提取目标合约。code_upper 形如 'RB1809'"""
    for row in rows:
        variety = str(row.get("PRODUCTGROUPID") or "").upper().strip()
        if not variety:
            pid = str(row.get("PRODUCTID") or "").upper().strip()
            variety = pid.split("_")[0] if pid else ""
        month = str(row.get("DELIVERYMONTH", "")).strip()
        if month in ("小计", "合计", ""):
            continue
        if variety + month == code_upper:
            close = row.get("CLOSEPRICE")
            if close in ("", None):
                continue
            return {
                "date": f"{day_str[0:4]}-{day_str[4:6]}-{day_str[6:8]}",
                "close": float(close),
                "volume": row.get("VOLUME", 0),
            }
    return None


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
    cached = sum(1 for d in days_needed if os.path.exists(os.path.join(CACHE_DIR, f"kx{d}.json")))
    print(f"需拉取 {len(days_needed)} 个交易日（{START_YEAR}-{END_YEAR} 每年1-9月），已缓存 {cached} 个")

    t0 = time.time()
    day_data = {}
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(fetch_one_day, d): d for d in days_needed}
        done = 0
        for fut in as_completed(futures):
            day_str, data = fut.result()
            day_data[day_str] = data
            done += 1
            if done % 200 == 0:
                print(f"  进度 {done}/{len(days_needed)}  用时 {time.time()-t0:.0f}s")
    print(f"拉取完成，用时 {time.time()-t0:.0f}s")

    # 从缓存中逐年提取 RB{YY}09 收盘价
    result = {}
    for year in range(START_YEAR, END_YEAR + 1):
        yy = str(year % 100).zfill(2)
        code = f"{SYMBOL_UPPER}{yy}{CONTRACT_MONTH}"  # 如 RB1809
        rows_for_year = []
        for day in days_needed:
            if not day.startswith(str(year)):
                continue
            data = day_data.get(day)
            if not data:
                continue
            rec = extract_rb(data.get("o_curinstrument", []), code, day)
            if rec:
                rows_for_year.append(rec)
        rows_for_year.sort(key=lambda r: r["date"])
        result[code.lower()] = rows_for_year
        if rows_for_year:
            first, last = rows_for_year[0], rows_for_year[-1]
            print(f"  [{code}] {len(rows_for_year):4d} 条  {first['date']} ~ {last['date']}  末日收 {last['close']:.0f}")
        else:
            print(f"  [{code}] 无数据")

    out_path = os.path.join(RAW_DIR, "rb09_shfe_2009_2018.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False)
    total = sum(len(v) for v in result.values())
    print(f"\n合计 {total} 条，已保存 {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
