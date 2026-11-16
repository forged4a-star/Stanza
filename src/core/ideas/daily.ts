/**
 * Idea of the day: a question or a situation to write from, picked by date.
 * These are prompts, never lyrics. Some come with a constraint card.
 */
export interface DailyIdea {
  id: string;
  prompt: string;
  /** a constraint card id to write inside, if the idea has one */
  card?: string;
}

export const IDEAS: DailyIdea[] = [
  { id: 'room', prompt: 'Describe a room you will never go back to, without saying how you feel about it.' },
  { id: 'small', prompt: 'Write about leaving someone, using only small words.', card: 'small-words' },
  { id: 'door', prompt: 'A door that was open yesterday is closed today. What changed?' },
  { id: 'letter', prompt: 'Something you would say in a letter you will never send.' },
  { id: 'object', prompt: 'Pick an object in the room you are in. Write from its point of view.' },
  { id: 'question', prompt: 'Ask the same person five questions and never let them answer.', card: 'questions' },
  { id: 'weather', prompt: 'Weather that matches a mood you cannot name. Leave the mood out.' },
  { id: 'tight', prompt: 'Say what you would say to your younger self in as few words as you can.', card: 'tight' },
  { id: 'smell', prompt: 'A smell that brings back a place. What is in that place?' },
  { id: 'argument', prompt: 'Two people agree on everything except one small thing. What is it?' },
  { id: 'noart', prompt: 'Describe a love song without using “the”, “a” or “an”.', card: 'no-articles' },
  { id: 'hands', prompt: 'What do someone’s hands tell you about their day?' },
  { id: 'last', prompt: 'The last ordinary thing you did before something changed.' },
  { id: 'nowords', prompt: 'A chorus with no rhymes at all. Make it feel finished anyway.', card: 'no-end-rhyme' },
  { id: 'street', prompt: 'Walk down a street you grew up on. What has been replaced?' },
  { id: 'gift', prompt: 'A gift that meant more than the person knew.' },
  { id: 'time', prompt: 'It is 3 a.m. and you are awake. Who or what is keeping you up?' },
  { id: 'hard', prompt: 'Make every line end on a hard, strong syllable. Write about something you refuse to do.', card: 'land-hard' },
  { id: 'stranger', prompt: 'A stranger on a train says one sentence that sticks. What is it, and what happens next?' },
  { id: 'rhymeall', prompt: 'A verse where every line rhymes with another one. Let the sound lead you somewhere surprising.', card: 'all-rhyme' },
  { id: 'kitchen', prompt: 'The kitchen at a party at midnight. Who is still there?' },
  { id: 'map', prompt: 'A map of a place that no longer exists the way you remember it.' },
  { id: 'apology', prompt: 'An apology that is also an excuse.' },
  { id: 'nothing', prompt: 'Nothing happens in the first verse. Make that the point.' },
  { id: 'colour', prompt: 'Pick a colour. Never name it, but make us see it.' },
  { id: 'alliterate', prompt: 'Write a verse where each line leans on one repeated sound.', card: 'alliterate' },
  { id: 'phone', prompt: 'Your phone lights up. It is not who you hoped for. Who is it?' },
  { id: 'before', prompt: 'The moment just before a decision, not the decision.' },
  { id: 'inherit', prompt: 'Something you inherited that you did not ask for.' },
  { id: 'twice', prompt: 'Write a verse where no word repeats. Every line says something new.', card: 'no-repeat' },
  { id: 'river', prompt: 'Somewhere you go to be alone. What does it sound like?' },
  { id: 'toast', prompt: 'A toast that nobody asked you to give.' },
  { id: 'lie', prompt: 'A small lie that held two people together.' },
  { id: 'season', prompt: 'It is the last week of a season. What is being packed away?' },
  { id: 'voicemail', prompt: 'A voicemail you keep and cannot delete. What does it say?' },
  { id: 'tightloop', prompt: 'Eight syllables a line, no more. Describe a journey.', card: 'tight' },
  { id: 'window', prompt: 'What you see out of the window of the place you wish you were not in.' },
  { id: 'rules', prompt: 'The rules of a house you grew up in, unspoken but obeyed.' },
  { id: 'ask', prompt: 'Four questions to the sea, and one to yourself.', card: 'questions' },
  { id: 'comeback', prompt: 'What you say after a long silence.' },
  { id: 'job', prompt: 'A tired person at a job nobody sings about.' },
  { id: 'echo', prompt: 'Repeat one line three times. Change what it means each time without changing the words.' },
  { id: 'future', prompt: 'A day twenty years from now, told in the present tense.' },
  { id: 'trade', prompt: 'You can trade one memory for another. Which two?' },
  { id: 'quiet', prompt: 'The quietest moment in a loud place.' },
  { id: 'rain', prompt: 'Rain, but not as sadness.' },
  { id: 'promise', prompt: 'A promise made lightly that turned out to be heavy.' },
  { id: 'songwithin', prompt: 'Write the chorus first, as if the verses already exist.' },
  { id: 'wrong', prompt: 'Be wrong on purpose in one line and let the song live with it.' },
];

/** YYYY-MM-DD in local time. */
export function dayKey(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Days since 1970 for a local calendar day, so DST and time of day do not matter. */
function dayNumber(d: Date): number {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}

// fixed shuffle so neighbouring days do not feel like a list in order
const ORDER = (() => {
  const idx = IDEAS.map((_, i) => i);
  let x = 20240611;
  for (let i = idx.length - 1; i > 0; i--) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    const j = x % (i + 1);
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
})();

/** The idea for a day. The same day always gives the same idea; every idea comes round before any repeats. */
export function ideaFor(d: Date = new Date()): DailyIdea {
  const n = dayNumber(d);
  return IDEAS[ORDER[((n % IDEAS.length) + IDEAS.length) % IDEAS.length]];
}
