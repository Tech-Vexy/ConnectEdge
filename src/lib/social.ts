// lib/social.ts — P2P Social Platform Utilities & Pre-seeded Hubs/Events

import type { SocialPost, SocialHub, SocialEvent, SocialMode } from './types'

export const DEMO_HUBS: SocialHub[] = [
  {
    id:          'hub-tech-builders',
    name:        'Campus Tech Builders',
    description: 'Collaborate on open-source projects, discuss AI, React Native, and build cool apps together.',
    icon:        '⚡',
    category:    'Tech & Hacking',
    memberCount: 42,
    isJoined:    true,
    tags:        ['tech', 'startups', 'science'],
  },
  {
    id:          'hub-weekend-hikers',
    name:        'Weekend Hikers & Explorers',
    description: 'Organizing group hikes, nature walks, and outdoor camping adventures every weekend.',
    icon:        '🥾',
    category:    'Outdoors & Fitness',
    memberCount: 28,
    isJoined:    false,
    tags:        ['hiking', 'nature', 'camping', 'fitness'],
  },
  {
    id:          'hub-coffee-code',
    name:        'Coffee & Deep Focus',
    description: 'Finding the best local cafes for study sessions, remote work, and quiet coffee chats.',
    icon:        '☕',
    category:    'Social Hangouts',
    memberCount: 35,
    isJoined:    true,
    tags:        ['coffee', 'reading', 'writing'],
  },
  {
    id:          'hub-anime-gaming',
    name:        'Anime & Gaming Lounge',
    description: 'Board games, casual video games, anime watch parties, and pop culture discussions.',
    icon:        '🎮',
    category:    'Entertainment',
    memberCount: 50,
    isJoined:    false,
    tags:        ['gaming', 'anime', 'board games', 'comics'],
  },
  {
    id:          'hub-foodies-cooks',
    name:        'Local Foodies & Home Cooks',
    description: 'Sharing secret food spots, recipe exchanges, dinner potlucks, and culinary adventures.',
    icon:        '🍜',
    category:    'Food & Drink',
    memberCount: 31,
    isJoined:    false,
    tags:        ['foodie', 'cooking', 'wine', 'tea'],
  },
]

export const DEMO_EVENTS: SocialEvent[] = [
  {
    id:              'evt-1',
    title:           'Weekend Tech & Coffee Hangout',
    description:     'Bring your laptop or a book! Low-key social session with local builders and coffee lovers.',
    organizerPeerId: 'peer-demo-alex',
    organizerName:   'Alex Chen',
    location:        'Javahouse Cafe & Commons',
    dateStr:         'Tomorrow, 4:00 PM',
    category:        'Tech & Social',
    attendeesCount:  14,
    isRSVPed:        true,
    gradient:        ['#667eea', '#764ba2'],
  },
  {
    id:              'evt-2',
    title:           'Sunset Hike & Trail Run',
    description:     '3km scenic trail hike suitable for all fitness levels. Meet at the main trail head.',
    organizerPeerId: 'peer-demo-sarah',
    organizerName:   'Sarah M.',
    location:        'Green Hills Reserve',
    dateStr:         'Saturday, 9:00 AM',
    category:        'Fitness & Outdoors',
    attendeesCount:  9,
    isRSVPed:        false,
    gradient:        ['#4facfe', '#00f2fe'],
  },
  {
    id:              'evt-3',
    title:           'Board Game & Trivia Night',
    description:     'Catan, Ticket to Ride, and casual pub trivia. Snacks provided!',
    organizerPeerId: 'peer-demo-david',
    organizerName:   'David K.',
    location:        'Community Center Room B',
    dateStr:         'Friday, 7:00 PM',
    category:        'Gaming',
    attendeesCount:  18,
    isRSVPed:        false,
    gradient:        ['#ff0844', '#ffb199'],
  },
]

export const DEMO_POSTS: SocialPost[] = [
  {
    id:           'post-1',
    authorPeerId: 'peer-demo-alex',
    authorName:   'Alex Chen',
    content:      'Any fellow developers down for a coffee & co-working session this afternoon around the central square? Working on a new P2P project! ☕💻',
    timestamp:    Date.now() - 1000 * 60 * 25, // 25 mins ago
    likesCount:   5,
    likedByMe:    false,
    tags:         ['tech', 'coffee', 'startups'],
    mode:         'networking',
  },
  {
    id:           'post-2',
    authorPeerId: 'peer-demo-sarah',
    authorName:   'Sarah M.',
    content:      'Organizing a Saturday morning trail run at Green Hills! We usually grab smoothies after. Everyone is welcome regardless of pace 🏃‍♀️✨',
    timestamp:    Date.now() - 1000 * 60 * 120, // 2 hours ago
    likesCount:   12,
    likedByMe:    true,
    tags:         ['fitness', 'nature', 'sports'],
    mode:         'friends',
  },
  {
    id:           'post-3',
    authorPeerId: 'peer-demo-david',
    authorName:   'David K.',
    content:      'Just finished reading "The Design of Everyday Things" — high quality read for anyone interested in UX or product design. What books are you all reading lately?',
    timestamp:    Date.now() - 1000 * 60 * 300, // 5 hours ago
    likesCount:   8,
    likedByMe:    false,
    tags:         ['reading', 'tech'],
    mode:         'all',
  },
]

export function createSocialPost(
  authorPeerId: string,
  authorName:   string,
  content:      string,
  tags:         string[] = [],
  mode:         SocialMode = 'all',
  hubId?:       string,
  photoUri?:    string,
): SocialPost {
  return {
    id:           `post-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    authorPeerId,
    authorName,
    content:      content.trim(),
    photoUri,
    timestamp:    Date.now(),
    likesCount:   0,
    likedByMe:    false,
    tags,
    mode,
    hubId,
  }
}
