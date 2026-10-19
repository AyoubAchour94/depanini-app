import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { createTestQueryClient } from '@/test/queryClient';

import { RateTripCard, type RatingSide } from './RateTripCard';
import { RatingBadge } from './RatingBadge';
import { StarRatingInput } from './StarRatingInput';

jest.mock('@/firebase/firebase', () => ({ getCurrentIdToken: async () => 'id-token' }));
jest.mock('@/config/env', () => ({
  env: { mapboxAccessToken: undefined, apiUrl: 'http://api.test', environment: 'dev' },
}));

const ID = '7b0c8f2e-5d1a-4c3b-9e6f-2a1b3c4d5e6f';
const DEADLINE = '2026-01-08T10:40:00.000Z';

type Rating = {
  mine: { stars: number; tags: string[]; comment?: string | null } | null;
  otherSideRated: boolean;
  canRate: boolean;
  deadline: string;
};

const open: Rating = { mine: null, otherSideRated: false, canRate: true, deadline: DEADLINE };

let current: Rating;
/** What the next POST answers: a status code, or an issues body for a 400. */
let postAnswer: number | { status: 400; issues: unknown[] };
let posts: unknown[];

beforeEach(() => {
  current = open;
  postAnswer = 200;
  posts = [];
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    if (init?.method === 'POST') {
      posts.push(JSON.parse(String(init.body)));
      if (typeof postAnswer === 'number' && postAnswer !== 200) {
        return new Response('{}', { status: postAnswer });
      }
      if (typeof postAnswer === 'object') {
        return Response.json({ issues: postAnswer.issues }, { status: 400 });
      }
      const body = posts.at(-1) as { stars: number; tags: string[] };
      current = { ...current, mine: body, canRate: false };
    }
    expect(String(input)).toBe(`http://api.test/tow-requests/${ID}/rating`);
    return Response.json(current);
  });
});

afterEach(() => jest.restoreAllMocks());

async function renderCard(side: RatingSide = 'customer') {
  await render(
    <QueryClientProvider client={createTestQueryClient()}>
      <RateTripCard side={side} requestId={ID} />
    </QueryClientProvider>,
  );
}

const star = (n: number) => screen.getByRole('button', { name: n === 1 ? '1 star' : `${n} stars` });

describe('RateTripCard', () => {
  it('asks the customer to rate the driver, with the driver tags', async () => {
    await renderCard('customer');

    expect(await screen.findByText('Rate your driver')).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'Careful with the vehicle' })).toBeOnTheScreen();
    expect(screen.queryByRole('checkbox', { name: 'Clear location' })).toBeNull();
  });

  it('asks the driver to rate the customer, with the customer tags', async () => {
    await renderCard('driver');

    expect(await screen.findByText('Rate your customer')).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'Clear location' })).toBeOnTheScreen();
    expect(screen.queryByRole('checkbox', { name: 'Fair price' })).toBeNull();
  });

  it('sends the stars, tags and comment, then shows the sent state', async () => {
    await renderCard();
    await screen.findByText('Rate your driver');

    await fireEvent.press(star(5));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'On time' }));
    await fireEvent.changeText(screen.getByLabelText('Comment (optional)'), 'Great job');
    expect(screen.getByText('9/300')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Send rating' }));

    expect(await screen.findByText('Thanks for rating')).toBeOnTheScreen();
    expect(screen.getByText('You gave 5 stars')).toBeOnTheScreen();
    expect(posts).toEqual([{ stars: 5, tags: ['on_time'], comment: 'Great job' }]);
    expect(screen.queryByText('Rate your driver')).toBeNull();
  });

  it('asks for a rating before sending', async () => {
    await renderCard();
    await screen.findByText('Rate your driver');

    await fireEvent.press(screen.getByRole('button', { name: 'Send rating' }));

    expect(screen.getByText('Pick a rating.')).toBeOnTheScreen();
    expect(posts).toEqual([]);
  });

  it('requires a tag below 3 stars, and lets 3 stars go without one', async () => {
    await renderCard('driver');
    await screen.findByText('Rate your customer');

    await fireEvent.press(star(2));
    await fireEvent.press(screen.getByRole('button', { name: 'Send rating' }));
    expect(screen.getByText('Tell us what went wrong: pick at least one tag.')).toBeOnTheScreen();
    expect(posts).toEqual([]);

    await fireEvent.press(screen.getByRole('checkbox', { name: 'Made me wait' }));
    expect(screen.queryByText(/pick at least one tag/)).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Send rating' }));
    expect(await screen.findByText('Thanks for rating')).toBeOnTheScreen();
    expect(posts).toEqual([{ stars: 2, tags: ['made_me_wait'] }]);
  });

  it('sends 3 stars with no tag', async () => {
    await renderCard();
    await screen.findByText('Rate your driver');

    await fireEvent.press(star(3));
    await fireEvent.press(screen.getByRole('button', { name: 'Send rating' }));

    expect(await screen.findByText('Thanks for rating')).toBeOnTheScreen();
    expect(posts).toEqual([{ stars: 3, tags: [] }]);
  });

  it('shows the hint when the API names the tags in a 400', async () => {
    postAnswer = { status: 400, issues: [{ path: ['tags'], message: 'pick one' }] };
    await renderCard();
    await screen.findByText('Rate your driver');

    await fireEvent.press(star(4));
    await fireEvent.press(screen.getByRole('button', { name: 'Send rating' }));

    expect(
      await screen.findByText('Tell us what went wrong: pick at least one tag.'),
    ).toBeOnTheScreen();
  });

  it('hides the card when the API says it can no longer be rated (409)', async () => {
    postAnswer = 409;
    await renderCard();
    await screen.findByText('Rate your driver');
    current = { ...open, canRate: false };

    await fireEvent.press(star(5));
    await fireEvent.press(screen.getByRole('button', { name: 'Send rating' }));

    await waitFor(() => expect(screen.queryByText('Rate your driver')).toBeNull());
    expect(screen.queryByText(/Could not send/)).toBeNull();
  });

  it('shows an error on another failure and keeps the form', async () => {
    postAnswer = 500;
    await renderCard();
    await screen.findByText('Rate your driver');

    await fireEvent.press(star(5));
    await fireEvent.press(screen.getByRole('button', { name: 'Send rating' }));

    expect(await screen.findByText('Could not send your rating. Try again.')).toBeOnTheScreen();
    expect(screen.getByText('Rate your driver')).toBeOnTheScreen();
  });

  it('shows the sent state when the trip was already rated', async () => {
    current = { ...open, mine: { stars: 4, tags: [] }, canRate: false };
    await renderCard();

    expect(await screen.findByText('Thanks for rating')).toBeOnTheScreen();
    expect(screen.getByText('You gave 4 stars')).toBeOnTheScreen();
  });

  it('shows nothing outside the rating window', async () => {
    current = { ...open, canRate: false };
    await renderCard();

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByText('Rate your driver')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Send rating' })).toBeNull();
  });

  it('stops the comment at 300 characters', async () => {
    await renderCard();
    await screen.findByText('Rate your driver');

    expect(screen.getByLabelText('Comment (optional)').props.maxLength).toBe(300);
  });
});

describe('StarRatingInput', () => {
  it('has a labelled button per star, and a press picks it', async () => {
    const onChange = jest.fn();
    await render(<StarRatingInput value={2} onChange={onChange} />);

    expect(screen.getAllByRole('button')).toHaveLength(5);
    expect(screen.getByRole('button', { name: '1 star' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '2 stars', selected: true })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '4 stars' }));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('ignores presses while disabled', async () => {
    const onChange = jest.fn();
    await render(<StarRatingInput value={0} onChange={onChange} disabled />);

    await fireEvent.press(screen.getByRole('button', { name: '5 stars' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('RatingBadge', () => {
  it('shows the average and the count', async () => {
    await render(<RatingBadge rating={{ average: 4.7, count: 23 }} />);
    expect(screen.getByText('★ 4.7 (23)')).toBeOnTheScreen();
  });

  it('shows "New" when the average is held back', async () => {
    await render(<RatingBadge rating={{ average: null, count: 2 }} />);
    expect(screen.getByText('New')).toBeOnTheScreen();
  });

  it('shows nothing without a rating', async () => {
    await render(<RatingBadge rating={undefined} />);
    expect(screen.toJSON()).toBeNull();
  });
});
