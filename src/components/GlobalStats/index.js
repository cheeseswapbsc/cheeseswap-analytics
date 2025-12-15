import React from 'react'
import styled, { keyframes } from 'styled-components'
import { RowFixed, RowBetween } from '../Row'
import { useMedia } from 'react-use'
import { useGlobalData, useEthPrice } from '../../contexts/GlobalData'
import { formattedNum, localNumber } from '../../utils'
import { useCountUp } from '../../hooks'

//import UniPrice from '../UniPrice'

const Header = styled.div`
  width: 100%;
  position: sticky;
  top: 0;
`

const fadeUp = keyframes`
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
`

const glow = keyframes`
  0% { box-shadow: 0 0 0 rgba(255,255,255,0); }
  50% { box-shadow: 0 6px 18px rgba(33,114,229,0.08); }
  100% { box-shadow: 0 0 0 rgba(255,255,255,0); }
`

const StatGrid = styled.div`
  display: flex;
  gap: 0.6rem;
  align-items: center;
  flex-wrap: wrap;
`

const StatCard = styled.div`
  background: ${({ theme }) => theme.bg3};
  border-radius: 8px;
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  min-width: 140px;
  transition: transform 180ms ease, box-shadow 180ms ease;
  animation: ${fadeUp} 360ms ease both;
  &:hover { transform: translateY(-4px); animation: ${glow} 1.6s ease infinite; }
`

const Label = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.text3};
  margin-bottom: 4px;
`

const Value = styled.div`
  font-weight: 700;
  font-size: 15px;
  color: ${({ theme }) => theme.text1};
`

export default function GlobalStats() {
  const below816 = useMedia('(max-width: 816px)')

 // const [setShowPriceCard] = useState(false)

  const { oneDayVolumeUSD, oneDayTxns, pairCount, totalVolumeUSD } = useGlobalData()
  const [ethPrice] = useEthPrice()

  const ethVal = ethPrice || 0
  const txnsVal = oneDayTxns || 0
  const pairsVal = pairCount || 0
  const fees24Val = (oneDayVolumeUSD || 0) * 0.003
  const feesAllVal = (totalVolumeUSD || 0) * 0.003
  const totalVolumeVal = totalVolumeUSD || 0

  const animEth = useCountUp(ethVal, 800)
  const animTxns = useCountUp(txnsVal, 900)
  const animPairs = useCountUp(pairsVal, 900)
  const animFees24 = useCountUp(fees24Val, 900)
  const animFeesAll = useCountUp(feesAllVal, 900)
  const animTotalVol = useCountUp(totalVolumeVal, 900)

  return (
    <Header>
      <RowBetween style={{ padding: below816 ? '0.5rem' : '.5rem' }}>
        <RowFixed>
          <StatGrid>
            <StatCard>
              <Label>BNB Price</Label>
              <Value>{ethVal ? formattedNum(animEth, true) : '-'}</Value>
            </StatCard>

            <StatCard>
              <Label>Transactions (24H)</Label>
              <Value>{localNumber(Math.round(animTxns))}</Value>
            </StatCard>

            <StatCard>
              <Label>Pairs</Label>
              <Value>{localNumber(Math.round(animPairs))}</Value>
            </StatCard>

            <StatCard>
              <Label>Fees (24H)</Label>
              <Value>{formattedNum(animFees24, true)}</Value>
            </StatCard>

            <StatCard>
              <Label>Fees (All)</Label>
              <Value>{formattedNum(animFeesAll, true)}</Value>
            </StatCard>

            <StatCard>
              <Label>Total Volume All (USD)</Label>
              <Value>{formattedNum(animTotalVol, true)}</Value>
            </StatCard>
          </StatGrid>
        </RowFixed>
      </RowBetween>
    </Header>
  )
}
