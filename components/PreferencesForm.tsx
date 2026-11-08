'use client'

import { useActionState } from 'react'
import { savePreferences, type PreferencesState } from '@/actions/profile'
import type { TemperatureUnit, WeightUnit } from '@/lib/units'

type Props = {
  tempUnit: TemperatureUnit
  weightUnit: WeightUnit
  blindTasting: boolean
}

const optionStyle = { display: 'flex', alignItems: 'center', gap: 8, minHeight: 44 } as const
const legendStyle = { fontWeight: 600, fontSize: 15, padding: 0, marginBottom: 4 } as const

export function PreferencesForm({ tempUnit, weightUnit, blindTasting }: Props) {
  const [state, action, pending] = useActionState<PreferencesState, FormData>(savePreferences, {
    status: 'idle',
  })

  return (
    <form action={action} noValidate>
      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 12 }}>Preferences</div>

      <fieldset aria-describedby="units-help" style={{ border: 0, margin: '0 0 12px', padding: 0 }}>
        <legend style={legendStyle}>Temperature unit</legend>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <label style={optionStyle}>
            <input type="radio" name="tempUnit" value="c" defaultChecked={tempUnit === 'c'} />
            <span>Celsius (°C)</span>
          </label>
          <label style={optionStyle}>
            <input type="radio" name="tempUnit" value="f" defaultChecked={tempUnit === 'f'} />
            <span>Fahrenheit (°F)</span>
          </label>
        </div>
      </fieldset>

      <fieldset aria-describedby="units-help" style={{ border: 0, margin: '0 0 12px', padding: 0 }}>
        <legend style={legendStyle}>Weight unit</legend>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <label style={optionStyle}>
            <input type="radio" name="weightUnit" value="g" defaultChecked={weightUnit === 'g'} />
            <span>Grams (g)</span>
          </label>
          <label style={optionStyle}>
            <input type="radio" name="weightUnit" value="oz" defaultChecked={weightUnit === 'oz'} />
            <span>Ounces (oz)</span>
          </label>
        </div>
      </fieldset>
      <p id="units-help" className="subtle" style={{ margin: '0 0 16px' }}>
        Only changes how amounts are shown and typed. What you have saved is never altered.
      </p>

      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minHeight: 44 }}>
        <input
          type="checkbox"
          name="blindTasting"
          defaultChecked={blindTasting}
          aria-describedby="blind-help"
          style={{ marginTop: 4 }}
        />
        <span>Blind tasting</span>
      </label>
      <p id="blind-help" className="subtle" style={{ margin: '4px 0 12px' }}>
        On tea pages you have not reviewed yet, hide the community score, reviews, brew guide and
        similar teas until you have rated the tea yourself. Tea lists still show scores.
      </p>

      <button type="submit" className="btn btn-outline btn-sm" disabled={pending}>
        {pending ? 'Saving…' : 'Save preferences'}
      </button>
      <div aria-live="polite">
        {state.status === 'error' && (
          <p className="field-error" role="alert">
            {state.message}
          </p>
        )}
        {state.status === 'saved' && (
          <p className="subtle" style={{ margin: '6px 0 0', color: 'var(--color-primary)' }}>
            {state.message}
          </p>
        )}
      </div>
    </form>
  )
}
