import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import AndroidMobileTopBar from '../components/native/AndroidMobileTopBar';

const user = { id: 'u1', name: 'Alex Morgan' } as never;

describe('AndroidMobileTopBar page title', () => {
  it('names the page from the route', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard/study']}>
        <AndroidMobileTopBar user={user} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Study')).toBeTruthy();
  });

  // The visual harness renders every screen at /__e2e/android, which no
  // route name matches; without an explicit title the bar read
  // "BonaMind / BONAMIND" in every store screenshot.
  it('uses an explicit title when the route has none', () => {
    render(
      <MemoryRouter initialEntries={['/__e2e/android?screen=library']}>
        <AndroidMobileTopBar user={user} title="Library" />
      </MemoryRouter>,
    );
    expect(screen.getByText('Library')).toBeTruthy();
  });
});
