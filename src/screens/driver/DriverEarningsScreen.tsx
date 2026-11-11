/**
 * C4: what the driver has earned and where it goes. Payout setup (identity, tax, bank) happens on
 * Stripe's own pages; earnings made before setup wait and are sent once it is done.
 */

import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, Banknote, CheckCircle2, ChevronLeft, Clock3, ExternalLink } from 'lucide-react'
import { apiService, type DriverEarnings } from '../../services/api'
import { formatPrice } from '../../lib/money'
import Button from '../../components/ui/Button'
import { List, InfoRow } from '../../components/ui/ListRow'
import SectionHeader from '../../components/ui/SectionHeader'
import { SkeletonRows } from '../../components/ui/Skeleton'

const PAYOUT_LABEL: Record<string, string> = { pending: 'Waiting to send', paid: 'Sent to Stripe', failed: 'Failed', reversed: 'Reversed' }

export default function DriverEarningsScreen({ onBack }: { onBack: () => void }) {
  const [data, setData] = useState<DriverEarnings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)

  const load = useCallback(async () => {
    const result = await apiService.getDriverEarnings()
    if (result.success && result.data) { setData(result.data); setError(null) } else setError(result.error || 'Unable to load your earnings.')
  }, [])

  useEffect(() => {
    void load()
    // Coming back from Stripe's setup page: re-check whether payouts are ready.
    const onVisible = () => { if (document.visibilityState === 'visible') void load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load])

  const openSetup = async () => {
    setOpening(true)
    setError(null)
    const result = await apiService.startPayoutSetup()
    setOpening(false)
    if (!result.success || !result.data?.url) { setError(result.error || 'Unable to open payout setup. Try again.'); return }
    window.open(result.data.url, '_blank', 'noopener')
  }

  return (
    <>
      <button type="button" className="ui-back" onClick={onBack}><ChevronLeft size={22} aria-hidden="true" /> Back</button>
      <header className="ui-screen-title"><h1>Earnings</h1></header>

      {error && <p className="ui-alert ui-alert--danger" role="alert"><AlertCircle size={16} aria-hidden="true" /> {error}</p>}
      {!data && !error && <SkeletonRows count={4} label="Loading earnings" />}

      {data && (
        <>
          <section className="earnings-totals" aria-label="Totals">
            <div><small>This week</small><strong>{formatPrice(data.thisWeek)}</strong></div>
            <div><small>Waiting to send</small><strong>{formatPrice(data.pending)}</strong></div>
            <div><small>Sent</small><strong>{formatPrice(data.paid)}</strong></div>
          </section>

          {data.enabled && !data.ready && (
            <section className="earnings-setup" aria-labelledby="payout-setup-title">
              <Banknote size={22} aria-hidden="true" />
              <div>
                <h2 id="payout-setup-title" className="earnings-setup__title">{data.hasAccount ? 'Finish payout setup' : 'Set up payouts'}</h2>
                <p>Stripe, our payment partner, checks your identity and collects your bank and tax details. It takes about 5 minutes.{data.pending > 0 ? ` ${formatPrice(data.pending)} is waiting for you.` : ''}</p>
                <Button block loading={opening} loadingLabel="Opening Stripe…" onClick={() => void openSetup()}>
                  {data.hasAccount ? 'Continue setup' : 'Set up payouts'} <ExternalLink size={16} aria-hidden="true" />
                </Button>
              </div>
            </section>
          )}
          {data.ready && (
            <p className="earnings-ready"><CheckCircle2 size={17} aria-hidden="true" /> Payouts are on. Stripe sends your earnings to your bank on its regular schedule.</p>
          )}
          {data.payoutPercent != null && <p className="earnings-split">You keep {data.payoutPercent}% of every job's price, including cancellation fees.</p>}

          <section className="ui-section" aria-labelledby="earnings-jobs">
            <SectionHeader id="earnings-jobs" title="Recent jobs" />
            {data.jobs.length === 0 ? (
              <p className="sheet-text">Completed jobs and their earnings will show up here.</p>
            ) : (
              <List>
                {data.jobs.map((job) => (
                  <InfoRow key={job.bookingId}
                    icon={job.payoutStatus === 'paid' ? <CheckCircle2 size={18} /> : <Clock3 size={18} />}
                    title={`${job.service ?? 'Job'}${job.jobStatus === 'cancelled' ? ' · cancellation fee' : ''}`}
                    subtitle={`${job.finishedAt ? new Date(job.finishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' · ' : ''}${PAYOUT_LABEL[job.payoutStatus] ?? job.payoutStatus}`}
                    trailing={<strong className="earnings-amount">{formatPrice(job.amount)}</strong>} />
                ))}
              </List>
            )}
          </section>
        </>
      )}
    </>
  )
}
