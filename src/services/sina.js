/**
 * 新浪期货日K线实时数据服务
 * ==============
 * 通过本地代理（serve_local.js /api/sina/kline）从新浪财经获取最新日线数据。
 * 返回 [{date, close}] 格式，可直接合并到现有 JSON 合约数据。
 */
import {
  ensureRealData,
  updateLiveContracts,
  setLiveUpdatedAt,
  replacePayload
} from '../data/index.js'

// ============ 品种 → Sina 前缀映射 ============
const SINA_PREFIX = {}
const _initPrefix = (() => {
  Object.assign(SINA_PREFIX, {
    RB: 'rb', HC: 'hc', SS: 'ss', WR: 'wr',
    CU: 'cu', AL: 'al', ZN: 'zn', PB: 'pb', NI: 'ni', SN: 'sn',
    AU: 'au', AG: 'ag',
    RU: 'ru', BU: 'bu', FU: 'fu', SP: 'sp',
    I: 'i', J: 'j', JM: 'jm', M: 'm', Y: 'y', A: 'a', B: 'b',
    P: 'p', C: 'c', L: 'l', PP: 'pp', V: 'v', EG: 'eg',
    MA: 'MA', TA: 'TA', SA: 'SA', FG: 'FG',
    SR: 'SR', CF: 'CF', AP: 'AP', RM: 'RM', OI: 'OI', SF: 'SF', SM: 'SM',
    IF: 'IF', IC: 'IC', IH: 'IH', IM: 'IM', T: 'T', TF: 'TF',
    SC: 'sc', NR: 'nr', LU: 'lu', BC: 'bc'
  })
})()

// ============ Sina 合约代码构造 ============
function buildSinaCode(symbolCode, deliveryYear, contractMonth) {
  const prefix = SINA_PREFIX[symbolCode]
  if (!prefix) return null
  const yy = deliveryYear % 100
  return `${prefix}${String(yy).padStart(2, '0')}${contractMonth}`
}

// ============ API 请求 ============

async function fetchOne(sinaCode) {
  try {
    const resp = await fetch(`/api/sina/kline?symbol=${encodeURIComponent(sinaCode)}`)
    if (!resp.ok) return { data: [], reachable: resp.status !== 0 }
    const raw = await resp.json()
    if (raw === null) return { data: [], reachable: true } // Sina 明确返回 null = 合约无数据
    if (!Array.isArray(raw) || raw.length === 0) return { data: [], reachable: true }
    return { data: parseResponse(raw), reachable: true }
  } catch {
    return { data: [], reachable: false } // fetch 本身抛异常 = 代理不通
  }
}

function parseResponse(raw) {
  const out = []
  for (const row of raw) {
    if (Array.isArray(row)) {
      const close = parseFloat(row[4])
      if (!isNaN(close) && close > 0) out.push({ date: row[0], close })
    } else if (row && typeof row === 'object' && row.date) {
      const close = parseFloat(row.close)
      if (!isNaN(close) && close > 0) out.push({ date: row.date, close })
    }
  }
  return out
}

/**
 * 快速检测代理是否可达：用一个已知有数据的连续合约试一下
 * @returns {boolean}
 */
async function checkProxyReachable() {
  const { reachable } = await fetchOne('rb0')
  return reachable
}

// ============ 高级接口 ============

async function fetchSymbolMonth(symbolCode, contractMonth) {
  const result = new Map()
  const currentYear = new Date().getFullYear()

  // 拉取当年 + 次年 + 近几年的合约（Sina 数据约覆盖到 2024 年中，多试几年可能命中）
  const yearsToFetch = new Set()
  for (let y = 2019; y <= currentYear + 1; y++) yearsToFetch.add(y)

  const tasks = []
  for (const year of yearsToFetch) {
    const code = buildSinaCode(symbolCode, year, contractMonth)
    if (code) tasks.push({ year, code })
  }

  const results = await Promise.all(tasks.map(t => fetchOne(t.code)))
  let anyReachable = false
  for (let i = 0; i < tasks.length; i++) {
    if (results[i].reachable) anyReachable = true
    if (results[i].data.length > 0) result.set(tasks[i].year, results[i].data)
  }
  return { data: result, reachable: anyReachable }
}

/**
 * 一键刷新：拉取指定品种+合约月份的 Sina 最新日K，合并进内存
 * @returns {{ success, contractsUpdated, pointsAdded, status: 'ok'|'no_data'|'unreachable', message }}
 */
export async function refreshSymbolMonth(symbolCode, contractMonth) {
  try {
    await ensureRealData(symbolCode, contractMonth)

    const { data: sinaData, reachable } = await fetchSymbolMonth(symbolCode, contractMonth)

    if (!reachable) {
      return { success: false, contractsUpdated: 0, pointsAdded: 0,
        status: 'unreachable', message: '本地服务未启动或网络不通' }
    }

    if (sinaData.size === 0) {
      return { success: false, contractsUpdated: 0, pointsAdded: 0,
        status: 'no_data', message: '新浪暂无该品种更新数据' }
    }

    const stats = updateLiveContracts(symbolCode, contractMonth, sinaData)
    return { success: true, contractsUpdated: stats.contractsUpdated, pointsAdded: stats.pointsAdded,
      status: 'ok', message: '' }
  } catch (err) {
    return { success: false, contractsUpdated: 0, pointsAdded: 0,
      status: 'unreachable', message: err.message || String(err) }
  }
}

/**
 * 刷新当前查看涉及的所有品种+月份
 * @returns {{ success, totalUpdated, totalAdded, status, message }}
 */
export async function refreshAll(params) {
  const { symbol, contractMonth, analyzeType, contractMonthB, symbolB } = params
  const targets = [[symbol, contractMonth]]
  if (analyzeType === 'crossMonth' && contractMonthB) {
    targets.push([symbol, contractMonthB])
  } else if ((analyzeType === 'crossSymbol' || analyzeType === 'crossRatio') && symbolB) {
    targets.push([symbolB, contractMonth])
  }

  let totalUpdated = 0
  let totalAdded = 0
  let anySuccess = false
  let lastStatus = 'no_data'
  let lastMessage = ''

  for (const [sym, month] of targets) {
    const r = await refreshSymbolMonth(sym, month)
    if (r.success) {
      anySuccess = true
      totalUpdated += r.contractsUpdated
      totalAdded += r.pointsAdded
    } else {
      lastStatus = r.status
      lastMessage = r.message
    }
  }

  if (anySuccess) {
    setLiveUpdatedAt(new Date().toISOString().slice(0, 10))
  }

  return {
    success: anySuccess,
    totalUpdated,
    totalAdded,
    status: anySuccess ? 'ok' : lastStatus,
    message: anySuccess ? '' : lastMessage
  }
}

// ============ 服务端全量更新（Python akshare） ============

/**
 * 通过本地服务端（/api/update）触发 Python 脚本全量更新所有品种 JSON 数据，
 * 然后拉取当前查询涉及的 JSON 文件并合并到内存中。
 *
 * 相比 Sina HTTP 代理（仅覆盖 ~2024-07 之前），此方式可获取最近交易日数据。
 *
 * @param {Object} params { symbol, contractMonth, analyzeType, contractMonthB?, symbolB? }
 * @returns {{ success, contractsUpdated, pointsAdded, error? }}
 */
export async function refreshAllFromServer(params) {
  const result = { success: false, contractsUpdated: 0, pointsAdded: 0 }

  try {
    // 1. 触发服务端更新脚本（只更新当前品种，几秒完成）
    const { symbol, contractMonth, analyzeType, contractMonthB, symbolB } = params
    // 收集需要更新的品种（跨品种时两个都要更新）
    const symbols = [symbol]
    if ((analyzeType === 'crossSymbol' || analyzeType === 'crossRatio') && symbolB && symbolB !== symbol) {
      symbols.push(symbolB)
    }
    // 逐品种更新（每个几秒）
    let totalContracts = 0, totalPoints = 0
    for (const sym of symbols) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 60000) // 60秒超时
      try {
        const resp = await fetch(`/api/update?symbol=${sym}`, {
          method: 'POST',
          signal: controller.signal
        })
        const data = await resp.json()
        if (data.success) {
          totalContracts += data.contractsUpdated || 0
          totalPoints += data.pointsAdded || 0
        }
      } finally {
        clearTimeout(timer)
      }
    }
    result.contractsUpdated = totalContracts
    result.pointsAdded = totalPoints

    // 2. 拉取当前查询涉及的 JSON 文件，合并进内存
    const targets = [[symbol, contractMonth]]
    if (analyzeType === 'crossMonth' && contractMonthB) {
      targets.push([symbol, contractMonthB])
    } else if ((analyzeType === 'crossSymbol' || analyzeType === 'crossRatio') && symbolB) {
      targets.push([symbolB, contractMonth])
    }

    for (const [sym, month] of targets) {
      try {
        const jsonResp = await fetch(`/api/data/${sym}_${month}.json`, {
          cache: 'no-store'
        })
        if (jsonResp.ok) {
          const payload = await jsonResp.json()
          replacePayload(sym, month, payload)
        }
      } catch {
        // 单个文件拉取失败不影响整体
      }
    }

    setLiveUpdatedAt(new Date().toISOString().slice(0, 10))
    result.success = true
    return result
  } catch (err) {
    result.error = err.message || String(err)
    return result
  }
}
