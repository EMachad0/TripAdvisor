// Public, read-only API for the game. Import from 'platform/lib/index.js'.
export { loadPlaces, loadAreas, loadCredits, findPlaceFiles, findAreaFiles, resolvePlace, resolveArea } from './load.js';
export { validatePlace, validateArea, validatePlaceFile, validateAreaFile, validateAll } from './validate.js';
export { countsAgainstBudget, flagChips } from './render/index.js';
export { isStay, isAttraction, focusPos, hasPlaceholders } from './kinds.js';
export { loadTaste, readTaste, tasteSpec, mustDoStatus, mustDoKeys, statedWeight, tagSignals, categoryTargets, interestWeights, tasteDisagreements, formatStatedTaste } from './taste.js';
export { nextTasks, formatNext } from './next.js';
export { bookingLinks, bookingLevel, bookBadgeText, bookAheadList } from './booking.js';
export { gallerySlots, factSpans } from './render/layout.js';
export { renderPlacePage, renderPlaceCard, renderAreaCard, renderIndexPage, renderAreasPage, styles, copyAssets, md, mdInline, esc } from './render/index.js';
export { readFeedback, readJsonl, tasteSummary, formatTaste, FEEDBACK_SPECS, FEEDBACK_KINDS, latestNotes, currentNotes } from './feedback/index.js';
export { loadTripConfig } from './config.js';
export { gapReport, formatGaps, categoryBalance, areasWanted, GAP_DEFAULTS } from './gaps.js';
export { dataRoots, ROOT } from './paths.js';
export { COUNTRIES, COUNTRY_IDS, CATEGORIES, CATEGORY_IDS, ATTRACTION_CATEGORY_IDS, KINDS, BOOK_METHODS, BOOK_METHOD_IDS, CONFIDENCE, FAME, FAME_IDS, FAME_CHIP, MUST_DO_CHIP, STAY_STYLES } from './schema/enums.js';
export { BLOCKS, BLOCK_TYPES } from './schema/blocks.js';
export { placeSpec, areaSpec } from './schema/specs.js';
export { toJsonSchema } from './schema/dsl.js';
// Formatting + theme helpers (used by the game so its chrome matches the place pages).
export { fmtBRL, fmtLocal, titleCase, countryName, catLabel, shortName, themeBoot, themeToggle, LANG } from './render/util.js';
export { staticMap } from './staticmap.js';
// Round 6: dated events, link checks, duplicates, independent reviews.
export { tripMonths } from './when.js';
export { tileWindow } from './staticmap.js';
export { eventDates, eventDays, whenLabel, whenKind, whenTitle, weeklyDays, routeNote, singleDay, tripWindow, tripOverlap, tripOverlapInfo, sameDayGroups, looksDated } from './when.js';
export { cityLevel } from './feedback/index.js';
export { collectLinks, checkUrl, checkLinks, linkReport, readLinkCache, cachedLinkProblems } from './links.js';
export { loadReviews, reviewStatus, reviewSpec, contentHash } from './review.js';
export { findDuplicates } from './validate.js';
// Round 7: area pages, country overview map, feedback cursor.
export { renderAreaPage, renderCountryMap, areaPlaces, areaMustDo } from './render/index.js';
export { countryOverviewMap, overviewLayout, numberedAreas } from './overview.js';
export { AREA_BLOCK_TYPES, areaBlockSpec } from './schema/blocks.js';
export { newFeedback, formatNewFeedback, placeFeedback, formatPlaceFeedback, readSeen, readSeenState, markSeen, seenFile, latestTs } from './feedback/index.js';
// Round 8: attribution, geocoding, rendered pages.
export { commandWrites, commandWritesFile } from './attribution.js';
export { geoSearch, formatGeo, osmLink } from './geo.js';
export { renderPage, renderUrlProblem, tidyText } from './pageview.js';
export { folderSlug, fetchCommonsMany } from './media/index.js';
export { sessionCost } from './review.js';
// Route map (game Route tab): config seed + feedback/route.jsonl.
export { currentRoute, latestRoutes, formatRoute, normalizeConfigRoutes, stopsErrors, nightsBetween, ROUTE_STOP_SPEC, MAX_STOPS, MAX_NIGHTS } from './route.js';
export { project } from './staticmap.js';
// Answer cards: answers/*.md (written by Claude Code agents, shown on the site).
export { loadAnswers, parseAnswer, validateAnswers, checkAnswers, siteAnswers, resolveAbout, findAnswerFiles, byNewest, ANSWER_FIELDS } from './answers.js';
export { renderAnswerCard, renderAnswersSection, answerDate } from './render/answers.js';
export { unproject } from './overview.js';
