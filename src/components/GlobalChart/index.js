import React, { useState, useMemo, useEffect, useRef } from 'react'
import { ResponsiveContainer } from '../../utils/rechartsCompat'
import { timeframeOptions } from '../../constants'
import { useGlobalChartData, useGlobalData } from '../../contexts/GlobalData'
import { useMedia } from 'react-use'
import DropdownSelect from '../DropdownSelect'
import TradingViewChart, { CHART_TYPES } from '../TradingviewChart'
import { RowFixed } from '../Row'
import { OptionButton } from '../ButtonStyled'
// getTimeframe not needed for 10-day local view
import dayjs from 'dayjs'
import { TYPE } from '../../Theme'

const CHART_VIEW = {
  VOLUME: 'Volume',
  LIQUIDITY: 'Liquidity',
}

const VOLUME_WINDOW = {
  WEEKLY: 'WEEKLY',
  DAYS: 'DAYS',
}
const GlobalChart = ({ display }) => {
  // chart options
  const [chartView, setChartView] = useState(display === 'volume' ? CHART_VIEW.VOLUME : CHART_VIEW.LIQUIDITY)

  const [volumeWindow] = useState(VOLUME_WINDOW.DAYS)
  const [timeWindow, setTimeWindow] = useState(timeframeOptions.MONTH)

  // global historical data
  const [dailyData, weeklyData] = useGlobalChartData()
  const {
    totalLiquidityUSD,
    oneDayVolumeUSD,
    volumeChangeUSD,
    liquidityChangeUSD,
    oneWeekVolume,
    weeklyVolumeChange,
  } = useGlobalData()

  // compute local browser start time based on selected `timeWindow`
  const computeLocalStart = () => {
    switch (timeWindow) {
      case timeframeOptions.WEEK:
        return dayjs().startOf('day').subtract(6, 'day').unix()
      case timeframeOptions.MONTH:
        return dayjs().startOf('day').subtract(1, 'month').unix()
      case timeframeOptions.YEAR:
        return dayjs().startOf('day').subtract(1, 'year').unix()
      case timeframeOptions.ALL_TIME:
      default:
        return 0
    }
  }
  const localStartTime = computeLocalStart()

  const chartDataFiltered = useMemo(() => {
    let currentData = volumeWindow === VOLUME_WINDOW.DAYS ? dailyData : weeklyData
    return (
      currentData &&
      Object.keys(currentData)
        ?.map((key) => {
          let item = currentData[key]
          // use localStartTime (last 10 days) as minimum for chart display
          if (item && item.date >= localStartTime) {
            return item
          }
          return null
        })
        .filter(Boolean)
    )
  }, [dailyData, localStartTime, volumeWindow, weeklyData])
  const below800 = useMedia('(max-width: 800px)')

  // update the width on a window resize
  const ref = useRef()
  const isClient = typeof window === 'object'
  const [width, setWidth] = useState(ref?.current?.container?.clientWidth)
  useEffect(() => {
    if (!isClient) {
      return false
    }
    function handleResize() {
      setWidth(ref?.current?.container?.clientWidth ?? width)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [isClient, width]) // Empty array ensures that effect is only run on mount and unmount

  return chartDataFiltered ? (
    <>
      {below800 && (
        <DropdownSelect options={CHART_VIEW} active={chartView} setActive={setChartView} color={'#ff007a'} />
      )}

      {/* time period selectors: rendered below the charts in a compact size */}

      {chartDataFiltered && chartView === CHART_VIEW.LIQUIDITY && (
        <ResponsiveContainer aspect={60 / 28} ref={ref}>
          <TradingViewChart
            data={chartDataFiltered}
            base={totalLiquidityUSD}
            baseChange={liquidityChangeUSD}
            title="Total Value Locked (TVL)"
            field="totalLiquidityUSD"
            width={width}
            type={CHART_TYPES.BAR}
            defaultWindow={timeWindow === timeframeOptions.MONTH ? 'full' : 30}
          />
        </ResponsiveContainer>
      )}
      {chartDataFiltered && chartView === CHART_VIEW.VOLUME && (
        <ResponsiveContainer aspect={60 / 28}>
          <TradingViewChart
            data={chartDataFiltered}
            base={volumeWindow === VOLUME_WINDOW.WEEKLY ? oneWeekVolume : oneDayVolumeUSD}
            baseChange={volumeWindow === VOLUME_WINDOW.WEEKLY ? weeklyVolumeChange : volumeChangeUSD}
            title={volumeWindow === VOLUME_WINDOW.WEEKLY ? 'Total Volume (USD) (7d)' : 'Total Volume (USD)'}
            field={volumeWindow === VOLUME_WINDOW.WEEKLY ? 'weeklyVolumeUSD' : 'dailyVolumeUSD'}
            width={width}
            type={CHART_TYPES.BAR}
            useWeekly={volumeWindow === VOLUME_WINDOW.WEEKLY}
            defaultWindow={timeWindow === timeframeOptions.MONTH ? 'full' : 30}
          />
        </ResponsiveContainer>
      )}
          {/* compact time selectors placed below the chart area */}
          <RowFixed style={{ marginTop: '8px', justifyContent: 'flex-start', gap: '6px' }}>
            <OptionButton
              style={{ padding: '4px 8px', fontSize: '12px' }}
              active={timeWindow === timeframeOptions.WEEK}
              onClick={() => setTimeWindow(timeframeOptions.WEEK)}
            >
              <TYPE.body style={{ fontSize: '12px' }}>1W</TYPE.body>
            </OptionButton>
            <OptionButton
              style={{ padding: '4px 8px', fontSize: '12px' }}
              active={timeWindow === timeframeOptions.MONTH}
              onClick={() => setTimeWindow(timeframeOptions.MONTH)}
            >
              <TYPE.body style={{ fontSize: '12px' }}>1M</TYPE.body>
            </OptionButton>
            <OptionButton
              style={{ padding: '4px 8px', fontSize: '12px' }}
              active={timeWindow === timeframeOptions.YEAR}
              onClick={() => setTimeWindow(timeframeOptions.YEAR)}
              title={"Please zoom out (-) to see 1 year chart data"}
            >
              <TYPE.body style={{ fontSize: '12px' }}>1Y</TYPE.body>
            </OptionButton>
            <OptionButton
              style={{ padding: '4px 8px', fontSize: '12px' }}
              active={timeWindow === timeframeOptions.ALL_TIME}
              onClick={() => setTimeWindow(timeframeOptions.ALL_TIME)}
              title={"Please zoom out (-) to see all historical chart data."}
            >
              <TYPE.body style={{ fontSize: '12px' }}>All</TYPE.body>
            </OptionButton>
          </RowFixed>
      {/* Removed small D/W overlay controls per UX request */}
    </>
  ) : (
    ''
  )
}

export default GlobalChart

