// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { SettingsDropdown } from '../src/client/SettingsDropdown.tsx'
afterEach(cleanup)
it('opens a themed list, supports keyboard navigation, checkmarks and Escape without saving', () => {
  const onChange = vi.fn()
  render(<SettingsDropdown label="Setting" value="a" choices={['a', 'b']} labels={['First', 'Second']} onChange={onChange} />)
  const trigger = screen.getByRole('combobox')
  fireEvent.keyDown(trigger, { key: 'ArrowDown' })
  const first = screen.getByRole('option', { name: 'First' })
  expect(document.activeElement).toBe(first)
  expect(first.getAttribute('aria-selected')).toBe('true')
  fireEvent.keyDown(first, { key: 'ArrowDown' })
  expect(document.activeElement).toBe(screen.getByRole('option', { name: 'Second' }))
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
  expect(screen.queryByRole('listbox')).toBeNull()
  expect(document.activeElement).toBe(trigger)
  expect(onChange).not.toHaveBeenCalled()
  fireEvent.click(trigger); fireEvent.click(screen.getByRole('option', { name: 'Second' }))
  expect(onChange).toHaveBeenCalledWith('b')
  expect(screen.queryByRole('listbox')).toBeNull()
  expect(document.activeElement).toBe(trigger)
})
it('closes on outside click or ancestor scrolling and never opens while disabled', () => {
  const props = { label: 'Setting', value: 'a', choices: ['a'], labels: ['First'], onChange: vi.fn() }
  const view = render(<SettingsDropdown {...props} />)
  const trigger = screen.getByRole('combobox')
  fireEvent.click(trigger); fireEvent.pointerDown(document.body)
  expect(screen.queryByRole('listbox')).toBeNull()
  fireEvent.click(trigger); fireEvent.scroll(window)
  expect(screen.queryByRole('listbox')).toBeNull()
  view.rerender(<SettingsDropdown {...props} disabled />)
  fireEvent.click(trigger)
  expect(screen.queryByRole('listbox')).toBeNull()
})
