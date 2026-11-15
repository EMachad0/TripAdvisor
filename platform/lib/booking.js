// Booking helpers shared by validator, renderer, gaps and the game.
// book_ahead.required: true (must book) | "recommended" (safer to book) | false.

import { isStay } from './kinds.js';

const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };

/** 'required' | 'recommended' | 'none' */
export function bookingLevel(baOrPlace) {
  const ba = baOrPlace?.book_ahead ?? baOrPlace;
  if (ba?.required === true) return 'required';
  if (ba?.required === 'recommended') return 'recommended';
  return 'none';
}

/** Booking channels [{label, url, note?}] from `links` or the legacy single `link`. Accepts a place or its book_ahead. */
export function bookingLinks(baOrPlace) {
  const ba = baOrPlace?.book_ahead ?? baOrPlace;
  if (Array.isArray(ba?.links) && ba.links.length) return ba.links.filter((l) => l?.url);
  return ba?.link ? [{ label: `Book on ${hostOf(ba.link)}`, url: ba.link }] : [];
}

// Booking platforms by host: `method: platform` is labelled with the name of the first link's site.
const PLATFORMS = { 'hostelworld.com': 'Hostelworld', 'booking.com': 'Booking.com', 'klook.com': 'Klook', 'getyourguide.com': 'GetYourGuide', 'trip.com': 'Trip.com', 'agoda.com': 'Agoda', 'hostelz.com': 'Hostelz', 'expedia.com': 'Expedia', 'airbnb.com': 'Airbnb', 'kkday.com': 'KKday', 'viator.com': 'Viator', 'ctrip.com': 'Ctrip', 'rakuten.co.jp': 'Rakuten Travel', 'jalan.net': 'Jalan', 'catchtable.net': 'Catchtable' };
export const isTel = (u) => typeof u === 'string' && /^tel:/i.test(u.trim());
/** "Hostelworld" for https://www.hostelworld.com/…, else the bare host. */
export function platformName(url) {
  const h = hostOf(url);
  const key = Object.keys(PLATFORMS).find((k) => h === k || h.endsWith('.' + k));
  return key ? PLATFORMS[key] : h;
}
/** The first non-phone booking link's platform name, when it is a known booking platform (else null). */
export function knownPlatform(ba) {
  const l = bookingLinks(ba).find((x) => !isTel(x.url));
  if (!l) return null;
  const h = hostOf(l.url);
  return Object.keys(PLATFORMS).some((k) => h === k || h.endsWith('.' + k)) ? platformName(l.url) : null;
}
/** "30 Nov" */
export const shortDay = (d) => { const t = new Date(String(d).slice(0, 10) + 'T00:00:00Z'); return isNaN(t) ? String(d) : t.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }); };

/** Badge text, or null when no booking is needed. A `deadline` wins over lead_days ("Book by 30 Nov"). */
export function bookBadgeText(ba) {
  const level = bookingLevel(ba);
  if (level === 'none') return null;
  if (ba.deadline) {
    const pp = ba.passport || ba.method === 'passport-registered' ? ' · passport' : '';
    return level === 'recommended' ? `Booking recommended · by ${shortDay(ba.deadline)}${pp}` : `Book by ${shortDay(ba.deadline)}${pp}`;
  }
  const d = ba.lead_days;
  const ahead = d === undefined ? '' : d === 0 ? 'same day' : d === 1 ? '1 day ahead' : `${d} days ahead`;
  const passport = ba.passport || ba.method === 'passport-registered' ? ' · passport' : '';
  if (level === 'recommended') return `Booking recommended${ahead ? ` · ${ahead}` : ''}${passport}`;
  return `${d === undefined ? 'Book ahead' : d === 0 ? 'Book before going' : `Book ${ahead}`}${passport}`;
}

/**
 * The game's book-ahead list: every place where booking is required or recommended,
 * most urgent first (required before recommended, then larger lead_days first).
 */
export function bookAheadList(places) {
  return places
    .filter((p) => bookingLevel(p) !== 'none')
    .map((p) => ({ id: p.id, name: p.name, country: p.country, city: p.city, category: p.category, stay: isStay(p), level: bookingLevel(p), lead_days: p.book_ahead.lead_days, deadline: p.book_ahead.deadline, lead_time: p.book_ahead.lead_time, method: p.book_ahead.method, passport: !!p.book_ahead.passport, links: bookingLinks(p), rules_changed: p.book_ahead.rules_changed, badge: bookBadgeText(p.book_ahead) }))
    .sort((a, b) => (a.level === b.level ? 0 : a.level === 'required' ? -1 : 1) || (b.lead_days ?? 0) - (a.lead_days ?? 0));
}
