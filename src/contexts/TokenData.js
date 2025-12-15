import React, { createContext, useContext, useReducer, useMemo, useCallback, useEffect } from 'react'

import { client } from '../apollo/client'
import {
  TOKEN_DATA,
  FILTERED_TRANSACTIONS,
  TOKEN_CHART,
  TOKENS_CURRENT,
  TOKENS_DYNAMIC,
  PRICES_BY_BLOCK
} from '../apollo/queries'

import { useEthPrice } from './GlobalData'

import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'

import {
  get2DayPercentChange,
  getPercentChange,
  getBlockFromTimestamp,
  isAddress,
  getBlocksFromTimestamps,
  splitQuery,
  getTimeframe
} from '../utils'
import { timeframeOptions } from '../constants'
import historyCache from '../utils/historyCache'
import { useLatestBlock } from './Application'

const UPDATE = 'UPDATE'
const UPDATE_TOKEN_TXNS = 'UPDATE_TOKEN_TXNS'
const UPDATE_CHART_DATA = 'UPDATE_CHART_DATA'
const UPDATE_PRICE_DATA = 'UPDATE_PRICE_DATA'
const UPDATE_TOP_TOKENS = ' UPDATE_TOP_TOKENS'
const UPDATE_ALL_PAIRS = 'UPDATE_ALL_PAIRS'

const TOKEN_PAIRS_KEY = 'TOKEN_PAIRS_KEY'

dayjs.extend(utc)

const TokenDataContext = createContext()

function useTokenDataContext() {
  return useContext(TokenDataContext)
}

function reducer(state, { type, payload }) {
  switch (type) {
    case UPDATE: {
      const { tokenAddress, data } = payload
      return {
        ...state,
        [tokenAddress]: {
          ...state?.[tokenAddress],
          ...data
        }
      }
    }
    case UPDATE_TOP_TOKENS: {
      const { topTokens } = payload
      let added = {}
      topTokens &&
        topTokens.map(token => {
          return (added[token.id] = token)
        })
      return {
        ...state,
        ...added
      }
    }

    case UPDATE_TOKEN_TXNS: {
      const { address, transactions } = payload
      return {
        ...state,
        [address]: {
          ...state?.[address],
          txns: transactions
        }
      }
    }
    case UPDATE_CHART_DATA: {
      const { address, chartData } = payload
      return {
        ...state,
        [address]: {
          ...state?.[address],
          chartData
        }
      }
    }

    case UPDATE_PRICE_DATA: {
      const { address, data, timeWindow, interval } = payload
      return {
        ...state,
        [address]: {
          ...state?.[address],
          [timeWindow]: {
            ...state?.[address]?.[timeWindow],
            [interval]: data
          }
        }
      }
    }

    case UPDATE_ALL_PAIRS: {
      const { address, allPairs } = payload
      return {
        ...state,
        [address]: {
          ...state?.[address],
          [TOKEN_PAIRS_KEY]: allPairs
        }
      }
    }
    default: {
      throw Error(`Unexpected action type in DataContext reducer: '${type}'.`)
    }
  }
}

export default function Provider({ children }) {
  const [state, dispatch] = useReducer(reducer, {})
  const update = useCallback((tokenAddress, data) => {
    dispatch({
      type: UPDATE,
      payload: {
        tokenAddress,
        data
      }
    })
  }, [])

  const updateTopTokens = useCallback(topTokens => {
    dispatch({
      type: UPDATE_TOP_TOKENS,
      payload: {
        topTokens
      }
    })
  }, [])

  const updateTokenTxns = useCallback((address, transactions) => {
    dispatch({
      type: UPDATE_TOKEN_TXNS,
      payload: { address, transactions }
    })
  }, [])

  const updateChartData = useCallback((address, chartData) => {
    dispatch({
      type: UPDATE_CHART_DATA,
      payload: { address, chartData }
    })
  }, [])

  const updateAllPairs = useCallback((address, allPairs) => {
    dispatch({
      type: UPDATE_ALL_PAIRS,
      payload: { address, allPairs }
    })
  }, [])

  const updatePriceData = useCallback((address, data, timeWindow, interval) => {
    dispatch({
      type: UPDATE_PRICE_DATA,
      payload: { address, data, timeWindow, interval }
    })
  }, [])

  return (
    <TokenDataContext.Provider
      value={useMemo(
        () => [
          state,
          {
            update,
            updateTokenTxns,
            updateChartData,
            updateTopTokens,
            updateAllPairs,
            updatePriceData
          }
        ],
        [state, update, updateTokenTxns, updateChartData, updateTopTokens, updateAllPairs, updatePriceData]
      )}
    >
      {children}
    </TokenDataContext.Provider>
  )
}

const getTopTokens = async (ethPrice, ethPriceOld) => {
  const utcCurrentTime = dayjs()
  const utcOneDayBack = utcCurrentTime.subtract(1, 'day').unix()
  const utcTwoDaysBack = utcCurrentTime.subtract(2, 'day').unix()
  let oneDayBlock = await getBlockFromTimestamp(utcOneDayBack)
  let twoDayBlock = await getBlockFromTimestamp(utcTwoDaysBack)

  try {
    const currentResult = await client.query({
      query: TOKENS_CURRENT,
      fetchPolicy: 'cache-first'
    })

    const oneDayResult = await client.query({
      query: TOKENS_DYNAMIC(oneDayBlock),
      fetchPolicy: 'cache-first'
    })

    const twoDayResult = await client.query({
      query: TOKENS_DYNAMIC(twoDayBlock),
      fetchPolicy: 'cache-first'
    })

    const currentTokens = currentResult?.data?.tokens || []
    const oneDayTokens = oneDayResult?.data?.tokens || []
    const twoDayTokens = twoDayResult?.data?.tokens || []

    let oneDayData = oneDayTokens.reduce((obj, cur) => {
      if (!cur) return obj
      return { ...obj, [cur.id]: cur }
    }, {})

    let twoDayData = twoDayTokens.reduce((obj, cur) => {
      if (!cur) return obj
      return { ...obj, [cur.id]: cur }
    }, {})

    let bulkResults = await Promise.all(
      currentTokens.map(async token => {
        if (!token) return null
          let data = token ? { ...token } : {}

          // let liquidityDataThisToken = liquidityData?.[token.id]
          let oneDayHistory = oneDayData?.[token.id]
          let twoDayHistory = twoDayData?.[token.id]

          // catch the case where token wasnt in top list in previous days
          if (!oneDayHistory) {
            const oneDayResultFallback = await client.query({
              query: TOKEN_DATA(token.id, oneDayBlock),
              fetchPolicy: 'cache-first'
            })
            oneDayHistory = oneDayResultFallback?.data?.tokens?.[0]
          }
          if (!twoDayHistory) {
            const twoDayResultFallback = await client.query({
              query: TOKEN_DATA(token.id, twoDayBlock),
              fetchPolicy: 'cache-first'
            })
            twoDayHistory = twoDayResultFallback?.data?.tokens?.[0]
          }

          // calculate percentage changes and daily changes
          const [oneDayVolumeUSD, volumeChangeUSD] = get2DayPercentChange(
            data.tradeVolumeUSD,
            oneDayHistory?.tradeVolumeUSD ?? 0,
            twoDayHistory?.tradeVolumeUSD ?? 0
          )
          const [oneDayTxns, txnChange] = get2DayPercentChange(
            data.txCount,
            oneDayHistory?.txCount ?? 0,
            twoDayHistory?.txCount ?? 0
          )

          const currentLiquidityUSD = data?.totalLiquidity * ethPrice * data?.derivedETH
          const oldLiquidityUSD = oneDayHistory?.totalLiquidity * ethPriceOld * oneDayHistory?.derivedETH

          // percent changes
          const priceChangeUSD = getPercentChange(
            data?.derivedETH * ethPrice,
            oneDayHistory?.derivedETH ? oneDayHistory?.derivedETH * ethPriceOld : 0
          )

          // set data
          data.priceUSD = data?.derivedETH * ethPrice
          data.totalLiquidityUSD = currentLiquidityUSD
          data.oneDayVolumeUSD = parseFloat(oneDayVolumeUSD)
          data.volumeChangeUSD = volumeChangeUSD
          data.priceChangeUSD = priceChangeUSD
          data.liquidityChangeUSD = getPercentChange(currentLiquidityUSD ?? 0, oldLiquidityUSD ?? 0)
          data.oneDayTxns = oneDayTxns
          data.txnChange = txnChange

          // new tokens
          if (!oneDayHistory && data) {
            data.oneDayVolumeUSD = data.tradeVolumeUSD
            data.oneDayVolumeETH = data.tradeVolume * data.derivedETH
            data.oneDayTxns = data.txCount
          }

          if (data.id === '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c') {
            data.name = 'Ether (Wrapped)'
            data.symbol = 'ETH'
          }
          return data
        })
    )

    // filter out any nulls from failed map entries
    return bulkResults.filter(Boolean)

    // calculate percentage changes and daily changes
  } catch (e) {
    console.log(e)
  }
}

const getTokenData = async (address, ethPrice, ethPriceOld) => {
  const utcCurrentTime = dayjs()
  const utcOneDayBack = utcCurrentTime
    .subtract(1, 'day')
    .startOf('minute')
    .unix()
  const utcTwoDaysBack = utcCurrentTime
    .subtract(2, 'day')
    .startOf('minute')
    .unix()
  let oneDayBlock = await getBlockFromTimestamp(utcOneDayBack)
  let twoDayBlock = await getBlockFromTimestamp(utcTwoDaysBack)

  // initialize data arrays
  let data = {}
  let oneDayData = {}
  let twoDayData = {}

  try {
    // fetch all current and historical data
    let result = await client.query({
      query: TOKEN_DATA(address),
      fetchPolicy: 'cache-first'
    })
    data = result?.data?.tokens?.[0]
    // clone to avoid mutating Apollo cached objects which may be non-extensible
    data = data ? { ...data } : {}

    // get results from 24 hours in past
    let oneDayResult = await client.query({
      query: TOKEN_DATA(address, oneDayBlock),
      fetchPolicy: 'cache-first'
    })
    oneDayData = oneDayResult?.data?.tokens?.[0]

    // get results from 48 hours in past
    let twoDayResult = await client.query({
      query: TOKEN_DATA(address, twoDayBlock),
      fetchPolicy: 'cache-first'
    })
    twoDayData = twoDayResult?.data?.tokens?.[0]

    // catch the case where token wasnt in top list in previous days
    if (!oneDayData) {
      let oneDayResult = await client.query({
        query: TOKEN_DATA(address, oneDayBlock),
        fetchPolicy: 'cache-first'
      })
      oneDayData = oneDayResult?.data?.tokens?.[0]
    }
    if (!twoDayData) {
      let twoDayResult = await client.query({
        query: TOKEN_DATA(address, twoDayBlock),
        fetchPolicy: 'cache-first'
      })
      twoDayData = twoDayResult?.data?.tokens?.[0]
    }

    // calculate percentage changes and daily changes
    const [oneDayVolumeUSD, volumeChangeUSD] = get2DayPercentChange(
      data.tradeVolumeUSD,
      oneDayData?.tradeVolumeUSD ?? 0,
      twoDayData?.tradeVolumeUSD ?? 0
    )

    // calculate percentage changes and daily changes
    const [oneDayVolumeUT, volumeChangeUT] = get2DayPercentChange(
      data.untrackedVolumeUSD,
      oneDayData?.untrackedVolumeUSD ?? 0,
      twoDayData?.untrackedVolumeUSD ?? 0
    )

    // calculate percentage changes and daily changes
    const [oneDayTxns, txnChange] = get2DayPercentChange(
      data.txCount,
      oneDayData?.txCount ?? 0,
      twoDayData?.txCount ?? 0
    )

    const priceChangeUSD = getPercentChange(
      data?.derivedETH * ethPrice,
      parseFloat(oneDayData?.derivedETH ?? 0) * ethPriceOld
    )

    const currentLiquidityUSD = data?.totalLiquidity * ethPrice * data?.derivedETH
    const oldLiquidityUSD = oneDayData?.totalLiquidity * ethPriceOld * oneDayData?.derivedETH

    // set data
    data.priceUSD = data?.derivedETH * ethPrice
    data.totalLiquidityUSD = currentLiquidityUSD
    data.oneDayVolumeUSD = oneDayVolumeUSD
    data.volumeChangeUSD = volumeChangeUSD
    data.priceChangeUSD = priceChangeUSD
    data.oneDayVolumeUT = oneDayVolumeUT
    data.volumeChangeUT = volumeChangeUT
    const liquidityChangeUSD = getPercentChange(currentLiquidityUSD ?? 0, oldLiquidityUSD ?? 0)
    data.liquidityChangeUSD = liquidityChangeUSD
    data.oneDayTxns = oneDayTxns
    data.txnChange = txnChange

    // new tokens
    if (!oneDayData && data) {
      data.oneDayVolumeUSD = data.tradeVolumeUSD
      data.oneDayVolumeETH = data.tradeVolume * data.derivedETH
      data.oneDayTxns = data.txCount
    }

    // fix for WETH
    if (data.id === '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2') {
      data.name = 'ETH (Wrapped)'
      data.symbol = 'ETH'
    }
  } catch (e) {
    console.log(e)
  }
  return data
}

const getTokenTransactions = async allPairsFormatted => {
  const transactions = {}
  try {
    let result = await client.query({
      query: FILTERED_TRANSACTIONS,
      variables: {
        allPairs: allPairsFormatted
      },
      fetchPolicy: 'cache-first'
    })
    transactions.mints = result.data.mints
    transactions.burns = result.data.burns
    transactions.swaps = result.data.swaps
  } catch (e) {
    console.log(e)
  }
  return transactions
}

const getTokenPairs = async tokenAddress => {
  try {
    // fetch all current and historical data
    let result = await client.query({
      query: TOKEN_DATA(tokenAddress),
      fetchPolicy: 'cache-first'
    })
    const p0 = result?.data?.['pairs0'] || []
    const p1 = result?.data?.['pairs1'] || []
    return p0.concat(p1)
  } catch (e) {
    console.log(e)
  }
}

const getIntervalTokenData = async (tokenAddress, startTime, interval = 3600, latestBlock) => {
  const utcEndTime = dayjs.utc()
  let time = startTime

  // create an array of start times until we reach current hour
  // buffer by half hour to catch case where graph isnt synced to latest block
  let timestamps = []
  while (time < utcEndTime.unix()) {
    timestamps.push(time)
    time += interval
  }

  // backout if invalid timestamp format
  if (timestamps.length === 0) {
    return []
  }

    // If there are an excessive number of timestamps, downsample to reduce requests
  if (timestamps.length > 1200) {
    const target = 800
    const factor = Math.ceil(timestamps.length / target)
    const sampled = []
    for (let i = 0; i < timestamps.length; i += factor) sampled.push(timestamps[i])
    // ensure we include the last timestamp
    if (sampled[sampled.length - 1] !== timestamps[timestamps.length - 1]) sampled.push(timestamps[timestamps.length - 1])
    console.log(`Downsampled token timestamps from ${timestamps.length} -> ${sampled.length} (factor ${factor})`)
    timestamps = sampled
  }

  // once you have all the timestamps, get the blocks for each timestamp in a bulk query
  let blocks
  try {
    // larger batch size to reduce splitQuery rounds
    blocks = await getBlocksFromTimestamps(timestamps, 1000)

    // catch failing case
    if (!blocks || blocks.length === 0) {
      return []
    }

    if (latestBlock) {
      blocks = blocks.filter(b => {
        return parseFloat(b.number) <= parseFloat(latestBlock)
      })
    }

    let result = await splitQuery(PRICES_BY_BLOCK, client, [tokenAddress], blocks, 200)

    // format token ETH price results
    let values = []
    const valuesByTimestamp = {}
    for (var row in result) {
      // token entries are keyed as t{timestamp}
      if (!row || row[0] !== 't') continue
      const timestamp = row.split('t')[1]
      const derivedETH = parseFloat(result[row]?.derivedETH) || 0
      if (timestamp) {
        const entry = { timestamp, derivedETH }
        values.push(entry)
        valuesByTimestamp[timestamp] = entry
      }
    }

    // go through eth usd price entries (b{timestamp}) and assign to the matching timestamp entry
    for (var brow in result) {
      if (!brow || brow[0] !== 'b') continue
      const timestamp = brow.split('b')[1]
      const bundle = result[brow]
      if (!timestamp) continue
      if (!bundle) {
        // missing bundle for this block — skip
        continue
      }
      const ethPrice = parseFloat(bundle.ethPrice)
      const matched = valuesByTimestamp[timestamp]
      if (matched) {
        matched.priceUSD = (isNaN(ethPrice) ? 0 : ethPrice) * (matched.derivedETH || 0)
      }
    }

    let formattedHistory = []

    // for each hour, construct the open and close price
    for (let i = 0; i < values.length - 1; i++) {
      formattedHistory.push({
        timestamp: values[i].timestamp,
        open: parseFloat(values[i].priceUSD),
        close: parseFloat(values[i + 1].priceUSD)
      })
    }

    return formattedHistory
  } catch (e) {
    console.log(e)
    console.log('error fetching blocks')
    return []
  }
}

const getTokenChartData = async tokenAddress => {
  let data = []
  const utcEndTime = dayjs.utc()
  // fetch as much historical data as possible (start from epoch)
  let startTime = 0

  try {
    let allFound = false
    let skip = 0
    while (!allFound) {
      let result = await client.query({
        query: TOKEN_CHART,
        variables: {
          tokenAddr: tokenAddress,
          skip
        },
        fetchPolicy: 'cache-first'
      })
      if (result.data.tokenDayDatas.length < 1000) {
        allFound = true
      }
      skip += 1000
      data = data.concat(result.data.tokenDayDatas)
    }

    let dayIndexSet = new Set()
    let dayIndexArray = []
    const oneDay = 24 * 60 * 60
    data.forEach((dayData, i) => {
      // add the day index to the set of days
      const cloned = { ...data[i], dailyVolumeUSD: parseFloat(data[i].dailyVolumeUSD) }
      dayIndexSet.add((cloned.date / oneDay).toFixed(0))
      dayIndexArray.push(cloned)
    })

    // fill in empty days
    let timestamp = data[0] && data[0].date ? data[0].date : startTime
    let latestLiquidityUSD = data[0] && data[0].totalLiquidityUSD
    let latestPriceUSD = data[0] && data[0].priceUSD
    let latestPairDatas = data[0] && data[0].mostLiquidPairs
    let index = 1
    while (timestamp < utcEndTime.startOf('minute').unix() - oneDay) {
      const nextDay = timestamp + oneDay
      let currentDayIndex = (nextDay / oneDay).toFixed(0)
      if (!dayIndexSet.has(currentDayIndex)) {
        data.push({
          date: nextDay,
          dayString: nextDay,
          dailyVolumeUSD: 0,
          priceUSD: latestPriceUSD,
          totalLiquidityUSD: latestLiquidityUSD,
          mostLiquidPairs: latestPairDatas
        })
      } else {
        latestLiquidityUSD = dayIndexArray[index].totalLiquidityUSD
        latestPriceUSD = dayIndexArray[index].priceUSD
        latestPairDatas = dayIndexArray[index].mostLiquidPairs
        index = index + 1
      }
      timestamp = nextDay
    }
    data = data.sort((a, b) => (parseInt(a.date) > parseInt(b.date) ? 1 : -1))
  } catch (e) {
    console.log(e)
  }
  return data
}

export function Updater() {
  const [, { updateTopTokens }] = useTokenDataContext()
  const [ethPrice, ethPriceOld] = useEthPrice()
  useEffect(() => {
    async function getData() {
      // get top pairs for overview list
      let topTokens = await getTopTokens(ethPrice, ethPriceOld)
      topTokens && updateTopTokens(topTokens)
    }
    ethPrice && ethPriceOld && getData()
  }, [ethPrice, ethPriceOld, updateTopTokens])
  return null
}

export function useTokenData(tokenAddress) {
  const [state, { update }] = useTokenDataContext()
  const [ethPrice, ethPriceOld] = useEthPrice()
  const tokenData = state?.[tokenAddress]

  useEffect(() => {
    if (!tokenData && ethPrice && ethPriceOld && isAddress(tokenAddress)) {
      getTokenData(tokenAddress, ethPrice, ethPriceOld).then(data => {
        update(tokenAddress, data)
      })
    }
  }, [ethPrice, ethPriceOld, tokenAddress, tokenData, update])

  return tokenData || {}
}

export function useTokenTransactions(tokenAddress) {
  const [state, { updateTokenTxns }] = useTokenDataContext()
  const tokenTxns = state?.[tokenAddress]?.txns

  const allPairsFormatted =
    state[tokenAddress] &&
    state[tokenAddress].TOKEN_PAIRS_KEY &&
    state[tokenAddress].TOKEN_PAIRS_KEY.map(pair => {
      return pair.id
    })

  useEffect(() => {
    async function checkForTxns() {
      if (!tokenTxns && allPairsFormatted) {
        let transactions = await getTokenTransactions(allPairsFormatted)
        updateTokenTxns(tokenAddress, transactions)
      }
    }
    checkForTxns()
  }, [tokenTxns, tokenAddress, updateTokenTxns, allPairsFormatted])

  return tokenTxns || []
}

export function useTokenPairs(tokenAddress) {
  const [state, { updateAllPairs }] = useTokenDataContext()
  const tokenPairs = state?.[tokenAddress]?.[TOKEN_PAIRS_KEY]

  useEffect(() => {
    async function fetchData() {
      let allPairs = await getTokenPairs(tokenAddress)
      updateAllPairs(tokenAddress, allPairs)
    }
    if (!tokenPairs && isAddress(tokenAddress)) {
      fetchData()
    }
  }, [tokenAddress, tokenPairs, updateAllPairs])

  return tokenPairs || []
}

export function useTokenChartData(tokenAddress) {
  const [state, { updateChartData }] = useTokenDataContext()
  const chartData = state?.[tokenAddress]?.chartData
  useEffect(() => {
    async function checkForChartData() {
      try {
        // attempt to load cached history first to avoid a heavy fetch
        const cached = historyCache.load(`token_chart_${tokenAddress}`)
        if (cached && cached.length && !chartData) {
          updateChartData(tokenAddress, cached)
        }
      } catch (e) {
        console.warn('Error loading cached token chart', e)
      }

      // proactively fetch as much historical data as possible (costly)
      // Use a Web Worker where available so heavy network + processing doesn't block the UI/debugger.
      const SUBGRAPH_URL = process.env.REACT_APP_CHEESESWAP_SUBGRAPH || 'https://api.thegraph.com/subgraphs/name/pancakeswap/exchange-v2'

      const startWorkerFetch = () => {
        const workerScript = `
          const SUBGRAPH_URL = '${SUBGRAPH_URL}';
          self.onmessage = async (e) => {
            const { tokenAddress } = e.data;
            try {
              let allData = [];
              let skip = 0;
              const pageSize = 1000;
              while (true) {
                const query = 'query tokenDayDatas($tokenAddr: String!, $skip: Int!) { tokenDayDatas(first: ' + pageSize + ', skip: $skip, orderBy: date, orderDirection: asc, where: { token: $tokenAddr }) { id date priceUSD totalLiquidityToken totalLiquidityUSD totalLiquidityETH dailyVolumeETH dailyVolumeToken dailyVolumeUSD mostLiquidPairs { id token0 { id derivedETH } token1 { id derivedETH } } } }';
                const body = JSON.stringify({ query, variables: { tokenAddr: tokenAddress, skip } });
                const res = await fetch(SUBGRAPH_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
                if (!res.ok) throw new Error('Network response was not ok');
                const json = await res.json();
                const batch = (json.data && json.data.tokenDayDatas) || [];
                allData = allData.concat(batch);
                if (batch.length < pageSize) break;
                skip += pageSize;
              }

              try {
                const daySet = new Set();
                const dayArray = [];
                const oneDay = 24 * 60 * 60;
                allData.forEach(d => { daySet.add(Math.floor(d.date/oneDay).toFixed(0)); dayArray.push({ ...d, dailyVolumeUSD: parseFloat(d.dailyVolumeUSD) }); });
                let timestamp = (allData[0] && allData[0].date) || 0;
                let latestLiquidityUSD = allData[0] && allData[0].totalLiquidityUSD;
                let latestPriceUSD = allData[0] && allData[0].priceUSD;
                let latestPairDatas = allData[0] && allData[0].mostLiquidPairs;
                let index = 1;
                const utcEndTime = Math.floor(Date.now() / 1000);
                while (timestamp < utcEndTime - oneDay) {
                  const nextDay = timestamp + oneDay;
                  const currentDayIndex = (nextDay / oneDay).toFixed(0);
                  if (!daySet.has(currentDayIndex)) {
                    allData.push({ date: nextDay, dayString: nextDay, dailyVolumeUSD: 0, priceUSD: latestPriceUSD, totalLiquidityUSD: latestLiquidityUSD, mostLiquidPairs: latestPairDatas });
                  } else {
                    latestLiquidityUSD = dayArray[index].totalLiquidityUSD;
                    latestPriceUSD = dayArray[index].priceUSD;
                    latestPairDatas = dayArray[index].mostLiquidPairs;
                    index += 1;
                  }
                  timestamp = nextDay;
                }
                allData.sort((a,b)=>(parseInt(a.date) > parseInt(b.date) ? 1 : -1));
              } catch (err) {
                // ignore formatting errors
              }

              self.postMessage({ ok: true, data: allData });
            } catch (err) {
              self.postMessage({ ok: false, error: err.message || String(err) });
            }
          };
        `;

        try {
          const blob = new Blob([workerScript], { type: 'application/javascript' });
          const url = URL.createObjectURL(blob);
          const worker = new Worker(url);
          worker.onmessage = (ev) => {
            const msg = ev.data;
            if (msg.ok) {
              updateChartData(tokenAddress, msg.data);
              try {
                historyCache.save(`token_chart_${tokenAddress}`, msg.data);
              } catch (e) {
                console.warn('Failed to cache token chart data', e);
              }
            } else {
              console.warn('Token chart worker error:', msg.error);
            }
            worker.terminate();
            URL.revokeObjectURL(url);
          };
          worker.postMessage({ tokenAddress });
        } catch (e) {
          console.warn('Worker creation failed, falling back to setTimeout fetch', e);
          setTimeout(async () => {
            try {
              const data = await getTokenChartData(tokenAddress);
              updateChartData(tokenAddress, data);
              try { historyCache.save(`token_chart_${tokenAddress}`, data); } catch (e) { console.warn('Failed to cache token chart data', e); }
            } catch (err) { console.warn('Error fetching token chart data (fallback)', err); }
          }, 50);
        }
      };

      if (!chartData) {
        startWorkerFetch();
      } else {
        // refresh in background
        startWorkerFetch();
      }
    }
    checkForChartData()
  }, [chartData, tokenAddress, updateChartData])
  return chartData
}

/**
 * get candlestick data for a token - saves in context based on the window and the
 * interval size
 * @param {*} tokenAddress
 * @param {*} timeWindow // a preset time window from constant - how far back to look
 * @param {*} interval  // the chunk size in seconds - default is 1 hour of 3600s
 */
export function useTokenPriceData(tokenAddress, timeWindow, interval = 3600) {
  const [state, { updatePriceData }] = useTokenDataContext()
  const chartData = state?.[tokenAddress]?.[timeWindow]?.[interval]
  const latestBlock = useLatestBlock()

  useEffect(() => {
    // compute start time based on selected timeframe (supports WEEK, MONTH, YEAR, ALL_TIME)
    const startTime = getTimeframe(timeWindow)

    // adapt interval for long timeframes to avoid excessive requests
    let effectiveInterval = interval
    if (timeWindow === timeframeOptions.YEAR || timeWindow === timeframeOptions.ALL_TIME) {
      // use daily resolution for 1 year and all-time to reduce load
      effectiveInterval = 24 * 60 * 60
    } else if (timeWindow === timeframeOptions.THREE_MONTHS) {
      // 3 months can be daily as well to reduce points
      effectiveInterval = Math.max(interval, 24 * 60 * 60)
    }

    async function fetch() {
      let data = await getIntervalTokenData(tokenAddress, startTime, effectiveInterval, latestBlock)
      updatePriceData(tokenAddress, data, timeWindow, effectiveInterval)
    }
    if (!chartData) {
      fetch()
    }
  }, [chartData, interval, timeWindow, tokenAddress, updatePriceData, latestBlock])

  return chartData
}

export function useAllTokenData() {
  const [state] = useTokenDataContext()
  return state
}
