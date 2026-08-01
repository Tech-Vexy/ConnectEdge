// icebreakers.ts — on-device conversation starter generation
//
// No API calls. Generates contextually relevant openers from the
// intersection of two users' interest tags + intent alignment.
//
// Design principles:
//   - Specific > generic. "You both listed hiking — trails or peaks?" beats "Hey!"
//   - Question > statement. Opens a thread, doesn't close it.
//   - Short. Max 80 chars. Works as a chat bubble.
//   - Never cringey. No "your smile lights up the room" energy.
//   - Campus-aware. Some starters reference shared student contexts.

import type { PeerBroadcast, UserProfile, Match } from './types'

export interface Icebreaker {
  id:       string
  text:     string
  tags:     string[]   // which shared tags inspired this
  tone:     'playful' | 'curious' | 'direct' | 'campus'
}

// ─── Tag-specific starters ────────────────────────────────────────────────────

const TAG_STARTERS: Record<string, string[]> = {
  music: [
    "What's been on repeat for you lately?",
    "Last concert you went to — worth it?",
    "Albums or playlists kind of person?",
  ],
  hiking: [
    "Trails or peaks — what's your style?",
    "Best spot you've hiked around here?",
    "Day hike or multi-day camp kind of person?",
  ],
  film: [
    "Last film that actually stayed with you?",
    "Cinema or home setup — does it matter?",
    "What genre do you watch when nobody's judging?",
  ],
  cooking: [
    "What's your signature dish?",
    "Do you meal prep or cook when inspired?",
    "Best thing you've learned to make recently?",
  ],
  travel: [
    "Somewhere you want to go that surprises people?",
    "Itinerary planner or figure it out when you land?",
    "Best trip you've taken that wasn't Instagram-worthy?",
  ],
  tech: [
    "What are you building or learning right now?",
    "What's the last app that actually impressed you?",
    "Hardware or software side of things?",
  ],
  art: [
    "What kind of art do you actually make vs just admire?",
    "Gallery or street art kind of person?",
    "Last creative thing you made?",
  ],
  sports: [
    "Playing or watching kind of sports fan?",
    "What sport do you wish more people took seriously?",
    "Gym routine or outdoor stuff?",
  ],
  reading: [
    "Last book you didn't want to put down?",
    "Fiction or nonfiction — or does it depend?",
    "Do you read one book at a time or five at once?",
  ],
  gaming: [
    "What are you playing right now?",
    "Casual or properly competitive?",
    "Solo campaign or multiplayer?",
  ],
  yoga: [
    "Morning practice or end-of-day wind-down?",
    "Studio or home setup?",
    "What got you into it?",
  ],
  coffee: [
    "Black or with something — strong opinion?",
    "Best coffee you've had near campus?",
    "Café worker or bring your own?",
  ],
  photography: [
    "What do you shoot — people, places, things?",
    "Film or digital, or do you not care?",
    "What's your most underrated shot?",
  ],
  dancing: [
    "Trained or just feel it out?",
    "What style do you actually dance?",
    "Best venue you've danced at?",
  ],
  volunteering: [
    "What cause do you actually show up for?",
    "How did you get into volunteering?",
    "Ongoing commitment or one-off events?",
  ],
  startups: [
    "Working on anything right now?",
    "Founder energy or would you rather build inside something?",
    "What problem do you keep thinking should be solved?",
  ],
  fitness: [
    "What's your current fitness goal?",
    "Gym rat or outdoor workouts?",
    "What got you into fitness?",
  ],
  nature: [
    "What's your favorite way to be outside?",
    "Beach or mountains kind of person?",
    "Best nature spot you've been to lately?",
  ],
  foodie: [
    "What's your go-to comfort food?",
    "Cooking at home or trying new restaurants?",
    "Best meal you've had recently?",
  ],
  pets: [
    "Dog or cat person — or both?",
    "What's your pet's personality like?",
    "Any funny pet stories?",
  ],
  movies: [
    "What's a movie you can watch over and over?",
    "Cinema or streaming at home?",
    "What genre do you gravitate toward?",
  ],
  podcasts: [
    "What podcasts are you into right now?",
    "True crime or something lighter?",
    "Any podcast recommendations?",
  ],
  writing: [
    "What do you like to write?",
    "Fiction or nonfiction?",
    "What are you working on?",
  ],
  crafts: [
    "What kind of crafts do you do?",
    "How did you get into it?",
    "What's your latest project?",
  ],
  science: [
    "What area of science fascinates you?",
    "Any recent scientific discoveries that caught your attention?",
    "Sci-fi or hard science kind of person?",
  ],
  history: [
    "What historical period interests you most?",
    "Any favorite historical figures?",
    "Documentaries or historical fiction?",
  ],
  languages: [
    "What languages do you speak?",
    "What are you learning right now?",
    "Best way you've found to learn a language?",
  ],
  meditation: [
    "How did you get into meditation?",
    "Morning or evening practice?",
    "Apps or guided vs self-directed?",
  ],
  camping: [
    "Glamping or rough it kind of camper?",
    "Best camping spot you've been to?",
    "What's your essential camping gear?",
  ],
  cycling: [
    "Road or mountain biking?",
    "What's your favorite route?",
    "How did you get into cycling?",
  ],
  swimming: [
    "Pool or open water?",
    "What's your favorite swimming spot?",
    "Laps or just for fun?",
  ],
  running: [
    "What's your running routine?",
    "5K, 10K, or marathon kind of runner?",
    "Treadmill or outdoors?",
  ],
  'board games': [
    "What's your favorite board game?",
    "Strategy or party games?",
    "Any game recommendations?",
  ],
  karaoke: [
    "What's your go-to karaoke song?",
    "Do you perform or just watch?",
    "Best karaoke night you've had?",
  ],
  concerts: [
    "Last concert you went to?",
    "Small venues or big stadiums?",
    "What's on your concert bucket list?",
  ],
  museums: [
    "What kind of museums do you like?",
    "Art, history, or science?",
    "Best museum you've visited?",
  ],
  theater: [
    "Plays or musicals?",
    "Community theater or Broadway?",
    "Last show you saw?",
  ],
  comedy: [
    "Stand-up or sketch comedy?",
    "Any comedians you're into?",
    "Best comedy show you've seen?",
  ],
  astrology: [
    "What's your sign — and do you believe in it?",
    "Do you read your horoscope?",
    "Big or small astrology energy?",
  ],
  gardening: [
    "What do you grow?",
    "Indoor plants or outdoor garden?",
    "How did you get into gardening?",
  ],
  DIY: [
    "What kind of DIY projects do you do?",
    "What's your latest project?",
    "Any DIY fails you can laugh about now?",
  ],
  fashion: [
    "What's your style vibe?",
    "Thrifting or retail?",
    "Any fashion icons?",
  ],
  sustainability: [
    "What sustainability practices do you follow?",
    "What eco-friendly change have you made recently?",
    "Big or small sustainability goals?",
  ],
  vegan: [
    "How long have you been vegan?",
    "What's your favorite vegan dish?",
    "Any vegan restaurant recommendations?",
  ],
  'craft beer': [
    "What's your favorite craft beer?",
    "IPAs or something else?",
    "Any brewery recommendations?",
  ],
  wine: [
    "Red, white, or rosé?",
    "Any wine regions you love?",
    "What's your go-to wine?",
  ],
  tea: [
    "What kind of tea do you drink?",
    "Coffee or tea person?",
    "Any tea recommendations?",
  ],
  anime: [
    "What anime are you watching?",
    "Shonen or slice of life?",
    "Any anime recommendations?",
  ],
  comics: [
    "Marvel or DC?",
    "What comics are you reading?",
    "Graphic novels or single issues?",
  ],
  'sci-fi': [
    "Hard sci-fi or space opera?",
    "What sci-fi are you into?",
    "Any sci-fi recommendations?",
  ],
  fantasy: [
    "High fantasy or urban fantasy?",
    "What fantasy series do you love?",
    "Any fantasy recommendations?",
  ],
  horror: [
    "Psychological or gore kind of horror?",
    "What horror movies do you like?",
    "Any horror recommendations?",
  ],
}

// ─── Intent-based starters (when intent scores align) ─────────────────────────

const INTENT_STARTERS: Record<string, string[]> = {
  casual: [
    "No pressure — what brought you to the app?",
    "Good things usually start with a question. What's yours?",
    "What are you actually hoping to find nearby?",
  ],
  serious: [
    "What matters most to you in a relationship?",
    "What's a dealbreaker people are usually surprised by?",
    "What does a really good week look like for you?",
  ],
  open: [
    "What are you up to this week?",
    "Something that's been on your mind lately?",
    "Best thing that happened to you recently?",
  ],
}

// ─── Campus-specific starters ─────────────────────────────────────────────────

const CAMPUS_STARTERS = [
  "What are you studying — or what do you wish you were?",
  "Best spot on campus you don't think people know about?",
  "Lectures in person or would you rather they were all recorded?",
  "What year are you — and does it feel like that?",
  "What's your go-to study spot when the library is full?",
  "What module are you actually enjoying right now?",
]

// ─── Generic fallbacks ────────────────────────────────────────────────────────

const GENERIC_STARTERS = [
  "What's been the best part of your week?",
  "What do you do when you're not doing whatever you do?",
  "What's something you've been excited about lately?",
  "Recommend me something — anything.",
  "What's your go-to when you want to completely switch off?",
]

// ─── Generator ────────────────────────────────────────────────────────────────

/**
 * Generate 3 icebreaker options for a match.
 * Ordered: tag-specific (most relevant) → intent-based → campus → generic.
 */
export function generateIcebreakers(
  myProfile:  UserProfile,
  theirBroadcast: PeerBroadcast,
  count = 3,
): Icebreaker[] {
  const sharedTags = myProfile.prefs.interestTags.filter(t =>
    theirBroadcast.interestTags.includes(t)
  )

  const results: Icebreaker[] = []
  const used = new Set<string>()

  const add = (text: string, tags: string[], tone: Icebreaker['tone']) => {
    if (used.has(text) || results.length >= count) return
    used.add(text)
    results.push({ id: Math.random().toString(36).slice(2), text, tags, tone })
  }

  // 1. Tag-specific — pick the tag with the most starters, take one randomly
  const shuffledTags = [...sharedTags].sort(() => Math.random() - 0.5)
  for (const tag of shuffledTags) {
    const starters = TAG_STARTERS[tag]
    if (starters) {
      const picked = starters[Math.floor(Math.random() * starters.length)]
      add(picked, [tag], 'curious')
    }
    if (results.length >= count) break
  }

  // 2. Intent-based
  if (results.length < count) {
    const myIntent    = myProfile.prefs.intentScore
    const theirIntent = theirBroadcast.intentScore
    const avgIntent   = (myIntent + theirIntent) / 2
    const intentKey   = avgIntent < 0.33 ? 'casual' : avgIntent < 0.66 ? 'open' : 'serious'
    const intentPool  = INTENT_STARTERS[intentKey]
    const picked      = intentPool[Math.floor(Math.random() * intentPool.length)]
    add(picked, [], 'direct')
  }

  // 3. Campus starters
  if (results.length < count) {
    const picked = CAMPUS_STARTERS[Math.floor(Math.random() * CAMPUS_STARTERS.length)]
    add(picked, [], 'campus')
  }

  // 4. Generic fallback
  while (results.length < count) {
    const picked = GENERIC_STARTERS[Math.floor(Math.random() * GENERIC_STARTERS.length)]
    add(picked, [], 'playful')
  }

  return results.slice(0, count)
}

/**
 * Get shared interest tags between two profiles.
 */
export function getSharedTags(
  myTags:    string[],
  theirTags: string[],
): string[] {
  const set = new Set(theirTags)
  return myTags.filter(t => set.has(t))
}

/**
 * Human-readable compatibility summary string for the match card.
 * e.g. "You both love hiking, music, and film"
 */
export function compatibilitySummary(
  sharedTags:  string[],
  score:       number,
  theirName:   string,
): string {
  if (sharedTags.length === 0) {
    if (score >= 75) return `You and ${theirName} are a strong match`
    if (score >= 55) return `You and ${theirName} have good compatibility`
    return `You and ${theirName} matched nearby`
  }
  if (sharedTags.length === 1) {
    return `You both love ${sharedTags[0]}`
  }
  if (sharedTags.length === 2) {
    return `You both love ${sharedTags[0]} and ${sharedTags[1]}`
  }
  return `You both love ${sharedTags.slice(0, 2).join(', ')} and ${sharedTags.length - 2} more`
}
