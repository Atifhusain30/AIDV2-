/**
 * B15: rate the other person after a job — 1–5 stars, optional tags, optional private note.
 * Used by the customer (rating the driver, on the receipt / reminder) and the driver (rating the
 * customer after completing). Tag choices and the comment limit come from the server.
 *
 * Star control: a radio group — Tab reaches it, arrow keys / Home / End change the rating, every
 * star has a spoken label ("4 stars, Good") and a 48px target.
 */

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { AlertCircle, Check, Star } from 'lucide-react'
import Dialog from '../ui/Dialog'
import { apiService } from '../../services/api'
import { STAR_WORDS, type PendingRating } from '../../lib/ratings'

interface RatingSheetProps {
  pending: PendingRating
  /** 'after_job' right after the job / on the receipt; 'reminder' is the one prompt on next open. */
  context: 'after_job' | 'reminder'
  /** Saved: the server accepted the rating (or it was already rated). */
  onRated: () => void
  /** Closed without rating ("Skip" / "Not now"). */
  onSkip: () => void
}

export function StarInput({ value, onChange, disabled }: { value: number; onChange: (stars: number) => void; disabled?: boolean }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const focusable = value || 1
  const move = (next: number) => {
    const stars = Math.min(5, Math.max(1, next))
    onChange(stars)
    refs.current[stars - 1]?.focus()
  }
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, stars: number) => {
    const keys: Record<string, number> = { ArrowRight: stars + 1, ArrowUp: stars + 1, ArrowLeft: stars - 1, ArrowDown: stars - 1, Home: 1, End: 5 }
    if (event.key in keys) {
      event.preventDefault()
      move(keys[event.key])
    }
  }
  return (
    <div className="rating-stars" role="radiogroup" aria-label="Rating, 1 to 5 stars" aria-required="true">
      {[1, 2, 3, 4, 5].map((stars) => (
        <button
          key={stars}
          ref={(element) => { refs.current[stars - 1] = element }}
          type="button"
          role="radio"
          aria-checked={value === stars}
          aria-label={`${stars} ${stars === 1 ? 'star' : 'stars'}, ${STAR_WORDS[stars - 1]}`}
          tabIndex={stars === focusable ? 0 : -1}
          disabled={disabled}
          className={`rating-star${stars <= value ? ' is-on' : ''}`}
          onClick={() => onChange(stars)}
          onKeyDown={(event) => onKeyDown(event, stars)}
        >
          <Star size={30} aria-hidden="true" />
        </button>
      ))}
    </div>
  )
}

export default function RatingSheet({ pending, context, onRated, onSkip }: RatingSheetProps) {
  const [stars, setStars] = useState(0)
  const [tags, setTags] = useState<string[]>([])
  const [comment, setComment] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)
  const name = pending.rateeFirstName || (pending.rateeRole === 'driver' ? 'your driver' : 'the customer')
  const ratingDriver = pending.rateeRole === 'driver'
  const sending = state === 'sending'
  const max = pending.commentMaxLength || 500

  // The submit button disappears once saved: keep focus in the sheet on "Done".
  const doneRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { if (state === 'sent') doneRef.current?.focus() }, [state])

  const toggleTag = (id: string) => setTags((current) => (current.includes(id) ? current.filter((tag) => tag !== id) : [...current, id]))

  const submit = async () => {
    if (!stars || sending) return
    setState('sending')
    setError(null)
    const result = await apiService.submitRating(pending.bookingId, { stars, tags, ...(comment.trim() ? { comment: comment.trim() } : {}) })
    if (!result.success && result.code !== 'already_rated') {
      setState('idle')
      setError(result.error || 'Unable to save your rating. Try again.')
      return
    }
    setState('sent')
  }

  const title = state === 'sent' ? 'Thanks for rating' : `How was ${name}?`
  const intro = context === 'reminder'
    ? `You haven't rated your ${pending.serviceName.toLowerCase()} ${ratingDriver ? `with ${name}` : `for ${name}`} yet.`
    : ratingDriver ? `Rate your ${pending.serviceName.toLowerCase()} driver.` : `Rate ${name} for this ${pending.serviceName.toLowerCase()} job.`

  return (
    <Dialog labelledBy="rating-title" describedBy="rating-intro" className="account-sheet rating-sheet" backdropClassName="account-sheet-backdrop rating-backdrop"
      dismissible={!sending} onClose={state === 'sent' ? onRated : onSkip}>
        <h2 id="rating-title" className="job-confirm__title">{title}</h2>
        {state === 'sent' ? (
          <>
            <p id="rating-intro" className="job-confirm__text" role="status">
              {ratingDriver ? `Your rating helps other customers and helps ${name} improve.` : 'Your rating helps keep AID respectful for drivers.'}
              {comment.trim() ? ' Your note goes to the AID team only.' : ''}
            </p>
            <div className="job-confirm__actions"><button ref={doneRef} type="button" className="aid-primary-button" onClick={onRated}><Check size={18} aria-hidden="true" /> Done</button></div>
          </>
        ) : (
          <>
            <p id="rating-intro" className="job-confirm__text">{intro}</p>
            <StarInput value={stars} onChange={setStars} disabled={sending} />
            <p className="rating-stars__word" aria-hidden="true">{stars ? STAR_WORDS[stars - 1] : 'Tap a star'}</p>

            {pending.tags.length > 0 && (
              <>
                <p className="job-choices__label" id="rating-tags-label">{ratingDriver ? 'What went well? (optional)' : 'Anything to note? (optional)'}</p>
                <div className="rating-tags" role="group" aria-labelledby="rating-tags-label">
                  {pending.tags.map((tag) => (
                    <button key={tag.id} type="button" className={`rating-tag${tags.includes(tag.id) ? ' is-selected' : ''}`} aria-pressed={tags.includes(tag.id)} disabled={sending} onClick={() => toggleTag(tag.id)}>
                      {tags.includes(tag.id) && <Check size={14} aria-hidden="true" />}{tag.label}
                    </button>
                  ))}
                </div>
              </>
            )}

            <div className="job-issue-details rating-comment">
              <label htmlFor="rating-comment">Private note to AID (optional)</label>
              <textarea id="rating-comment" value={comment} maxLength={max} rows={3} disabled={sending} aria-describedby="rating-comment-hint"
                onChange={(event) => setComment(event.target.value)} placeholder="Anything the AID team should know?" />
              <small id="rating-comment-hint" className="rating-comment__hint">Only the AID team sees this — {name} won't. {comment.length}/{max}</small>
            </div>

            {error && <p className="job-error" role="alert"><AlertCircle size={15} aria-hidden="true" /> {error}</p>}
            <div className="job-confirm__actions">
              <button type="button" className="aid-primary-button" disabled={!stars || sending} aria-busy={sending} onClick={() => void submit()}>
                {sending ? 'Saving…' : stars ? 'Submit rating' : 'Choose stars to submit'}
              </button>
              <button type="button" className="job-keep" disabled={sending} onClick={onSkip}>{context === 'reminder' ? 'Not now' : 'Skip'}</button>
            </div>
          </>
        )}
    </Dialog>
  )
}
