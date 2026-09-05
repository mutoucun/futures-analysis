#!/usr/bin/env python3
"""
update_data.py — 增量更新所有品种 JSON 数据
==========================================
通过 akshare（新浪源）获取最新日K线数据，合并进现有 JSON 文件。
覆盖全部 5 个交易所（SHFE/DCE/CZCE/CFFEX/INE），所有品种。

用法:
  python scripts/update_data.py          # 更新全部品种
  python scripts/update_data.py RB M RM  # 只更新指定品种
  python scripts/update_data.py --dry-run  # 仅打印计划，不执行

数据来源：新浪财经（通过 akshare futures_zh_daily_sina），
支持全部交易所，数据覆盖至最近交易日。
"""
import json
import os
import sys
import time
from pathlib import Path
from datetime import date, datetime

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "src" / "data" / "futures"

# ──────────── 品种前缀映射（与 build_symbol.py / sina.js 一致）────────────
# SHFE/DCE/INE: 小写    CZCE/CFFEX: 大写
SINA_PREFIX = {
    # SHFE
    'RB': 'rb', 'HC': 'hc', 'SS': 'ss', 'WR': 'wr',
    'CU': 'cu', 'AL': 'al', 'ZN': 'zn', 'PB': 'pb', 'NI': 'ni', 'SN': 'sn',
    'AU': 'au', 'AG': 'ag',
    'RU': 'ru', 'BU': 'bu', 'FU': 'fu', 'SP': 'sp',
    # DCE
    'I': 'i', 'J': 'j', 'JM': 'jm', 'M': 'm', 'Y': 'y', 'A': 'a', 'B': 'b',
    'P': 'p', 'C': 'c', 'L': 'l', 'PP': 'pp', 'V': 'v', 'EG': 'eg',
    'JD': 'jd', 'LH': 'lh', 'FB': 'fb', 'BB': 'bb', 'RR': 'rr', 'CS': 'cs',
    'PG': 'pg', 'EB': 'eb',
    # CZCE (大写)
    'MA': 'MA', 'TA': 'TA', 'SA': 'SA', 'FG': 'FG',
    'SR': 'SR', 'CF': 'CF', 'AP': 'AP', 'RM': 'RM', 'OI': 'OI',
    'SF': 'SF', 'SM': 'SM', 'PK': 'PK', 'PF': 'PF', 'UR': 'UR',
    'CJ': 'CJ', 'PX': 'PX', 'SH': 'SH', 'PR': 'PR',
    # GFEX (广期所，前缀 gf+品种小写)
    'LC': 'gflc', 'SI': 'gfsi',
    # CFFEX (大写)
    'IF': 'IF', 'IC': 'IC', 'IH': 'IH', 'IM': 'IM', 'T': 'T', 'TF': 'TF',
    'TL': 'TL', 'TS': 'TS',
    # INE
    'SC': 'sc', 'NR': 'nr', 'LU': 'lu', 'BC': 'bc', 'EC': 'ec',
    'AO': 'ao',
}


def build_sina_code(symbol, delivery_year, contract_month):
    """构造新浪合约代码（全部使用4位年份: rb2609, RM2609, IF2609）"""
    prefix = SINA_PREFIX.get(symbol)
    if not prefix:
        return None
    yy = delivery_year % 100
    return f"{prefix}{yy:02d}{contract_month}"


def fetch_contract_data(sina_code):
    """从 akshare 拉取单个合约日K线
    Returns: {date_str: close_price} dict, or None on failure
    """
    try:
        import akshare as ak
        df = ak.futures_zh_daily_sina(symbol=sina_code)
        if df is None or len(df) == 0:
            return None
        result = {}
        for _, row in df.iterrows():
            d = str(row['date'])[:10]  # 'YYYY-MM-DD'
            c = float(row['close'])
            if c > 0:
                result[d] = c
        return result if result else None
    except Exception:
        return None


def parse_contract_code(code, delivery_year):
    """从合约代码解析交割月。
    4位代码: rb2609 → month=9
    3位代码(CZCE): RM401 → year_digit=4, month=01; RM609 → year_digit=6, month=09
    Returns: month (int) or None
    """
    import re
    # 4位: prefix + YY + MM
    m = re.search(r'(\d{2})(\d{2})$', code)
    if m:
        return int(m.group(2))
    # 3位(CZCE): prefix + Y + MM
    m = re.search(r'(\d)(\d{2})$', code)
    if m:
        return int(m.group(2))
    return None


def is_contract_active(contract, today):
    """判断合约是否仍活跃（未过期）"""
    delivery_year = contract.get('deliveryYear', 0)
    code = contract.get('code', '')
    series = contract.get('series', [])
    if not series:
        return False

    last_date_str = series[-1]['date']
    last_date = datetime.strptime(last_date_str, '%Y-%m-%d').date()

    month = parse_contract_code(code, delivery_year)
    if month is None:
        # 无法判断，最后数据在60天内视为活跃
        return (today - last_date).days < 60

    # 交割月结束后30天内仍可更新
    from calendar import monthrange
    if month == 12:
        expiry_end = date(delivery_year + 1, 1, 1)
    else:
        _, last_day = monthrange(delivery_year, month)
        expiry_end = date(delivery_year, month, last_day)

    return today <= expiry_end + __import__('datetime').timedelta(days=30)


def merge_series(series, new_data):
    """合并新数据到 series 列表，返回 (新series, 新增点数)"""
    existing_dates = {p['date'] for p in series}
    new_points = []
    for date_str, close in new_data.items():
        if date_str not in existing_dates:
            new_points.append({'date': date_str, 'close': close})

    if not new_points:
        return series, 0

    merged = series + new_points
    merged.sort(key=lambda x: x['date'])
    return merged, len(new_points)


def discover_next_contract(symbol, contracts, today):
    """发现新合约：如果文件内所有合约均已过期，尝试拉取下一年份的同月合约。
    Returns: (new_contract_dict, data_points_count) or (None, 0)
    """
    if not contracts:
        return None, 0

    # 找到最大 deliveryYear
    max_year = max(c.get('deliveryYear', 0) for c in contracts)

    # 如果最大年份的合约仍然活跃，不需要发现
    newest = [c for c in contracts if c.get('deliveryYear') == max_year][-1]
    if is_contract_active(newest, today):
        return None, 0

    # 从最新合约代码中解析交割月份
    month = parse_contract_code(newest.get('code', ''), max_year)
    if month is None:
        return None, 0

    next_year = max_year + 1
    month_str = str(month).zfill(2)
    sina_code = build_sina_code(symbol, next_year, month_str)
    if not sina_code:
        return None, 0

    # 尝试拉取下一年合约数据
    new_data = fetch_contract_data(sina_code)
    if not new_data:
        return None, 0

    # 构造新合约条目
    series = [{'date': d, 'close': c} for d, c in sorted(new_data.items())]
    code_prefix = SINA_PREFIX.get(symbol, '')
    yy = next_year % 100
    new_contract = {
        'code': f"{code_prefix}{yy:02d}{month_str}",
        'deliveryYear': next_year,
        'series': series
    }
    return new_contract, len(series)


def update_file(json_file, target_symbols, today, dry_run):
    """更新单个 JSON 文件"""
    with open(json_file, 'r', encoding='utf-8') as f:
        payload = json.load(f)

    symbol = payload['symbol']
    if target_symbols and symbol not in target_symbols:
        return None

    contracts = payload.get('contracts', [])
    if not contracts:
        return None

    file_updated = 0
    file_added = 0
    file_failed = 0
    file_skipped = 0

    for contract in contracts:
        if not is_contract_active(contract, today):
            file_skipped += 1
            continue

        delivery_year = contract['deliveryYear']
        code = contract.get('code', '')
        month = parse_contract_code(code, delivery_year)
        if month is None:
            file_skipped += 1
            continue
        month_str = str(month).zfill(2)

        sina_code = build_sina_code(symbol, delivery_year, month_str)
        if not sina_code:
            file_skipped += 1
            continue

        new_data = fetch_contract_data(sina_code)
        if not new_data:
            file_failed += 1
            continue

        new_series, added = merge_series(contract['series'], new_data)
        if added > 0:
            contract['series'] = new_series
            file_updated += 1
            file_added += added

    # 发现新合约：所有已有合约均过期时，尝试拉取下一年份合约
    file_discovered = 0
    new_contract, discovered_points = discover_next_contract(symbol, contracts, today)
    if new_contract and not dry_run:
        contracts.append(new_contract)
        file_added += discovered_points
        file_discovered += 1

    if (file_updated > 0 or file_discovered > 0) and not dry_run:
        payload['updatedAt'] = today.isoformat()
        with open(json_file, 'w', encoding='utf-8') as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)

    return {
        'symbol': symbol,
        'month': json_file.stem.split('_')[-1],
        'updated': file_updated,
        'added': file_added,
        'failed': file_failed,
        'skipped': file_skipped,
        'discovered': file_discovered,
    }


def main():
    import argparse
    parser = argparse.ArgumentParser(description='增量更新期货 JSON 数据')
    parser.add_argument('symbols', nargs='*', help='只更新指定品种代码（如 RB M RM）')
    parser.add_argument('--dry-run', action='store_true', help='仅打印计划')
    args = parser.parse_args()

    target_symbols = set(s.upper() for s in args.symbols) if args.symbols else None
    today = date.today()

    json_files = sorted(DATA_DIR.glob('*.json'))
    if not json_files:
        print(f'未找到 JSON 文件: {DATA_DIR}')
        sys.exit(1)

    # 过滤目标文件
    if target_symbols:
        json_files = [f for f in json_files if f.stem.split('_')[0] in target_symbols]

    total_files = len(json_files)
    total_contracts_updated = 0
    total_points_added = 0
    total_contracts_failed = 0
    total_discovered = 0

    print(f'数据更新 — {today.isoformat()}')
    print(f'待处理: {total_files} 个文件')
    if target_symbols:
        print(f'品种过滤: {", ".join(sorted(target_symbols))}')
    print()

    start_time = time.time()

    for i, jf in enumerate(json_files):
        result = update_file(jf, target_symbols, today, args.dry_run)
        if result is None:
            continue

        tag = f"[{i+1}/{total_files}]"
        if result['discovered'] > 0:
            print(f'{tag} {result["symbol"]}_{result["month"]}: '
                  f'发现新合约 (+{result["discovered"]})')
            total_discovered += result['discovered']
            total_points_added += result['added']
        if result['updated'] > 0:
            print(f'{tag} {result["symbol"]}_{result["month"]}: '
                  f'+{result["added"]} 点 ({result["updated"]} 合约更新)')
            total_contracts_updated += result['updated']
            if result['discovered'] == 0:
                total_points_added += result['added']
        elif result['failed'] > 0:
            print(f'{tag} {result["symbol"]}_{result["month"]}: '
                  f'无新数据 ({result["failed"]} 合约拉取失败)')
            total_contracts_failed += result['failed']
        else:
            # 全部跳过（已过期），静默
            pass

    elapsed = time.time() - start_time

    print()
    print(f'完成！耗时 {elapsed:.1f} 秒')
    print(f'  合约更新: {total_contracts_updated}')
    print(f'  新合约发现: {total_discovered}')
    print(f'  数据点新增: {total_points_added}')
    print(f'  拉取失败: {total_contracts_failed}')

    # JSON 格式统计（供 serve_local.js /api/update 解析，不受控制台编码影响）
    print(f'__STATS__{{"contractsUpdated":{total_contracts_updated},"pointsAdded":{total_points_added},"failed":{total_contracts_failed},"discovered":{total_discovered},"elapsed":{elapsed:.1f}}}')

    if total_contracts_updated > 0:
        print()
        print('提示: 更新已写入 src/data/futures/，需要重新构建才能在平台中生效。')
        print('  运行: npm run build')


if __name__ == '__main__':
    main()
