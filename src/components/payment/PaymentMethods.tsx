/**
 * C2: the card a request is paid with — on the request sheet (choose / add) and in Account (manage).
 * Shows only brand and last four digits. Nothing renders when card payments are off on the server.
 */

import { useEffect, useState } from 'react'
import { AlertCircle, Check, CreditCard, Plus, Trash2 } from 'lucide-react'
import { cardLabel, usePaymentStore } from '../../store/usePaymentStore'
import { useAuthStore } from '../../store/useAuthStore'
import { lazyWithRetry } from '../../lib/lazyWithRetry'
import BottomSheet from '../ui/BottomSheet'
import Button from '../ui/Button'
import ChunkBoundary from '../ui/ChunkBoundary'
import { List, ListRow } from '../ui/ListRow'
import { Skeleton } from '../ui/Skeleton'

// Stripe's form is only downloaded when someone adds a card.
const AddCardSheet = lazyWithRetry(() => import('./AddCardSheet'))

/** Loads the saved cards once per sign-in (the store is reset on sign-out). */
export function usePaymentMethods() {
  const state = usePaymentStore()
  const customer = useAuthStore((auth) => auth.isAuthenticated && auth.user?.role === 'customer')
  const { status, load } = state
  useEffect(() => {
    if (customer && status === 'idle') void load()
  }, [customer, status, load])
  return state
}

const expiry = (card: { expMonth: number | null; expYear: number | null }) =>
  card.expMonth && card.expYear ? `Expires ${String(card.expMonth).padStart(2, '0')}/${String(card.expYear).slice(-2)}` : undefined

function AddCard({ onClose, onSaved }: { onClose: () => void; onSaved?: (id: string) => void }) {
  return (
    <ChunkBoundary fallback={null}>
      <AddCardSheet onClose={onClose} onSaved={onSaved} />
    </ChunkBoundary>
  )
}

/** Request sheet: "Pay with Visa •••• 4242 · Change", or "Add a card". */
export function RequestPaymentRow() {
  const { enabled, cards, selectedId, status, select } = usePaymentMethods()
  const [adding, setAdding] = useState(false)
  const [choosing, setChoosing] = useState(false)
  if (status === 'loading' && !cards.length) {
    return <div className="request-card" role="status" aria-label="Loading your cards"><Skeleton height={20} width="60%" /></div>
  }
  if (!enabled) return null
  const card = cards.find((item) => item.id === selectedId)

  return (
    <>
      {card ? (
        <div className="request-card request-pay">
          <span className="request-card__icon" aria-hidden="true"><CreditCard size={20} /></span>
          <span className="request-pay__text"><strong>Pay with</strong><small>{cardLabel(card)}</small></span>
          <button type="button" className="request-confirm__edit" aria-haspopup="dialog" onClick={() => setChoosing(true)}>Change</button>
        </div>
      ) : (
        <button type="button" className="request-card request-pay request-pay--add" aria-haspopup="dialog" onClick={() => setAdding(true)}>
          <span className="request-card__icon" aria-hidden="true"><Plus size={20} /></span>
          <span className="request-pay__text"><strong>Add a card</strong><small>Needed to request help. You're charged only when the job is done.</small></span>
        </button>
      )}

      {choosing && (
        <BottomSheet title="Pay with" closeLabel="Close" onClose={() => setChoosing(false)}
          footer={<Button variant="secondary" block onClick={() => { setChoosing(false); setAdding(true) }}><Plus size={18} aria-hidden="true" /> Add another card</Button>}>
          <div role="radiogroup" aria-label="Saved cards" className="pay-choices">
            {cards.map((item) => {
              const checked = item.id === selectedId
              return (
                <label key={item.id} className={`job-choice${checked ? ' is-selected' : ''}`}>
                  <input type="radio" name="pay-card" value={item.id} checked={checked} onChange={() => { select(item.id); setChoosing(false) }} />
                  <span>{cardLabel(item)}{expiry(item) && <small> · {expiry(item)}</small>}</span>
                  {checked && <Check size={16} aria-hidden="true" />}
                </label>
              )
            })}
          </div>
        </BottomSheet>
      )}
      {adding && <AddCard onClose={() => setAdding(false)} />}
    </>
  )
}

/** Account → Payment: one-line summary of the default card. */
export function paymentSummary(cards: { brand: string; last4: string }[]) {
  return cards.length ? cardLabel(cards[0]) + (cards.length > 1 ? ` + ${cards.length - 1} more` : '') : 'Add a card'
}

/** Account: list, add and remove saved cards. */
export function PaymentMethodsSheet({ onClose }: { onClose: () => void }) {
  const { cards, status, error, remove, load } = usePaymentMethods()
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)

  if (adding) return <AddCard onClose={() => setAdding(false)} />
  const confirmCard = cards.find((card) => card.id === confirming)

  return (
    <BottomSheet title="Payment" closeLabel="Close payment" onClose={onClose}
      footer={<Button block size="lg" onClick={() => setAdding(true)}><Plus size={18} aria-hidden="true" /> Add a card</Button>}>
      {status === 'error' && (
        <div className="ui-alert ui-alert--danger" role="alert">
          <AlertCircle size={16} aria-hidden="true" /> <span>{error}</span>
          <button type="button" onClick={() => void load()}>Try again</button>
        </div>
      )}
      {status === 'loading' && !cards.length && <Skeleton height={56} radius={14} width="100%" />}
      {status === 'ready' && !cards.length && <p className="sheet-text">No cards saved yet. Add one so you can request help in a tap.</p>}
      {cards.length > 0 && (
        <List>
          {cards.map((card) => (
            <ListRow key={card.id} icon={<CreditCard size={19} />} title={cardLabel(card)} subtitle={expiry(card)} chevron={false}
              ariaLabel={`Remove ${cardLabel(card)}`} disabled={removing === card.id}
              trailing={<Trash2 size={17} aria-hidden="true" className="pay-remove" />} onClick={() => setConfirming(card.id)} />
          ))}
        </List>
      )}
      {error && status !== 'error' && <p className="ui-alert ui-alert--danger" role="alert"><AlertCircle size={16} aria-hidden="true" /> {error}</p>}
      <p className="add-card__note">Cards are stored securely by Stripe. AID only sees the last four digits.</p>

      {confirmCard && (
        <BottomSheet title={`Remove ${cardLabel(confirmCard)}?`} role="alertdialog" showClose={false} onClose={() => setConfirming(null)}
          footer={(
            <>
              <Button variant="destructive" block loading={removing === confirmCard.id} loadingLabel="Removing…" onClick={async () => {
                setRemoving(confirmCard.id)
                await remove(confirmCard.id)
                setRemoving(null)
                setConfirming(null)
              }}>Remove card</Button>
              <Button variant="secondary" block onClick={() => setConfirming(null)}>Keep card</Button>
            </>
          )}>
          <p className="sheet-text">A job already in progress stays paid with this card.</p>
        </BottomSheet>
      )}
    </BottomSheet>
  )
}
