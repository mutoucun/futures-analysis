/**
 * 按需加载改造验证脚本（SSR，无需浏览器）
 * 验证点：
 *  1. 清单类函数同步可用：hasRealData / getAvailableMonths / hasAnyRealData（未加载任何 payload 前）
 *  2. ensureRealData 动态加载后 getRealContracts 同步可读
 *  3. mock/data.js 取数链路：真实数据走旋转轴季节性、无数据品种回退 mock
 *  4. App.vue 整体 renderToString 不抛错
 * 运行：node verify_lazy.mjs（须在本项目目录内，依赖 vite/vue 从 node_modules 解析）
 */
import { createServer } from 'vite'
import { renderToString } from 'vue/server-renderer'
import { createSSRApp } from 'vue'

let pass = 0, fail = 0
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}${extra ? '  [' + extra + ']' : ''}`) }
  else { fail++; console.log(`  FAIL  ${name}${extra ? '  [' + extra + ']' : ''}`) }
}

const server = await createServer({
  root: process.cwd(),
  logLevel: 'error',
  server: { middlewareMode: true },
  appType: 'custom'
})

try {
  const dataMod = await server.ssrLoadModule('/src/data/index.js')
  const {
    hasRealData, ensureRealData, getRealContracts,
    getAvailableMonths, hasAnyRealData, getRealDataUpdateDate
  } = dataMod

  console.log('\n== 1. 清单函数（未加载 payload，同步语义） ==')
  check('hasRealData(RB,09) 同步为 true', hasRealData('RB', '09') === true)
  check('hasRealData(RB,02) 同步为 false', hasRealData('RB', '02') === false)
  check('getAvailableMonths(RB)=[01,05,09,10]', JSON.stringify(getAvailableMonths('RB')) === '["01","05","09","10"]',
    JSON.stringify(getAvailableMonths('RB')))
  check('getAvailableMonths(M)=8个月', getAvailableMonths('M').length === 8, JSON.stringify(getAvailableMonths('M')))
  check('hasAnyRealData(RM)=true', hasAnyRealData('RM') === true)
  check('hasAnyRealData(ZZ)=false（不存在品种）', hasAnyRealData('ZZ') === false)
  check('未加载前 getRealContracts 返回 null', getRealContracts('RB', '09') === null)
  check('未加载前更新日期为 null', getRealDataUpdateDate() === null)

  console.log('\n== 2. ensureRealData 按需加载 ==')
  const ok = await ensureRealData('RB', '09')
  check('ensureRealData(RB,09) 返回 true', ok === true)
  const rb = getRealContracts('RB', '09')
  check('加载后 getRealContracts(RB,09) 有数据', Array.isArray(rb) && rb.length > 0, `合约数=${rb && rb.length}`)
  check('合约按交割年升序', rb.every((c, i) => i === 0 || c.deliveryYear >= rb[i - 1].deliveryYear))
  check('ensureRealData(RB,02) 无文件返回 false', (await ensureRealData('RB', '02')) === false)
  check('重复 ensure 命中缓存仍为 true', (await ensureRealData('RB', '09')) === true)
  check('更新日期已就绪', typeof getRealDataUpdateDate() === 'string', getRealDataUpdateDate())

  console.log('\n== 3. mock/data.js 取数链路 ==')
  const mock = await server.ssrLoadModule('/src/mock/data.js')
  // 真实数据：旋转轴（09 合约轴应为 10月→次年9月）
  const sRB = mock.getSeasonalData('RB', '09', 'all')
  check('RB09 季节性有年份线', sRB.years.length >= 10, `年份=${sRB.years.length}`)
  const firstMonth = sRB.dates[0] ? sRB.dates[0].slice(0, 2) : ''
  check('RB09 横轴以10月开头（旋转轴）', firstMonth === '10', `首刻度=${sRB.dates[0]}`)
  // 跨品种真实数据（M-RM 共同年份）
  await ensureRealData('M', '09'); await ensureRealData('RM', '09')
  const sCross = mock.getCrossSeasonalData('M', 'RM', '09', 'all', 'spread')
  check('M-RM 价差季节性有年份线', sCross.years.length >= 5, `年份=${sCross.years.length}`)
  // 新补数据品种代表：沪铜 CU01（上期所缓存2009-2018 + 新浪2019+）
  await ensureRealData('CU', '01')
  const sCUreal = mock.getSeasonalData('CU', '01', 'all')
  check('CU01 季节性有年份线（真实数据）', sCUreal.years.length >= 15, `年份=${sCUreal.years.length}`)
  // 无真实数据月份回退 mock（RB 品种存在但 02 月无数据文件）
  const sCU = mock.getSeasonalData('RB', '02', 'all')
  check('RB02 回退 mock 仍有数据', sCU.years.length > 0 && sCU.dates.length > 0, `年份=${sCU.years.length}`)
  const tsCU = mock.getTimeSeriesData('RB', '02')
  check('RB02 时序回退 mock', tsCU.dates.length > 0)
  // 明细表行数与年份线数一致（既有约束）
  const dRB = mock.getMonthlyDetailData('RB', '09', 'percent', 'all')
  check('RB09 明细行数=年份线数', dRB.contracts.length === sRB.years.length,
    `行=${dRB.contracts.length} 线=${sRB.years.length}`)
  // 数据更新日期：真实优先
  check('getDataUpdateDate 取真实日期', mock.getDataUpdateDate() === getRealDataUpdateDate(),
    mock.getDataUpdateDate())

  console.log('\n== 4. App.vue SSR 渲染 ==')
  // 浏览器 API 桩：App.vue 首屏主题脚本读 document/localStorage；
  // zrender 模块初始化时探测环境，需要 navigator.userAgent 与 document.createElement().style
  Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent: 'Mozilla/5.0 (SSR verify)' },
    configurable: true
  })
  globalThis.document = {
    documentElement: { style: {}, classList: { contains: () => false, add() {}, toggle() {} } },
    createElement: () => ({ style: {}, getContext: () => null }),
    addEventListener() {},
    removeEventListener() {}
  }
  globalThis.localStorage = { getItem: () => null, setItem() {} }
  globalThis.window = {
    matchMedia: () => ({ matches: false }),
    addEventListener() {},
    removeEventListener() {}
  }
  const App = (await server.ssrLoadModule('/src/App.vue')).default
  const html = await renderToString(createSSRApp(App))
  check('App 渲染出标题', html.includes('国内期货日线数据分析平台'))
  check('App 渲染出图表容器', html.includes('charts-area') || html.length > 5000, `html长度=${html.length}`)
} finally {
  await server.close()
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail ? 1 : 0)
