// KAN-6: Instrument the change from KAN-5 (which instrumented KAN-4's
// wallet-account onboarding). The approved analytics plan maps the core
// activation event `feature_action_submitted` onto the real "submit the
// add-account form" action, and requires a `time_to_submit_ms` property that
// measures how long the user spent before submitting.
//
// REPRODUCES BUG KAN-6: the add-account submitted analytics event is fired
// WITHOUT the required `time_to_submit_ms` property. This test fails on the
// current code (property missing / not numeric) and passes once the
// instrumentation adds a numeric `time_to_submit_ms` to the submitted event.

/* eslint-disable testing-library/no-node-access */
import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import Accounts from '../Accounts';
import * as analytics from '../../services/analytics';

// Mock the analytics service so we can inspect the emitted event payloads.
jest.mock('../../services/analytics');

// Resolve the track function regardless of whether analytics exposes a named
// `track` export or a default export exposing `track`.
function getTrackMock() {
  if (analytics && typeof analytics.track === 'function') return analytics.track;
  if (analytics && analytics.default && typeof analytics.default.track === 'function') {
    return analytics.default.track;
  }
  throw new Error('analytics.track mock not found');
}

function fillTextInputs(container, value) {
  const inputs = container.querySelectorAll(
    'input[type="text"], input:not([type]), input[type="search"]'
  );
  inputs.forEach((input) => {
    fireEvent.change(input, { target: { value } });
  });
  return inputs.length;
}

function findSubmitControl(container) {
  // Prefer an explicit submit button; fall back to any add/save-style button.
  const submit = container.querySelector('button[type="submit"], input[type="submit"]');
  if (submit) return submit;
  const buttons = Array.from(container.querySelectorAll('button'));
  return (
    buttons.find((b) => /add|save|submit|create|confirm/i.test(b.textContent || '')) ||
    buttons[0]
  );
}

describe('KAN-6 add-account submitted event includes time_to_submit_ms', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('the add-account submitted analytics event carries a numeric time_to_submit_ms', () => {
    const { container } = render(
      <MemoryRouter>
        <Accounts />
      </MemoryRouter>
    );

    // Enter a wallet address (KAN-4's core input) and submit the form.
    const filled = fillTextInputs(
      container,
      '0x1111111111111111111111111111111111111111'
    );
    expect(filled).toBeGreaterThan(0);

    const submit = findSubmitControl(container);
    expect(submit).toBeTruthy();

    // Submit both by clicking and by firing a form submit to cover either wiring.
    const form = submit.closest('form');
    if (form) {
      fireEvent.submit(form);
    }
    fireEvent.click(submit);

    const track = getTrackMock();
    expect(track).toHaveBeenCalled();

    // Locate the "submitted" activation event among all tracked calls.
    const submittedCall = track.mock.calls.find(([eventName]) =>
      /submit/i.test(String(eventName))
    );
    expect(submittedCall).toBeDefined();

    const props = submittedCall[1] || {};

    // The bug: time_to_submit_ms is not emitted with the submitted event.
    expect(props).toHaveProperty('time_to_submit_ms');
    expect(typeof props.time_to_submit_ms).toBe('number');
    expect(Number.isFinite(props.time_to_submit_ms)).toBe(true);
    expect(props.time_to_submit_ms).toBeGreaterThanOrEqual(0);
  });
});
